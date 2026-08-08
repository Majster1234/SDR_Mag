import os
import json
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
import uuid
from sklearn.ensemble import IsolationForest
from sklearn.svm import OneClassSVM
from sklearn.neighbors import LocalOutlierFactor
from sklearn.neural_network import MLPRegressor

ML_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(ML_DIR, "models")
REGISTRY_PATH = os.path.join(MODELS_DIR, "registry.json")


class AutoencoderWrapper:
    """
    Wrapper zamieniający regresor wielowarstwowy w autoenkoder
    kompatybilny ze standardem Scikit-Learn (predict zwraca 1 / -1).
    """
    def __init__(self, contamination=0.03, hidden_layer_sizes=(8, 2, 8), random_state=42):
        self.contamination = contamination
        # Architektura klepsydry: np. 4 wejścia -> 8 -> 2 (wąskie gardło) -> 8 -> 4 wyjścia
        self.model = MLPRegressor(hidden_layer_sizes=hidden_layer_sizes, activation='relu', solver='adam', random_state=random_state, max_iter=1000)
        self.threshold_ = 0.0

    def fit(self, X):
        X_arr = np.asarray(X)
        # Uczymy sieć przewidywać samą siebie (X -> X)
        self.model.fit(X_arr, X_arr)
        
        preds = self.model.predict(X_arr)
        errors = np.mean((X_arr - preds) ** 2, axis=1) # Błąd rekonstrukcji (MSE)
        
        if self.contamination == "auto" or (isinstance(self.contamination, float) and self.contamination <= 0):
            # Bezpieczny margines: średnia + 3 odchylenia standardowe
            self.threshold_ = float(np.mean(errors) + 3 * np.std(errors))
        else:
            self.threshold_ = float(np.percentile(errors, 100 * (1 - float(self.contamination))))
        return self

    def predict(self, X):
        X_arr = np.asarray(X)
        preds = self.model.predict(X_arr)
        errors = np.mean((X_arr - preds) ** 2, axis=1)
        # Jeśli błąd rekonstrukcji przekracza próg -> Anomalia (-1)
        return np.where(errors > self.threshold_, -1, 1)

    def decision_function(self, X):
        X_arr = np.asarray(X)
        preds = self.model.predict(X_arr)
        errors = np.mean((X_arr - preds) ** 2, axis=1)
        # Zwracamy "pewność" algorytmu (im wyższy wynik tym zdrowiej)
        return self.threshold_ - errors

class MLEngine:
    def __init__(self):
        if not os.path.exists(MODELS_DIR):
            os.makedirs(MODELS_DIR)
        if not os.path.exists(REGISTRY_PATH):
            with open(REGISTRY_PATH, 'w') as f:
                json.dump({"active_model_group_id": None, "models": []}, f, indent=4)
        
        # NOWOŚĆ: Słownik przechowujący flagi zatrzymania zadań
        self.active_trainings = {} 

    def cancel_training(self, job_id):
        if job_id in self.active_trainings:
            self.active_trainings[job_id] = True # Ustawiamy flagę "anuluj" na True

    def get_registry(self):
        with open(REGISTRY_PATH, 'r') as f:
            return json.load(f)

    def _save_registry(self, registry_data):
        with open(REGISTRY_PATH, 'w') as f:
            json.dump(registry_data, f, indent=4)

    def _read_csv_with_temps(self, filepath):
        temperatures = {}
        skip_lines = 0
        sep = ','
        
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            for idx, line in enumerate(f):
                if line.startswith('# Temp Start'):
                    parts = line.split('|')[1:]
                    for part in parts:
                        if ':' in part:
                            axis, val = part.split(':')
                            try:
                                temperatures[axis.strip()] = float(val.strip()) / 10.0
                            except ValueError:
                                pass
                elif not line.startswith('#') and len(line.strip()) > 0:
                    sep = ';' if ';' in line else ','
                    skip_lines = idx
                    break
                    
        df = pd.read_csv(filepath, sep=sep, skiprows=skip_lines, engine='python')
        df.columns = df.columns.str.strip()
        
        obj_cols = df.select_dtypes(include=['object']).columns
        for c in obj_cols:
            df[c] = pd.to_numeric(df[c].str.replace(',', '.'), errors='coerce')
            
        df.fillna(0, inplace=True)
        return df, temperatures

    def train_windowed_models_stream(self, job_id, model_name, test_files, reference_file_path, window_size=50, step_size=10, algorithm="Isolation Forest", contamination=0.03, thermal_config=None, auto_optimize=False):
        if thermal_config is None:
            thermal_config = {}

        try:
            self.active_trainings[job_id] = False # Inicjalizacja zadania jako "aktywne"
            yield json.dumps({"status": "progress", "progress": 2, "message": "Inicjalizacja i wczytywanie pliku referencyjnego..."}) + "\n"

            if not test_files or not os.path.exists(reference_file_path):
                yield json.dumps({"status": "error", "message": "Brak plików danych lub referencji."}) + "\n"
                return

# Ładujemy referencję używając nowej metody
            ref_df, _ = self._read_csv_with_temps(reference_file_path)
            axes_columns = [c for c in ref_df.columns if (c.startswith('A') and c not in ['Auto_Label', 'Label']) or c.startswith('Cur')]
            
            axes_dataset = {col: [] for col in axes_columns}
            files_processed = 0

            total_steps = len(test_files) + len(axes_columns)
            current_step = 0

            # 1. FAZA: EKSTRAKCJA CECH
            for file_path in test_files:
                if self.active_trainings.get(job_id):
                    yield json.dumps({"status": "cancelled", "message": "Trening przerwany przez użytkownika."}) + "\n"
                    return
                
                if not os.path.exists(file_path): continue
                
                current_step += 1
                prog = int((current_step / total_steps) * 50)
                file_basename = os.path.basename(file_path)
                yield json.dumps({"status": "progress", "progress": prog, "message": f"Ekstrakcja cech z pliku: {file_basename}..."}) + "\n"

                # Ładujemy dane ORAZ temperatury do kompensacji
                df, test_temps = self._read_csv_with_temps(file_path)
                files_processed += 1
                
                for col in axes_columns:
                    if col in df.columns:
                        is_a = col.startswith('A')
                        
                        eff_window = window_size
                        eff_step = step_size
                        if auto_optimize:
                            eff_window = 50 if is_a else 20
                            eff_step = 10 if is_a else 5

                        min_len = min(len(df[col]), len(ref_df[col]))
                        
                        # NOWOŚĆ: Zabezpieczenie przed krótkimi plikami!
                        if min_len <= eff_window:
                            eff_window = max(3, min_len // 2)
                            eff_step = max(1, eff_window // 2)

                        signal_test = df[col].iloc[:min_len].to_numpy()
                        signal_ref = ref_df[col].iloc[:min_len].to_numpy()
                        
                        k = 1.0
                        if thermal_config and not is_a:
                            axis_key = col.replace("Cur", "A")
                            axis_thermal = thermal_config.get(axis_key, {})
                            a = axis_thermal.get("a", 0.0)
                            b = axis_thermal.get("b", 1.0)
                            
                            t_test = test_temps.get(axis_key, 50.0) if test_temps else 50.0
                            t_test = max(1.0, t_test)
                            if a != 0.0 or b != 1.0:
                                k = a * np.log(t_test) + b
                                
                        residual = (signal_test * k) - signal_ref
                        
                        for i in range(0, len(residual) - eff_window + 1, eff_step):
                            window = residual[i : i + eff_window]
                            if len(window) < eff_window: continue
                            mae = float(np.mean(np.abs(window)))
                            rmse = float(np.sqrt(np.mean(window ** 2)))
                            var = float(np.var(window))
                            ptp = float(np.max(window) - np.min(window))
                            mean_val = float(np.mean(window))
                            axes_dataset[col].append([mae, rmse, var, ptp, mean_val])
                            

            group_id = f"group_{int(datetime.now().timestamp())}"
            trained_axes_list = []
            feature_names = ["mae", "rmse", "var", "ptp", "mean"]

# 2. FAZA: TRENING MODELI (Zajmuje drugie 50% paska)
            for col, samples in axes_dataset.items():
                if self.active_trainings.get(job_id):
                    yield json.dumps({"status": "cancelled", "message": "Trening przerwany przed zapisem."}) + "\n"
                    return
                
                if len(samples) < 3: continue 
                
                current_step += 1
                prog = 50 + int(((current_step - len(test_files)) / len(axes_columns)) * 50)
                
                is_a = col.startswith('A')
                X_train = pd.DataFrame(samples, columns=feature_names)
                
                # ==========================================
                # ✨ PRAWDZIWY AUTO-ML (Dostosowany do CZYSTYCH danych)
                # ==========================================
                if auto_optimize:
                    yield json.dumps({"status": "progress", "progress": prog, "message": f"[AutoML] Szukanie hiperparametrów {algorithm} dla osi: {col}..."}) + "\n"
                    
                    best_score = -float('inf')
                    best_clf = None
                    best_contam = "auto"
                    
                    # SIATKA DLA ZDROWYCH PRZEBIEGÓW (bardzo małe wartości i "auto")
                    if algorithm == "Isolation Forest":
                        grid_contam = ["auto", 0.001, 0.005] # "auto" nie wymusza fałszywych alarmów!
                    else:
                        grid_contam = [0.001, 0.003, 0.005] # Promilowe wartości dla SVM i LOF
                        
                    for c in grid_contam:
                        models_to_test = []
                        if algorithm == "Isolation Forest":
                            for n_param in [50, 100, 150]:
                                models_to_test.append(IsolationForest(contamination=c, n_estimators=n_param, random_state=42))
                        elif algorithm == "One-Class SVM":
                            for g in ["scale", "auto"]:
                                models_to_test.append(OneClassSVM(nu=c, kernel="rbf", gamma=g))
                        elif algorithm == "LOF":
                            c_lof = "auto" if c == "auto" else c
                            for n_neighbors in [10, 20]:
                                models_to_test.append(LocalOutlierFactor(contamination=c_lof, novelty=True, n_neighbors=n_neighbors))
                        elif algorithm == "Autoencoder":
                            c_ae = "auto" if c == "auto" else c
                            # Testujemy 3 architektury ukryte Autoenkodera
                            for layers in [(4, 2, 4), (8, 4, 8), (12, 4, 12)]:
                                models_to_test.append(AutoencoderWrapper(contamination=c_ae, hidden_layer_sizes=layers))
                        
                        for test_clf in models_to_test:
                            try:
                                test_clf.fit(X_train)
                                
                                try:
                                    scores = test_clf.decision_function(X_train)
                                    avg_score = float(np.mean(scores))
                                except AttributeError:
                                    avg_score = float(np.mean(test_clf.predict(X_train)))
                                    
                                if avg_score > best_score:
                                    best_score = avg_score
                                    best_clf = test_clf
                                    best_contam = c
                            except Exception:
                                pass
                                
                    clf = best_clf if best_clf is not None else IsolationForest(contamination="auto", random_state=42)
                    eff_contam = best_contam
                    
                # ==========================================
                # ⚙️ STANDARDOWE UCZENIE RĘCZNE
                # ==========================================
                else:
                    yield json.dumps({"status": "progress", "progress": prog, "message": f"Uczenie struktury algorytmu dla osi: {col}..."}) + "\n"
                    
                    # Jeśli używamy algorytmu IF, a czułość wpisana w interfejsie jest niska (np. 1%), 
                    # wymuszamy bezpieczny tryb "auto", aby nie ciął zdrowych danych.
                    if algorithm == "Isolation Forest":
                        eff_contam = "auto" if contamination <= 0.01 else contamination
                        clf = IsolationForest(contamination=eff_contam, random_state=42, n_estimators=100)
                    elif algorithm == "One-Class SVM":
                        eff_contam = contamination if contamination > 0 else 0.001
                        clf = OneClassSVM(nu=eff_contam, kernel="rbf", gamma="auto")
                    elif algorithm == "LOF":
                        eff_contam = "auto" if contamination <= 0.01 else contamination
                        clf = LocalOutlierFactor(contamination=eff_contam, novelty=True, n_neighbors=20)
                    elif algorithm == "Autoencoder":
                        eff_contam = "auto" if contamination <= 0.01 else contamination
                        clf = AutoencoderWrapper(contamination=eff_contam, hidden_layer_sizes=(8, 2, 8))
                    
                    clf.fit(X_train)

                # ==========================================
                # OBLICZANIE WYNIKÓW I ZAPIS
                # ==========================================
                preds = clf.predict(X_train)
                vis_df = X_train.copy()
                vis_df['prediction'] = preds.astype(int)
                
                try:
                    scores = clf.decision_function(X_train)
                    vis_df['score'] = scores
                except AttributeError:
                    vis_df['score'] = 1.0 

                anomalies = vis_df[vis_df['prediction'] == -1]
                normals = vis_df[vis_df['prediction'] == 1]

                if len(normals) > 300:
                    normals = normals.sort_values(by='score')
                    vis_df = pd.concat([anomalies, normals.iloc[:100], normals.iloc[100:].sample(n=200, random_state=42)])
                else:
                    vis_df = pd.concat([anomalies, normals])

                axis_filename = f"{group_id}_{col}.pkl"
                axis_model_path = os.path.join(MODELS_DIR, axis_filename)
                
                saved_window = 50 if (auto_optimize and is_a) else (20 if auto_optimize else window_size)
                saved_step = 10 if (auto_optimize and is_a) else (5 if auto_optimize else step_size)

                payload = {
                    "axis": col, "model": clf, "feature_names": feature_names,
                    "window_size": saved_window, "step_size": saved_step,
                    "vis_data": vis_df.drop(columns=['score'], errors='ignore').to_dict(orient='records')
                }
                joblib.dump(payload, axis_model_path)
                trained_axes_list.append(col)

            if not trained_axes_list:
                yield json.dumps({"status": "error", "message": "Brak wygenerowanych modeli (za mało danych)."}) + "\n"
                return

            # Zapis do rejestru
            registry = self.get_registry()
            new_group_entry = {
                "group_id": group_id, "name": model_name, "algorithm": algorithm,
                "contamination": contamination if not auto_optimize else -1,
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "files_used_count": files_processed,
                "window_size": window_size if not auto_optimize else -1,
                "step_size": step_size if not auto_optimize else -1,
                "axes_trained": trained_axes_list,
                "comment": ""
            }
            registry["models"].insert(0, new_group_entry) 
            if registry.get("active_model_group_id") is None:
                registry["active_model_group_id"] = group_id
            self._save_registry(registry)

            # KOŃCOWY WYNIK
            yield json.dumps({
                "status": "success", "progress": 100, "message": "Trening zakończony sukcesem!", 
                "group_id": group_id, "axes_trained": trained_axes_list
            }) + "\n"

        except Exception as e:
            yield json.dumps({"status": "error", "message": f"Błąd w Pythonie: {str(e)}"}) + "\n"
        finally:
            # Sprzątanie po zakończeniu
            if job_id in self.active_trainings:
                del self.active_trainings[job_id]

    def get_all_model_visualization_data(self, group_id):
        registry = self.get_registry()
        target_group = next((g for g in registry["models"] if g["group_id"] == group_id), None)
        
        if not target_group:
            return {"error": "Nie znaleziono modelu w rejestrze."}
            
        result_data = {}
        for axis in target_group["axes_trained"]:
            filepath = os.path.join(MODELS_DIR, f"{group_id}_{axis}.pkl")
            if os.path.exists(filepath):
                try:
                    payload = joblib.load(filepath)
                    result_data[axis] = payload.get("vis_data", [])
                except Exception:
                    pass
                    
        return {"status": "success", "data": result_data}

    def evaluate_file(self, group_id, axis, test_file_path, reference_file_path, thermal_config=None):
        if thermal_config is None:
            thermal_config = {}
            
        if not os.path.exists(test_file_path) or not os.path.exists(reference_file_path):
            return {"status": "error", "message": "Brak pliku badanego lub referencyjnego na dysku."}
        
        model_path = os.path.join(MODELS_DIR, f"{group_id}_{axis}.pkl")
        if not os.path.exists(model_path):
            return {"status": "error", "message": "Brak wyuczonego modelu dla tej osi."}
            
        try:
            payload = joblib.load(model_path)
            model = payload["model"]
            window_size = payload["window_size"]
            step_size = payload["step_size"]
            feature_names = payload["feature_names"]
            
            # Wczytywanie nową metodą (z obsługą temperatur)
            test_df, test_temps = self._read_csv_with_temps(test_file_path)
            ref_df, ref_temps = self._read_csv_with_temps(reference_file_path)
            
            if axis not in test_df.columns or axis not in ref_df.columns:
                return {"status": "error", "message": f"Pliki nie zawierają wybranej osi ({axis})."}
                
            min_len = min(len(test_df), len(ref_df))
            t_vals = test_df[axis].iloc[:min_len].to_numpy()
            r_vals = ref_df[axis].iloc[:min_len].to_numpy()
            
            # --- NOWOŚĆ: KOMPENSACJA TERMICZNA DLA SYMULACJI ---
            k = 1.0
            if thermal_config and not axis.startswith('A'):
                axis_key = axis.replace("Cur", "A")
                axis_thermal = thermal_config.get(axis_key, {})
                a = axis_thermal.get("a", 0.0)
                b = axis_thermal.get("b", 1.0)
                t_test = test_temps.get(axis_key, 50.0) if test_temps else 50.0
                t_test = max(1.0, t_test)
                if a != 0.0 or b != 1.0:
                    k = a * np.log(t_test) + b

            # Obliczamy uchyb na skompensowanych danych!
            residual = (t_vals * k) - r_vals
            
            time_col = next((c for c in ref_df.columns if 'time' in c.lower() or 'czas' in c.lower()), None)
            if time_col:
                start_time = float(ref_df[time_col].iloc[0])
                times = (ref_df[time_col].values[:min_len] - start_time) / 1000.0
            else:
                times = np.arange(min_len, dtype=float)
                
            is_anomaly = np.zeros(min_len, dtype=bool)
            
            # --- ZMIANA: Tablice do przechowywania cech ML w czasie ---
            mae_arr = np.full(min_len, np.nan)
            rmse_arr = np.full(min_len, np.nan)
            var_arr = np.full(min_len, np.nan)
            ptp_arr = np.full(min_len, np.nan)
            mean_arr = np.full(min_len, np.nan)
            
            for i in range(0, min_len - window_size + 1, step_size):
                window = residual[i : i + window_size]
                if len(window) < window_size: continue
                
                mae = float(np.mean(np.abs(window)))
                rmse = float(np.sqrt(np.mean(window ** 2)))
                var = float(np.var(window))
                ptp = float(np.max(window) - np.min(window))
                mean_val = float(np.mean(window))
                
                # Zapisujemy wartości dla danego przedziału kroku
                end_idx = min(i + step_size, min_len)
                mae_arr[i:end_idx] = mae
                rmse_arr[i:end_idx] = rmse
                var_arr[i:end_idx] = var
                ptp_arr[i:end_idx] = ptp
                mean_arr[i:end_idx] = mean_val
                
                X_test = pd.DataFrame([[mae, rmse, var, ptp, mean_val]], columns=feature_names)
                prediction = model.predict(X_test)[0]
                
                if prediction == -1: 
                    is_anomaly[i : i + window_size] = True

            # Wypełniamy puste miejsca (na marginesach) by wykres był ciągły
            mae_arr = pd.Series(mae_arr).ffill().bfill().values
            rmse_arr = pd.Series(rmse_arr).ffill().bfill().values
            var_arr = pd.Series(var_arr).ffill().bfill().values
            ptp_arr = pd.Series(ptp_arr).ffill().bfill().values
            mean_arr = pd.Series(mean_arr).ffill().bfill().values

            # NOWOŚĆ: Skalowanie cech do 0-100% dla zunifikowanego wykresu
            def scale_to_100(arr):
                mx = np.nanmax(arr)
                if mx > 0:
                    return (arr / mx) * 100.0
                return np.zeros_like(arr)

            mae_100 = scale_to_100(mae_arr)
            rmse_100 = scale_to_100(rmse_arr)
            var_100 = scale_to_100(var_arr)
            ptp_100 = scale_to_100(ptp_arr)
            mean_100 = scale_to_100(np.abs(mean_arr))
                    
            chart_data = []
            for i in range(min_len):
                chart_data.append({
                    "Time": round(float(times[i]), 3),
                    "Referencja": round(float(r_vals[i]), 4),
                    "Badany": round(float(t_vals[i] * k), 4),
                    "BadanyRaw": round(float(t_vals[i]), 4),
                    "Roznica": round(float(residual[i]), 4),
                    # Prawdziwe wartości do Tooltipa
                    "MAE": round(float(mae_arr[i]), 4),       
                    "RMSE": round(float(rmse_arr[i]), 4),     
                    "VAR": round(float(var_arr[i]), 4),       
                    "PTP": round(float(ptp_arr[i]), 4),
                    "MEAN": round(float(mean_arr[i]), 4),
                    # Wartości w % do narysowania linii
                    "MAE_100": round(float(mae_100[i]), 1),
                    "RMSE_100": round(float(rmse_100[i]), 1),
                    "VAR_100": round(float(var_100[i]), 1),
                    "PTP_100": round(float(ptp_100[i]), 1),
                    "MEAN_100": round(float(mean_100[i]), 1)
                })
                
            violation_areas = []
            out_indices = np.where(is_anomaly)[0]
            if len(out_indices) > 0:
                breaks = np.where(np.diff(out_indices) > 1)[0]
                starts = np.insert(out_indices[breaks + 1], 0, out_indices[0])
                ends = np.append(out_indices[breaks], out_indices[-1])
                for s, e in zip(starts, ends):
                    violation_areas.append({
                        "start": round(float(times[s]), 3), 
                        "end": round(float(times[e]), 3)
                    })
                    
            anomaly_percent = float(is_anomaly.mean() * 100)
            
            return {
                "status": "success",
                "chartData": chart_data,
                "violationAreas": violation_areas,
                "anomalyPercent": round(anomaly_percent, 2)
            }
            
        except Exception as e:
            return {"status": "error", "message": f"Błąd weryfikacji: {str(e)}"}

    def delete_model_group(self, group_id):
        try:
            registry = self.get_registry()
            group_to_delete = next((g for g in registry["models"] if g["group_id"] == group_id), None)
            
            if not group_to_delete:
                return {"status": "error", "message": "Nie znaleziono modelu w rejestrze."}
                
            for axis in group_to_delete.get("axes_trained", []):
                file_path = os.path.join(MODELS_DIR, f"{group_id}_{axis}.pkl")
                if os.path.exists(file_path):
                    os.remove(file_path)
                    
            registry["models"] = [g for g in registry["models"] if g["group_id"] != group_id]
            
            if registry.get("active_model_group_id") == group_id:
                registry["active_model_group_id"] = None
                
            self._save_registry(registry)
            return {"status": "success", "message": f"Model usunięty pomyślnie."}
        except Exception as e:
            return {"status": "error", "message": f"Błąd podczas usuwania z dysku: {str(e)}"}

    def update_model_comment(self, group_id, comment):
        try:
            registry = self.get_registry()
            target_group = next((g for g in registry["models"] if g["group_id"] == group_id), None)
            
            if not target_group:
                return {"status": "error", "message": "Nie znaleziono modelu w rejestrze."}
                
            target_group["comment"] = comment
            self._save_registry(registry)
            
            return {"status": "success", "message": "Komentarz został zapisany."}
        except Exception as e:
            return {"status": "error", "message": f"Błąd podczas zapisywania komentarza: {str(e)}"}

        
ml_engine = MLEngine()
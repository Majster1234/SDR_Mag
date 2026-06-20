# backend/ml/ml_engine.py
import os
import json
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.ensemble import IsolationForest

ML_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(ML_DIR, "models")
REGISTRY_PATH = os.path.join(MODELS_DIR, "registry.json")

class MLEngine:
    def __init__(self):
        if not os.path.exists(MODELS_DIR):
            os.makedirs(MODELS_DIR)
        if not os.path.exists(REGISTRY_PATH):
            with open(REGISTRY_PATH, 'w') as f:
                json.dump({"active_model_group_id": None, "models": []}, f, indent=4)

    def get_registry(self):
        with open(REGISTRY_PATH, 'r') as f:
            return json.load(f)

    def _save_registry(self, registry_data):
        with open(REGISTRY_PATH, 'w') as f:
            json.dump(registry_data, f, indent=4)

    def _read_and_clean_csv(self, filepath):
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            first_line = f.readline()
            sep = ';' if ';' in first_line else ','
            
        df = pd.read_csv(filepath, sep=sep, engine='python')
        df.columns = df.columns.str.strip()
        
        obj_cols = df.select_dtypes(include=['object']).columns
        for c in obj_cols:
            df[c] = pd.to_numeric(df[c].str.replace(',', '.'), errors='coerce')
            
        df.fillna(0, inplace=True)
        return df


    def get_all_model_visualization_data(self, group_id):
        registry = self.get_registry()
        # Szukamy grupy w rejestrze, żeby wiedzieć, jakie osie ma wyuczone
        target_group = next((g for g in registry["models"] if g["group_id"] == group_id), None)
        
        if not target_group:
            return {"error": "Nie znaleziono modelu w rejestrze."}
            
        result_data = {}
        # Ładujemy z dysku wszystkie wyuczone osie w jednej pętli
        for axis in target_group["axes_trained"]:
            filepath = os.path.join(MODELS_DIR, f"{group_id}_{axis}.pkl")
            if os.path.exists(filepath):
                try:
                    payload = joblib.load(filepath)
                    result_data[axis] = payload.get("vis_data", [])
                except Exception:
                    pass
                    
        return {"status": "success", "data": result_data}

    def train_windowed_models(self, model_name, training_folder_path, reference_file_path, window_size=50, step_size=10, contamination=0.03):
        if not os.path.exists(training_folder_path) or not os.path.exists(reference_file_path):
            return {"status": "error", "message": f"Brak folderu danych lub pliku referencji."}

        try:
            ref_df = self._read_and_clean_csv(reference_file_path)
            axes_columns = [c for c in ref_df.columns if (c.startswith('A') and c not in ['Auto_Label', 'Label']) or c.startswith('Cur')]
            
            axes_dataset = {col: [] for col in axes_columns}
            files_processed = 0

            for file_name in os.listdir(training_folder_path):
                if file_name.lower().endswith('.csv') and "referenc" not in file_name.lower():
                    file_path = os.path.join(training_folder_path, file_name)
                    df = self._read_and_clean_csv(file_path)
                    files_processed += 1
                    
                    for col in axes_columns:
                        if col in df.columns:
                            min_len = min(len(df[col]), len(ref_df[col]))
                            signal_test = df[col].iloc[:min_len].to_numpy()
                            signal_ref = ref_df[col].iloc[:min_len].to_numpy()
                            
                            residual = signal_test - signal_ref
                            
                            for i in range(0, len(residual) - window_size + 1, step_size):
                                window = residual[i : i + window_size]
                                if len(window) < window_size: continue
                                
                                mae = float(np.mean(np.abs(window)))
                                rmse = float(np.sqrt(np.mean(window ** 2)))
                                var = float(np.var(window))
                                ptp = float(np.max(window) - np.min(window))
                                
                                axes_dataset[col].append([mae, rmse, var, ptp])

            group_id = f"group_{int(datetime.now().timestamp())}"
            trained_axes_list = []
            feature_names = ["mae", "rmse", "var", "ptp"]

            for col, samples in axes_dataset.items():
                if len(samples) < 3:
                    continue 
                
                X_train = pd.DataFrame(samples, columns=feature_names)
                clf = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
                clf.fit(X_train)
                
                # ZMIANA: Wyciągamy predykcje (-1 to anomalia, 1 to norma) i zapisujemy do wykresu
                preds = clf.predict(X_train)
                vis_df = X_train.copy()
                vis_df['prediction'] = preds.astype(int) # Ważne: rzutowanie na standardowy int!
                
                # Zabezpieczenie przed przeładowaniem RAM przeglądarki - max 2000 punktów do wykresu
                if len(vis_df) > 2000:
                    vis_df = vis_df.sample(n=2000, random_state=42)
                
                axis_filename = f"{group_id}_{col}.pkl"
                axis_model_path = os.path.join(MODELS_DIR, axis_filename)
                
                payload = {
                    "axis": col,
                    "model": clf,
                    "feature_names": feature_names,
                    "window_size": window_size,
                    "step_size": step_size,
                    "vis_data": vis_df.to_dict(orient='records') # Zapisujemy chmurę punktów!
                }
                joblib.dump(payload, axis_model_path)
                trained_axes_list.append(col)

            if not trained_axes_list:
                return {"status": "error", "message": "Nie udało się wytrenować modelu dla żadnej osi. Pliki są zbyt krótkie."}

            registry = self.get_registry()
            new_group_entry = {
                "group_id": group_id,
                "name": model_name,
                "algorithm": "Windowed Isolation Forest",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "files_used_count": files_processed,
                "window_size": window_size,
                "step_size": step_size,
                "axes_trained": trained_axes_list
            }
            registry["models"].append(new_group_entry)
            
            if registry.get("active_model_group_id") is None:
                registry["active_model_group_id"] = group_id
                
            self._save_registry(registry)

            return {
                "status": "success",
                "message": "Zakończono operację ML na danych robota.",
                "group_id": group_id,
                "axes_trained": trained_axes_list,
                "files_processed": files_processed
            }

        except Exception as e:
            return {"status": "error", "message": f"Zatrzymano proces (Wyjątek Pythona): {str(e)}"}

    # NOWA FUNKCJA: Pobiera zapisane punkty z pliku .pkl
    def get_model_visualization_data(self, group_id, axis):
        filepath = os.path.join(MODELS_DIR, f"{group_id}_{axis}.pkl")
        if not os.path.exists(filepath):
            return {"error": "Brak pliku modelu dla tej osi na dysku."}
        try:
            payload = joblib.load(filepath)
            return {"status": "success", "data": payload.get("vis_data", [])}
        except Exception as e:
            return {"error": f"Błąd odczytu: {str(e)}"}

    def delete_model_group(self, group_id):
        try:
            registry = self.get_registry()
            group_to_delete = next((g for g in registry["models"] if g["group_id"] == group_id), None)
            
            if not group_to_delete:
                return {"status": "error", "message": "Nie znaleziono modelu w rejestrze."}
                
            # 1. Usuwanie fizycznych plików .pkl z dysku
            for axis in group_to_delete.get("axes_trained", []):
                file_path = os.path.join(MODELS_DIR, f"{group_id}_{axis}.pkl")
                if os.path.exists(file_path):
                    os.remove(file_path)
                    
            # 2. Usuwanie wpisu z pliku JSON
            registry["models"] = [g for g in registry["models"] if g["group_id"] != group_id]
            
            # 3. Jeśli usunęliśmy aktywny model, resetujemy wskaźnik
            if registry.get("active_model_group_id") == group_id:
                registry["active_model_group_id"] = None
                
            self._save_registry(registry)
            return {"status": "success", "message": f"Model usunięty pomyślnie."}
        except Exception as e:
            return {"status": "error", "message": f"Błąd podczas usuwania z dysku: {str(e)}"}
    def evaluate_file(self, group_id, axis, test_file_path, reference_file_path):
        """Ewaluuje konkretny plik używając wyuczonego lasu izolacji (Isolation Forest)."""
        if not os.path.exists(test_file_path) or not os.path.exists(reference_file_path):
            return {"status": "error", "message": "Brak pliku badanego lub referencyjnego na dysku."}
            
        model_path = os.path.join(MODELS_DIR, f"{group_id}_{axis}.pkl")
        if not os.path.exists(model_path):
            return {"status": "error", "message": "Brak wyuczonego modelu dla tej osi."}
            
        try:
            # 1. Ładowanie logiki modelu z pliku .pkl
            payload = joblib.load(model_path)
            model = payload["model"]
            window_size = payload["window_size"]
            step_size = payload["step_size"]
            feature_names = payload["feature_names"]
            
            # 2. Czytanie i czyszczenie plików CSV
            test_df = self._read_and_clean_csv(test_file_path)
            ref_df = self._read_and_clean_csv(reference_file_path)
            
            if axis not in test_df.columns or axis not in ref_df.columns:
                return {"status": "error", "message": f"Pliki nie zawierają wybranej osi ({axis})."}
                
            min_len = min(len(test_df), len(ref_df))
            t_vals = test_df[axis].iloc[:min_len].to_numpy()
            r_vals = ref_df[axis].iloc[:min_len].to_numpy()
            residual = t_vals - r_vals
            
            # Ekstrakcja czasu (w sekundach)
            time_col = next((c for c in ref_df.columns if 'time' in c.lower() or 'czas' in c.lower()), None)
            if time_col:
                start_time = float(ref_df[time_col].iloc[0])
                times = (ref_df[time_col].values[:min_len] - start_time) / 1000.0
            else:
                times = np.arange(min_len, dtype=float)
                
            # Tablica boolowska z informacją, czy w danej próbce występuje anomalia
            is_anomaly = np.zeros(min_len, dtype=bool)
            
            # 3. PĘTLA OKIENKOWA - DIAGNOSTYKA NA ŻYWO
            for i in range(0, min_len - window_size + 1, step_size):
                window = residual[i : i + window_size]
                if len(window) < window_size: continue
                
                # Obliczanie cech dla tego okienka
                mae = float(np.mean(np.abs(window)))
                rmse = float(np.sqrt(np.mean(window ** 2)))
                var = float(np.var(window))
                ptp = float(np.max(window) - np.min(window))
                
                X_test = pd.DataFrame([[mae, rmse, var, ptp]], columns=feature_names)
                
                # ZAPYTANIE DO AI: Jaki jest werdykt dla tego okienka? (-1 awaria, 1 norma)
                prediction = model.predict(X_test)[0]
                
                if prediction == -1: 
                    # Nakładamy 'czerwony stempel' na te 50 milisekund w głównej tablicy
                    is_anomaly[i : i + window_size] = True
                    
            # 4. PRZYGOTOWANIE DANYCH DO WYKRESU LINIOWEGO W REACT (jak w AnalizaPrzebiegow)
            chart_data = []
            for i in range(min_len):
                chart_data.append({
                    "Time": round(float(times[i]), 3),
                    "Referencja": round(float(r_vals[i]), 4),
                    "Badany": round(float(t_vals[i]), 4),
                    "Roznica": round(float(residual[i]), 4)
                })
                
            # Zbieranie czerwonych "stref" (violation_areas) by podświetlić tło wykresu
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
            import traceback
            traceback.print_exc()
            return {"status": "error", "message": f"Błąd weryfikacji: {str(e)}"}    
ml_engine = MLEngine()
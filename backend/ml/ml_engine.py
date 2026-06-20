# backend/ml/engine.py
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

    def train_windowed_models(self, model_name, training_folder_path, reference_file_path, window_size=50, step_size=10, contamination=0.03):
        """
        Uczy niezależne modele Isolation Forest dla każdej osi z osobna,
        tnąc sygnały na ruchome okna czasowe.
        """
        if not os.path.exists(training_folder_path) or not os.path.exists(reference_file_path):
            return {"status": "error", "message": f"Brak folderu danych lub pliku referencji."}

        try:
            ref_df = pd.read_csv(reference_file_path)
            
            # Dynamicznie wykrywamy osie (pomijamy czas/timestamp)
            axes_columns = [col for col in ref_df.columns if col.lower() not in ['time', 'timestamp']]
            
            # Słownik przechowujący wyekstrahowane okienka (cechy) dla każdej osi osobno
            # Struktura: { 'A1': [ [var, rmse, ptp], [var, rmse, ptp], ... ], 'A2': [...] }
            axes_dataset = {col: [] for col in axes_columns}
            files_processed = 0

            # 1. ITERACJA PO PLIKACH CSV (ZBIERANIE CECH OKIENKOWYCH)
            for file_name in os.listdir(training_folder_path):
                if file_name.lower().endswith('.csv') and "referenc" not in file_name.lower():
                    file_path = os.path.join(training_folder_path, file_name)
                    df = pd.read_csv(file_path)
                    files_processed += 1
                    
                    for col in axes_columns:
                        if col in df.columns:
                            # Dopasowanie długości, żeby uchyb się zgadzał
                            min_len = min(len(df[col]), len(ref_df[col]))
                            signal_test = df[col].iloc[:min_len].to_numpy()
                            signal_ref = ref_df[col].iloc[:min_len].to_numpy()
                            
                            # Obliczamy czysty uchyb prądu (dane są już znormalizowane 0-100% z kontrolera!)
                            residual = signal_test - signal_ref
                            
                            # PĘTLA OKIENKOWA (Sliding Window)
                            for i in range(0, len(residual) - window_size, step_size):
                                window = residual[i : i + window_size]
                                
                                # Wyliczamy statystyki mikro-anomalii dla tego konkretnego okienka
                                mae = float(np.mean(np.abs(window)))
                                rmse = float(np.sqrt(np.mean(window ** 2)))
                                var = float(np.var(window))
                                ptp = float(np.max(window) - np.min(window))
                                
                                axes_dataset[col].append([mae, rmse, var, ptp])

            # 2. TRENOWANIE INDYWIDUALNYCH MODELI DLA KAŻDEJ OSI
            group_id = f"group_{int(datetime.now().timestamp())}"
            trained_axes_list = []
            feature_names = ["mae", "rmse", "var", "ptp"]

            for col, samples in axes_dataset.items():
                if len(samples) < 10:
                    continue # Za mało okienek dla tej osi, pomiń
                
                X_train = pd.DataFrame(samples, columns=feature_names)
                
                # Uczenie dedykowanego lasu izolacji dla danej osi
                clf = IsolationForest(contamination=contamination, random_state=42, n_estimators=100)
                clf.fit(X_train)
                
                # Zapisujemy model osi pod unikalną nazwą pliku
                axis_filename = f"{group_id}_{col}.pkl"
                axis_model_path = os.path.join(MODELS_DIR, axis_filename)
                
                payload = {
                    "axis": col,
                    "model": clf,
                    "feature_names": feature_names,
                    "window_size": window_size,
                    "step_size": step_size
                }
                joblib.dump(payload, axis_model_path)
                trained_axes_list.append(col)

            if not trained_axes_list:
                return {"status": "error", "message": "Nie udało się wytrenować modelu dla żadnej osi (brak danych)."}

            # 3. ZAPIS DO REJESTRU BAZY JSON
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

            print(f"[ML ENGINE] Sukces. Wytrenowano grupę modeli {group_id} dla osi: {trained_axes_list}")
            return {
                "status": "success",
                "message": "Pomyślnie wytrenowano niezależne modele dla osi robota.",
                "group_id": group_id,
                "axes_trained": trained_axes_list,
                "files_processed": files_processed
            }

        except Exception as e:
            return {"status": "error", "message": f"Błąd krytyczny uczenia: {str(e)}"}

ml_engine = MLEngine()
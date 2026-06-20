# backend/ml/feature_calc.py
import pandas as pd
import numpy as np
import os

def extract_features_from_csv(file_path, reference_df):
    """
    Wczytuje badany plik CSV, oblicza uchyb (residual) względem 
    ramki referencyjnej i wyciąga statystyki dla każdej osi/sygnału.
    """
    try:
        df = pd.read_csv(file_path)
        features = {}
        
        # Iterujemy po kolumnach, które są wspólne dla referencji i pliku badanego
        for col in reference_df.columns:
            if col in df.columns and col.lower() != 'time' and col.lower() != 'timestamp':
                
                # Dopasowujemy długość sygnałów (bierzemy krótszy, by uniknąć błędów wymiarów)
                min_len = min(len(df[col]), len(reference_df[col]))
                signal_test = df[col].iloc[:min_len].to_numpy()
                signal_ref = reference_df[col].iloc[:min_len].to_numpy()
                
                # OBLICZAMY UCHYB (Różnica sygnałów)
                residual = signal_test - signal_ref
                
                # EKSTRAKCJA CECH STATYSTYCZNYCH
                features[f"{col}_mae"] = float(np.mean(np.abs(residual)))
                features[f"{col}_rmse"] = float(np.sqrt(np.mean(residual ** 2)))
                features[f"{col}_var"] = float(np.var(residual))
                features[f"{col}_ptp"] = float(np.max(residual) - np.min(residual))
                
        return features
    except Exception as e:
        print(f"Błąd ekstrakcji cech z pliku {file_path}: {e}")
        return None
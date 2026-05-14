import os
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
import numpy as np
from backend.file_system import get_directory_tree, create_robot_structure, delete_file, swap_reference_file
from backend.websocket_manager import manager
from backend.config import BASE_DIR, DEFAULT_ROBOTS, ROOT_PATH
import math
import json
from typing import Dict, Any 

router = APIRouter()

class RobotCreate(BaseModel):
    name: str

class FilePathReq(BaseModel):
    path: str

class FileDataReq(BaseModel):
    path: str

class RobotInfoReq(BaseModel):
    robot_name: str

CONFIG_FILE = os.path.join(ROOT_PATH, "robots_config.json")



def load_robot_configs():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_robot_configs(data):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

@router.get("/api/robot-config/{robot_name}")
def get_robot_config(robot_name: str):
    configs = load_robot_configs()
    return configs.get(robot_name, {"description": "", "model": "", "location": ""})

@router.post("/api/robot-config/{robot_name}")
def update_robot_config(robot_name: str, config: Dict[str, Any]):
    configs = load_robot_configs()
    if robot_name not in configs:
        configs[robot_name] = {}
    
    configs[robot_name].update(config)
    save_robot_configs(configs)
    return {"message": "Zapisano pomyślnie"}

@router.get("/api/robots")
def get_robots_tree():
    return get_directory_tree()

@router.post("/api/robots")
def add_robot(robot: RobotCreate):
    success = create_robot_structure(robot.name)
    if not success:
        raise HTTPException(status_code=400, detail="Błędna nazwa lub robot już istnieje.")
    return get_directory_tree()

@router.post("/api/file-info")
def get_file_info(req: FilePathReq):
    full_path = os.path.join(ROOT_PATH, req.path)
    
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Plik nie istnieje na dysku.")

    try:
        # Zmiana: Używamy getmtime (Data modyfikacji). W przypadku logów przenoszonych
        # między komputerami, to właśnie ta data zachowuje oryginalny czas zapisu przez robota.
        m_time = os.path.getctime(full_path)
        record_date = datetime.fromtimestamp(m_time).strftime('%Y-%m-%d %H:%M:%S')

        df = pd.read_csv(full_path, sep=None, engine='python')
        columns = df.columns.tolist()

        duration = None
        if 'Time' in df.columns:
            # Zmiana: Dzielimy przez 1000.0, aby zamienić milisekundy na sekundy
            duration = float(df['Time'].iloc[-1] - df['Time'].iloc[0]) / 1000.0

        return {
            "is_valid": True,
            "record_date": record_date,  # <-- nowa nazwa
            "columns": columns,
            "duration": duration,
            "rows_count": len(df)
        }
    except Exception as e:
        return {
            "is_valid": False,
            "error_msg": f"Nieprawidłowy format pliku. Szczegóły: {str(e)}"
        }

@router.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    target_dir = os.path.join(BASE_DIR, DEFAULT_ROBOTS[0], "Przebieg_do_badania")
    file_location = os.path.join(target_dir, file.filename)
    
    with open(file_location, "wb+") as file_object:
        file_object.write(await file.read())
    
    with open(file_location, "r", encoding="utf-8", errors="ignore") as f:
        content_preview = f.read(200)
        
    return {"filename": file.filename, "content": content_preview, "path": file_location}

@router.post("/api/file-data")
def get_file_data(req: FileDataReq):
    full_path = os.path.join(ROOT_PATH, req.path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Plik nie istnieje.")

    try:
        df = pd.read_csv(full_path, sep=None, engine='python')
        
        # Opcjonalnie: upewniamy się, że nie ma pustych wartości (NaN) w pliku, 
        # bo format JSON ich nie obsługuje
        df = df.fillna(0)
        
        # Normalizacja czasu: startujemy od 0.0 sekund i dzielimy przez 1000
        if 'Time' in df.columns:
            start_time = df['Time'].iloc[0]
            df['Time'] = (df['Time'] - start_time) / 1000.0
            
        # Zamieniamy DataFrame na listę słowników (idealny format dla Recharts)
        data = df.to_dict(orient='records')
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class KinematicsReq(BaseModel):
    path: str

@router.post("/api/kinematics")
def calculate_kinematics(req: KinematicsReq):
    file_path = os.path.join(ROOT_PATH, req.path)
    if not os.path.exists(file_path):
        return {"error": "Plik nie istnieje"}

    try:
        # ZMIANA: Automatyczne wykrywanie separatora i łatanaie pustych wartości (NaN)
        df = pd.read_csv(file_path, sep=None, engine='python')
        df = df.fillna(0)
        
        # Filtrujemy tylko kolumny osi
        if not all(col in df.columns for col in ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']):
            return {"error": "Brak kompletnych danych A1-A6"}

        # Definiujemy kinematykę z użyciem Numpy dla prędkości
        d1, a1, a2, a3, d4, d6 = 0.175, 0.260, 0.480, 0.035, 0.570, 0.158
        
        def Tz(d): return np.array([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, d], [0, 0, 0, 1]])
        def Tx(a): return np.array([[1, 0, 0, a], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
        def Rz(th): return np.array([[np.cos(th), -np.sin(th), 0, 0], [np.sin(th), np.cos(th), 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
        def Ry(th): return np.array([[np.cos(th), 0, np.sin(th), 0], [0, 1, 0, 0], [-np.sin(th), 0, np.cos(th), 0], [0, 0, 0, 1]])
        def Rx(th): return np.array([[1, 0, 0, 0], [0, np.cos(th), -np.sin(th), 0], [0, np.sin(th), np.cos(th), 0], [0, 0, 0, 1]])

        T0 = np.eye(4) @ Tz(0.5)

        all_points = []
        
        np_data = df[['A1', 'A2', 'A3', 'A4', 'A5', 'A6']].to_numpy()
        for row in np_data:
            q = np.radians([row[0]-90, row[1]+90, row[2], row[3], row[4], row[5]])
            
            T1 = T0 @ Rz(-q[0]) @ Tz(d1)
            T2 = T1 @ Tx(a1) @ Ry(q[1])
            T3 = T2 @ Tz(a2) @ Ry(q[2])
            T4 = T3 @ Tx(a3) @ Tz(d4) @ Rx(q[3])
            T5 = T4 @ Rx(-q[4])
            T6 = T5 @ Rz(q[5]) @ Tx(d6)
            
            # Ekstrakcja pozycji (X, Y, Z) z macierzy
            points = [T[:3, 3].tolist() for T in [T0, T1, T2, T3, T4, T5, T6]]
            all_points.append(points)

        return {"trajectory": all_points}

    except Exception as e:
        return {"error": str(e)}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

class FileActionReq(BaseModel):
    path: str

@router.post("/api/file/delete")
def api_delete_file(req: FileActionReq):
    success, error = delete_file(req.path)
    if not success:
        raise HTTPException(status_code=400, detail=error)
    return {"message": "Plik usunięto pomyślnie."}

@router.post("/api/file/set-reference")
def api_set_reference(req: FileActionReq):
    success, error = swap_reference_file(req.path)
    if not success:
        raise HTTPException(status_code=400, detail=error)
    return {"message": "Zamieniono plik referencyjny."}

@router.post("/api/robot-info")
def get_robot_info(req: RobotInfoReq):
    # Ścieżka do wybranego robota (np. Roboty/Robot_1)
    robot_path = os.path.join(ROOT_PATH, BASE_DIR, req.robot_name)
    if not os.path.exists(robot_path):
        raise HTTPException(status_code=404, detail="Robot nie istnieje.")
    
    # Szukamy folderu referencyjnego
    ref_dir = os.path.join(robot_path, "Przebieg_referencyjny")
    ref_file_info = None
    
    if os.path.exists(ref_dir):
        # Pobieramy pierwszy plik z folderu
        files = [f for f in os.listdir(ref_dir) if os.path.isfile(os.path.join(ref_dir, f))]
        if files:
            ref_file_name = files[0]
            ref_file_path = os.path.join(ref_dir, ref_file_name)
            
            try:
                # 1. Data dodania (modyfikacji)
                m_time = os.path.getmtime(ref_file_path)
                record_date = datetime.fromtimestamp(m_time).strftime('%Y-%m-%d %H:%M:%S')
                duration = None
                
                # 2. Czas trwania z Pandas (jeśli plik jest poprawnym CSV)
                try:
                    df = pd.read_csv(ref_file_path, sep=None, engine='python')
                    if 'Time' in df.columns:
                        duration = float(df['Time'].iloc[-1] - df['Time'].iloc[0]) / 1000.0
                except Exception:
                    pass # Zignoruj błąd z Pandas, zwrócimy chociaż datę
                    
                ref_file_info = {
                    "name": ref_file_name,
                    "record_date": record_date,
                    "duration": duration
                }
            except Exception:
                pass
                
    configs = load_robot_configs()
    robot_config = configs.get(req.robot_name, {})
    
    return {
        "robot_name": req.robot_name,
        "ref_file_info": ref_file_info,
        "config": robot_config  # <-- Zwracamy to do Frontendu!
    }


class DiagnoseReq(BaseModel):
    robot_name: str
    test_file_path: str

def safe_float(val, default=0.0):
    """Bezpieczne rzutowanie na float, chroni przed wartościami None (null z JSON)"""
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default

@router.post("/api/diagnose")
def run_diagnosis(req: DiagnoseReq):
    configs = load_robot_configs()
    config = configs.get(req.robot_name, {})
    
    ref_dir = os.path.join(BASE_DIR, req.robot_name, "Przebieg_referencyjny")
    ref_files = [f for f in os.listdir(ref_dir) if os.path.isfile(os.path.join(ref_dir, f))] if os.path.exists(ref_dir) else []
    
    if not ref_files:
        return {"error": "Brak pliku referencyjnego."}
    
    ref_file_path = os.path.join(ref_dir, ref_files[0])
    test_file_path = os.path.join(ROOT_PATH, req.test_file_path)
    
    if not os.path.exists(test_file_path):
        return {"error": "Brak pliku badanego."}
        
    try:
        # 1. Błyskawiczne wykrycie separatora
        with open(ref_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            sep_ref = ';' if ';' in f.readline() else ','
        with open(test_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            sep_test = ';' if ';' in f.readline() else ','
            
        df_ref = pd.read_csv(ref_file_path, sep=sep_ref)
        df_test = pd.read_csv(test_file_path, sep=sep_test)
        
        df_ref.columns = df_ref.columns.str.strip()
        df_test.columns = df_test.columns.str.strip()
        
        # Szybka konwersja (polskie przecinki)
        for df in (df_ref, df_test):
            obj_cols = df.select_dtypes(include=['object']).columns
            for c in obj_cols:
                df[c] = pd.to_numeric(df[c].str.replace(',', '.'), errors='coerce')
            df.fillna(0, inplace=True)
            
        cols = [c for c in df_ref.columns if c.startswith('A') or c.startswith('Cur')]
        cols.sort(key=lambda x: (x.startswith('Cur'), x))
        
        min_len = min(len(df_ref), len(df_test))
        df_ref = df_ref.iloc[:min_len].copy()
        df_test = df_test.iloc[:min_len].copy()
        
        # 2. NAPRAWA CZASU (dt): Skalowanie do sekund (dzieli przez 1000) tak jak na frontendzie
        time_col = next((c for c in df_ref.columns if 'time' in c.lower() or 'czas' in c.lower()), None)
        if time_col:
            start_time = float(df_ref[time_col].iloc[0])
            times = (df_ref[time_col].values - start_time) / 1000.0
            dt = np.diff(times, prepend=times[0])
            dt[0] = 0.0
        else:
            times = np.arange(min_len, dtype=float)
            dt = np.ones(min_len, dtype=float)
            dt[0] = 0.0
            
        diag_type = str(config.get('diagnosis_type', 'Odchylenia'))
        
        chart_data = {}
        violation_areas = {}
        violation_percents = {}
        statsData = {}

        errors = {"MAE": {}, "MSE": {}, "IAE": {}, "ISE": {}}
        # NOWE: Słownik flag przekroczeń limitów, liczony na backendzie
        exceeded_limits = {"MAE": {}, "MSE": {}, "IAE": {}, "ISE": {}}
        # Inicjalizacja słowników na wyliczone dynamicznie progi
        calculated_thresholds = {"MAE": {}, "MSE": {}, "IAE": {}, "ISE": {}}
        
        # ZMIANA: Parametry to teraz SKALARY, a nie sztywne progi
        mae_scalar = safe_float(config.get("mae_threshold"), 1.0)
        mse_scalar = safe_float(config.get("mse_threshold"), 1.0)
        iae_scalar = safe_float(config.get("iae_threshold"), 1.0)
        ise_scalar = safe_float(config.get("ise_threshold"), 1.0)
        calculated_stats = {}
        for col in cols:
            is_a = col.startswith('A')
            
            # Pobieramy r_vals, t_vals i err
            r_vals = df_ref[col].values
            t_vals = df_test[col].values
            err = t_vals - r_vals
            
            # 1. Klasyczne Wskaźniki (Przywracamy twarde progi z konfiguracji)
            errors["MAE"][col] = float(np.abs(err).mean())
            errors["MSE"][col] = float((err**2).mean())
            errors["IAE"][col] = float(np.sum(np.abs(err) * dt))
            errors["ISE"][col] = float(np.sum((err**2) * dt))
            
            if diag_type == 'Wskaźniki':
                exceeded_limits["MAE"][col] = bool(errors["MAE"][col] > safe_float(config.get("mae_threshold"), 0.5))
                exceeded_limits["MSE"][col] = bool(errors["MSE"][col] > safe_float(config.get("mse_threshold"), 1.0))
                exceeded_limits["IAE"][col] = bool(errors["IAE"][col] > safe_float(config.get("iae_threshold"), 50.0))
                exceeded_limits["ISE"][col] = bool(errors["ISE"][col] > safe_float(config.get("ise_threshold"), 100.0))
            else:
                for k in exceeded_limits: exceeded_limits[k][col] = False

            # 2. LOGIKA TUNELU (Dodajemy tryb Statystyka)
            if diag_type == 'Odchylenia':
                dev_thr = safe_float(config.get('a_deviation_threshold' if is_a else 'cur_deviation_threshold'), 2.0)
                deadband = safe_float(config.get('a_deadband_threshold' if is_a else 'cur_deadband_threshold'), 0.05)
                rolling_max = pd.Series(r_vals).abs().rolling(window=11, center=True, min_periods=1).max().values
                margin = np.maximum(rolling_max * (dev_thr / 100.0), deadband)
                
            elif diag_type == 'Odchylenie (offsetowe)':
                off_thr = safe_float(config.get('a_offset_threshold' if is_a else 'cur_offset_threshold'), 0.1)
                margin = np.full(min_len, off_thr, dtype=float)
                
            elif diag_type == 'Statystyka':
                # NOWY TRYB: Zasada k-Sigma (Domyślnie 3)
                k = safe_float(config.get("sigma_multiplier"), 3.0)
                std_val = np.std(err)
                margin = np.full(min_len, k * std_val, dtype=float)
                
                # Zapisujemy wyliczone parametry do wyświetlenia na froncie
                calculated_stats[col] = {
                    "sigma": float(std_val),
                    "limit": float(k * std_val)
                }
            else:
                # 3. Wskaźniki matematyczne (brak tunelu na wykresach)
                margin = np.zeros(min_len, dtype=float)
            # ----------------------------------------------------------------
                
            up_limit = r_vals + margin
            low_limit = r_vals - margin
            
            # Sprawdzanie przekroczeń tylko w trybach o to opartych
            if diag_type in ['Odchylenia', 'Odchylenie (offsetowe)','Statystyka']:
                is_out = (t_vals > up_limit) | (t_vals < low_limit)
                violation_percents[col] = float(is_out.mean() * 100)
            else:
                # W trybie Wskaźników tunel i procent błędu nie istnieją
                is_out = np.zeros(min_len, dtype=bool)
                violation_percents[col] = 0.0
                
            # 1. SZUKANIE OBSZARÓW BŁĘDÓW (do czerwonych stref na wykresach)
            out_indices = np.where(is_out)[0]
            areas = []
            if len(out_indices) > 0:
                breaks = np.where(np.diff(out_indices) > 1)[0]
                starts = np.insert(out_indices[breaks + 1], 0, out_indices[0])
                ends = np.append(out_indices[breaks], out_indices[-1])
                for s, e in zip(starts, ends):
                    areas.append({"start": round(float(times[s]), 3), "end": round(float(times[e]), 3)})
            violation_areas[col] = areas

            # 2. TWORZENIE RAMKI DANYCH (tej której brakowało)
            temp_df = pd.DataFrame({
                "Time": np.round(times, 3),
                "Referencja": np.round(r_vals, 4),
                "Badany": np.round(t_vals, 4),
                "UpperLimit": np.round(up_limit, 4),
                "LowerLimit": np.round(low_limit, 4),
                "Roznica": np.round(err, 4)
            })
                
            # 3. FORMATOWANIE DO JSON
            chart_data[col] = temp_df.to_dict(orient='records')
        
        # GLOBALNY WERDYKT
        is_failure = False
        worst_axis = ""
        max_error = -1.0
        error_unit = ""
        failure_reason = "" 
        
        if diag_type == "Wskaźniki":
            # Hierarchia usterek: ISE (Kolizje) > MSE (Drgania) > IAE (Zużycie) > MAE (Kalibracja)
            metrics_priority = [("ISE", "KOLIZJA / SZARPNIĘCIE"), 
                                ("MSE", "NIESTABILNOŚĆ / DRGANIA"), 
                                ("IAE", "ZUŻYCIE MECHANICZNE"), 
                                ("MAE", "BŁĄD KALIBRACJI")]
            
            for metric, reason_prefix in metrics_priority:
                for col in cols:
                    if exceeded_limits[metric][col]:
                        is_failure = True
                        worst_axis = col
                        max_error = errors[metric][col]
                        limit_val = calculated_thresholds[metric][col]
                        failure_reason = f"{reason_prefix}: Przekroczono limit 3σ na osi {col} (Wartość: {round(max_error, 2)} > Limit: {round(limit_val, 2)})"
                        break
                if is_failure:
                    break
                        
            if not is_failure:
                failure_reason = "Wszystkie wskaźniki w normie (poniżej progu 3σ)"
                
        else:
            # Stara logika dla odchyleń procentowych / offsetowych
            max_viol_thr = safe_float(config.get("max_violation_threshold"), 5.0)
            error_unit = "%"
            for col in cols:
                val = violation_percents[col]
                if val > max_error:
                    max_error = val
                    worst_axis = col
            is_failure = max_error >= max_viol_thr
            if is_failure:
                failure_reason = f"PRZEKROCZENIE TOLERANCJI: {round(max_error, 2)}% błędu na osi {worst_axis}"
            else:
                failure_reason = "Przejazd w tunelu tolerancji"
            
        global_diag = {
            "isFailure": bool(is_failure),
            "worstAxis": worst_axis,
            "maxError": float(max_error),
            "diagType": diag_type,
            "errorUnit": error_unit,
            "failureReason": failure_reason # Wysyłamy string z powodem na Front!
        }
        
        a_cols = [c for c in cols if c.startswith('A')]
        cur_cols = [c for c in cols if c.startswith('Cur')]
        def get_max(m_dict, c_list): return max([m_dict[c] for c in c_list] + [0.0001]) if c_list else 0.0001
            
        maxes = {
            "A": { m: get_max(errors[m], a_cols) for m in ["MAE", "MSE", "IAE", "ISE"] },
            "Cur": { m: get_max(errors[m], cur_cols) for m in ["MAE", "MSE", "IAE", "ISE"] }
        }
        
        return {
            "globalDiagnosis": global_diag,
            "statsData": {
                "errors": errors, 
                "exceededLimits": exceeded_limits, 
                "calculatedThresholds": calculated_thresholds, # NOWE: Przekazujemy progi na Front
                "aCols": a_cols, 
                "curCols": cur_cols, 
                "maxes": maxes, 
                "violationPercents": violation_percents,
                "signalParams": statsData.get("signalParams", {}),
                "calculatedStats": calculated_stats 
            },
            "violationAreas": violation_areas,
            "chartData": chart_data,
            "columns": cols,
            "usedConfig": config  
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
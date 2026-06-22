# routers.py
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
from typing import Optional, Dict, Any 
from backend.ml.ml_engine import ml_engine

router = APIRouter()

class RobotCreate(BaseModel):
    name: str

class FilePathReq(BaseModel):
    path: str

class FileDataReq(BaseModel):
    path: str

class RobotInfoReq(BaseModel):
    robot_name: str

class FileStatusReq(BaseModel):
    path: str
    status: str

class SaveAutoDiagReq(BaseModel):
    robot_name: str
    test_file_path: str

class TrainModelRequest(BaseModel):
    model_name: str
    folder_path: str
    reference_path: str
    window_size: int
    step_size: int
    algorithm: str = "Isolation Forest"
    contamination: float = 0.03

class TestModelReq(BaseModel):
    group_id: str
    axis: str
    test_file_path: str
    reference_file_path: str

CONFIG_FILE = os.path.join(ROOT_PATH, "robots_config.json")


@router.delete("/api/ml/models/{group_id}")
def delete_ml_model(group_id: str):
    return ml_engine.delete_model_group(group_id)

@router.get("/api/ml/model-data-all/{group_id}")
def get_all_ml_model_visualization(group_id: str):
    return ml_engine.get_all_model_visualization_data(group_id)

@router.get("/api/ml/model-data/{group_id}/{axis}")
def get_ml_model_visualization(group_id: str, axis: str):
    return ml_engine.get_model_visualization_data(group_id, axis)

@router.get("/api/ml/sources")
def get_ml_sources():
    sources = []
    if not os.path.exists(BASE_DIR):
        return {"sources": []}
        
    for item in os.listdir(BASE_DIR):
        item_path = os.path.join(BASE_DIR, item)
        if os.path.isdir(item_path):
            ref_dir = os.path.join(item_path, "Przebieg_referencyjny")
            refs = []
            if os.path.exists(ref_dir):
                refs = [f for f in os.listdir(ref_dir) if f.lower().endswith('.csv')]
            
            data_folders = [item] 
            test_files = []
            
            for sub in os.listdir(item_path):
                sub_path = os.path.join(item_path, sub)
                if os.path.isdir(sub_path) and sub not in ["Przebieg_referencyjny"]:
                    data_folders.append(f"{item}/{sub}")
                    for f in os.listdir(sub_path):
                        if f.lower().endswith('.csv'):
                            test_files.append(f"{item}/{sub}/{f}")
            
            sources.append({
                "robot_name": item,
                "data_folders": data_folders,
                "reference_files": [f"{item}/Przebieg_referencyjny/{r}" for r in refs],
                "test_files": test_files
            })
    return {"sources": sources}

@router.post("/api/ml/test")
def test_ml_model(req: TestModelReq):
    abs_test = os.path.join(BASE_DIR, req.test_file_path)
    abs_ref = os.path.join(BASE_DIR, req.reference_file_path)
    return ml_engine.evaluate_file(req.group_id, req.axis, abs_test, abs_ref)

@router.post("/api/ml/train")
def train_robot_model(req: TrainModelRequest):
    abs_folder = os.path.join(BASE_DIR, req.folder_path)
    abs_reference = os.path.join(BASE_DIR, req.reference_path)
    
    result = ml_engine.train_windowed_models(
        model_name=req.model_name,
        training_folder_path=abs_folder,
        reference_file_path=abs_reference,
        window_size=req.window_size,
        step_size=req.step_size,
        contamination=req.contamination,
        algorithm=req.algorithm
    )
    return result

@router.get("/api/ml/registry")
def get_ml_models_registry():
    return ml_engine.get_registry()

@router.post("/api/file/save-auto-diagnosis")
def save_auto_diagnosis(req: SaveAutoDiagReq):
    try:
        diag_result = run_diagnosis(DiagnoseReq(robot_name=req.robot_name, test_file_path=req.test_file_path))
        
        if "error" in diag_result:
            raise HTTPException(status_code=400, detail=diag_result["error"])
            
        global_diag = diag_result.get("globalDiagnosis", {})
        is_failure = global_diag.get("isFailure", False)
        
        if not is_failure:
            auto_label = "OK"
        else:
            reason = global_diag.get("failureReason", "AWARIA")
            if "KOLIZJA" in reason:
                auto_label = "KOLIZJA"
            elif "DRGANIA" in reason or "NIESTABILNOŚĆ" in reason:
                auto_label = "DRGANIA"
            elif "ZUŻYCIE" in reason:
                auto_label = "ZUŻYCIE"
            elif "KALIBRACJI" in reason:
                auto_label = "BŁĄD_KALIBRACJI"
            else:
                auto_label = "AWARIA"

        full_path = os.path.join(ROOT_PATH, req.test_file_path)
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            first_line = f.readline()
            sep = ';' if ';' in first_line else ','

        df = pd.read_csv(full_path, sep=sep, engine='python')
        df['Auto_Label'] = auto_label
        df.to_csv(full_path, sep=sep, index=False)
        
        return {"message": "Zapisano diagnozę automatyczną", "auto_label": auto_label}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
        m_time = os.path.getctime(full_path)
        record_date = datetime.fromtimestamp(m_time).strftime('%Y-%m-%d %H:%M:%S')

        df = pd.read_csv(full_path, sep=None, engine='python')
        columns = df.columns.tolist()

        duration = None
        if 'Time' in df.columns:
            duration = float(df['Time'].iloc[-1] - df['Time'].iloc[0]) / 1000.0

        return {
            "is_valid": True,
            "record_date": record_date, 
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
        
    try:
        with open(file_location, 'r', encoding='utf-8', errors='ignore') as f:
            first_line = f.readline()
            sep = ';' if ';' in first_line else ','
        df = pd.read_csv(file_location, sep=sep, engine='python')
        if 'Auto_Label' not in df.columns:
            df['Auto_Label'] = ""
            df.to_csv(file_location, sep=sep, index=False)
    except Exception:
        pass
    
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
        df = df.fillna(0)
        
        if 'Time' in df.columns:
            start_time = df['Time'].iloc[0]
            df['Time'] = (df['Time'] - start_time) / 1000.0
            
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
        df = pd.read_csv(file_path, sep=None, engine='python')
        df = df.fillna(0)
        
        if not all(col in df.columns for col in ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']):
            return {"error": "Brak kompletnych danych A1-A6"}

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
            T5 = T4 @ Rx(q[4])
            T6 = T5 @ Rz(q[5]) @ Tx(d6)
            
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
    robot_path = os.path.join(ROOT_PATH, BASE_DIR, req.robot_name)
    if not os.path.exists(robot_path):
        raise HTTPException(status_code=404, detail="Robot nie istnieje.")
    
    ref_dir = os.path.join(robot_path, "Przebieg_referencyjny")
    ref_file_info = None
    
    if os.path.exists(ref_dir):
        files = [f for f in os.listdir(ref_dir) if os.path.isfile(os.path.join(ref_dir, f))]
        if files:
            ref_file_name = files[0]
            ref_file_path = os.path.join(ref_dir, ref_file_name)
            
            try:
                m_time = os.path.getmtime(ref_file_path)
                record_date = datetime.fromtimestamp(m_time).strftime('%Y-%m-%d %H:%M:%S')
                duration = None
                
                try:
                    df = pd.read_csv(ref_file_path, sep=None, engine='python')
                    if 'Time' in df.columns:
                        duration = float(df['Time'].iloc[-1] - df['Time'].iloc[0]) / 1000.0
                except Exception:
                    pass
                rel_ref_path = os.path.join(BASE_DIR, req.robot_name, "Przebieg_referencyjny", ref_file_name).replace("\\", "/")
                ref_file_info = {
                    "name": ref_file_name,
                    "record_date": record_date,
                    "duration": duration,
                    "path": rel_ref_path
                }
            except Exception:
                pass
                
    configs = load_robot_configs()
    robot_config = configs.get(req.robot_name, {})
    
    return {
        "robot_name": req.robot_name,
        "ref_file_info": ref_file_info,
        "config": robot_config 
    }


class DiagnoseReq(BaseModel):
    robot_name: str
    test_file_path: str
    override_config: Optional[Dict[str, Any]] = None

def safe_float(val, default=0.0):
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default

@router.post("/api/file/set-status")
def set_file_status(req: FileStatusReq):
    full_path = os.path.join(ROOT_PATH, req.path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Plik nie istnieje na dysku.")

    try:
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            first_line = f.readline()
            sep = ';' if ';' in first_line else ','

        df = pd.read_csv(full_path, sep=sep, engine='python')
        df['Label'] = req.status
        df.to_csv(full_path, sep=sep, index=False)

        return {"message": f"Status zaktualizowany na {req.status}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Błąd zapisu: {str(e)}")

@router.post("/api/diagnose")
def run_diagnosis(req: DiagnoseReq):
    configs = load_robot_configs()
    config = configs.get(req.robot_name, {}).copy()
    
    if req.override_config:
        config.update(req.override_config)

    ref_dir = os.path.join(BASE_DIR, req.robot_name, "Przebieg_referencyjny")
    ref_files = [f for f in os.listdir(ref_dir) if os.path.isfile(os.path.join(ref_dir, f))] if os.path.exists(ref_dir) else []
    
    if not ref_files:
        return {"error": "Brak pliku referencyjnego."}
    
    ref_file_path = os.path.join(ref_dir, ref_files[0])
    test_file_path = os.path.join(ROOT_PATH, req.test_file_path)
    
    if not os.path.exists(test_file_path):
        return {"error": "Brak pliku badanego."}
        
    try:
        with open(ref_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            sep_ref = ';' if ';' in f.readline() else ','
        with open(test_file_path, 'r', encoding='utf-8', errors='ignore') as f:
            sep_test = ';' if ';' in f.readline() else ','
            
        df_ref = pd.read_csv(ref_file_path, sep=sep_ref)
        df_test = pd.read_csv(test_file_path, sep=sep_test)
        
        df_ref.columns = df_ref.columns.str.strip()
        df_test.columns = df_test.columns.str.strip()
        
        # --- ZMIANA 1: ODCZYTANIE PRAWDZIWEGO STATUSU MANUALNEGO ---
        manual_label = "NIEZNANY"
        if 'Label' in df_test.columns:
            val = str(df_test['Label'].iloc[0]).strip().upper()
            if val in ['OK', 'AWARIA', 'NIEZNANY']:
                manual_label = val

        for df in (df_ref, df_test):
            obj_cols = df.select_dtypes(include=['object']).columns
            for c in obj_cols:
                df[c] = pd.to_numeric(df[c].str.replace(',', '.'), errors='coerce')
            df.fillna(0, inplace=True)
            
        cols = [c for c in df_ref.columns if (c.startswith('A') and c not in ['Auto_Label', 'Label']) or c.startswith('Cur')]
        cols.sort(key=lambda x: (x.startswith('Cur'), x))
        
        min_len = min(len(df_ref), len(df_test))
        df_ref = df_ref.iloc[:min_len].copy()
        df_test = df_test.iloc[:min_len].copy()
        
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
        exceeded_limits = {"MAE": {}, "MSE": {}, "IAE": {}, "ISE": {}}
        calculated_thresholds = {"MAE": {}, "MSE": {}, "IAE": {}, "ISE": {}}
        
        mae_scalar = safe_float(config.get("mae_threshold"), 1.0)
        mse_scalar = safe_float(config.get("mse_threshold"), 1.0)
        iae_scalar = safe_float(config.get("iae_threshold"), 1.0)
        ise_scalar = safe_float(config.get("ise_threshold"), 1.0)
        calculated_stats = {}
        
        for col in cols:
            is_a = col.startswith('A')
            r_vals = df_ref[col].values
            t_vals = df_test[col].values
            err = t_vals - r_vals
            
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

            if diag_type == 'Odchylenia':
                tuning_mode = config.get('tuning_mode', 'okno') 
                dev_thr = safe_float(config.get('a_deviation_threshold' if is_a else 'cur_deviation_threshold'), 2.0)
                deadband = safe_float(config.get('a_deadband_threshold' if is_a else 'cur_deadband_threshold'), 0.05)
            
                if tuning_mode == 'srednia':
                    global_mean = np.abs(r_vals).mean()
                    base_margin = np.full(min_len, global_mean * (dev_thr / 100.0), dtype=float)
                    margin = np.maximum(base_margin, deadband)
                elif tuning_mode == 'chwilowy':
                    base_margin = np.full(min_len, dev_thr, dtype=float)
                    margin = np.maximum(base_margin, deadband)
                else:
                    rolling_max = pd.Series(r_vals).abs().rolling(window=11, center=True, min_periods=1).max().values
                    margin = np.maximum(rolling_max * (dev_thr / 100.0), deadband)
                
            elif diag_type == 'Odchylenie (offsetowe)':
                off_thr = safe_float(config.get('a_offset_threshold' if is_a else 'cur_offset_threshold'), 0.1)
                margin = np.full(min_len, off_thr, dtype=float)
                
            elif diag_type == 'Statystyka':
                k = safe_float(config.get("sigma_multiplier"), 3.0)
                std_val = np.std(err)
                margin = np.full(min_len, k * std_val, dtype=float)
                
                calculated_stats[col] = {
                    "sigma": float(std_val),
                    "limit": float(k * std_val)
                }
            else:
                margin = np.zeros(min_len, dtype=float)
                
            up_limit = r_vals + margin
            low_limit = r_vals - margin
            
            if diag_type in ['Odchylenia', 'Odchylenie (offsetowe)','Statystyka']:
                is_out = (t_vals > up_limit) | (t_vals < low_limit)
                violation_percents[col] = float(is_out.mean() * 100)
            else:
                is_out = np.zeros(min_len, dtype=bool)
                violation_percents[col] = 0.0
                
            out_indices = np.where(is_out)[0]
            areas = []
            if len(out_indices) > 0:
                breaks = np.where(np.diff(out_indices) > 1)[0]
                starts = np.insert(out_indices[breaks + 1], 0, out_indices[0])
                ends = np.append(out_indices[breaks], out_indices[-1])
                for s, e in zip(starts, ends):
                    areas.append({"start": round(float(times[s]), 3), "end": round(float(times[e]), 3)})
            violation_areas[col] = areas

            temp_df = pd.DataFrame({
                "Time": np.round(times, 3),
                "Referencja": np.round(r_vals, 4),
                "Badany": np.round(t_vals, 4),
                "UpperLimit": np.round(up_limit, 4),
                "LowerLimit": np.round(low_limit, 4),
                "Roznica": np.round(err, 4)
            })
            chart_data[col] = temp_df.to_dict(orient='records')
        
        is_failure = False
        worst_axis = ""
        max_error = -1.0
        error_unit = ""
        failure_reason = "" 
        
        if diag_type == "Wskaźniki":
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
                if is_failure: break
            if not is_failure: failure_reason = "Wszystkie wskaźniki w normie (poniżej progu 3σ)"
        else:
            max_viol_thr = safe_float(config.get("max_violation_threshold"), 5.0)
            error_unit = "%"
            for col in cols:
                val = violation_percents[col]
                if val > max_error:
                    max_error = val
                    worst_axis = col
            is_failure = max_error >= max_viol_thr
            if is_failure: failure_reason = f"PRZEKROCZENIE TOLERANCJI: {round(max_error, 2)}% błędu na osi {worst_axis}"
            else: failure_reason = "Przejazd w tunelu tolerancji"
            
        global_diag = {
            "isFailure": bool(is_failure),
            "worstAxis": worst_axis,
            "maxError": float(max_error),
            "diagType": diag_type,
            "errorUnit": error_unit,
            "failureReason": failure_reason 
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
            "manualLabel": manual_label, # <--- WYSYŁAMY LABEL NA FRONTEND
            "statsData": {
                "errors": errors, 
                "exceededLimits": exceeded_limits, 
                "calculatedThresholds": calculated_thresholds, 
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
    
class BatchDiagnoseReq(BaseModel):
    robot_name: str
    folder_path: str
    override_config: Optional[Dict[str, Any]] = None

@router.post("/api/diagnose/batch")
def run_batch_diagnosis(req: BatchDiagnoseReq):
    clean_folder_path = req.folder_path
    base_dir_name = os.path.basename(BASE_DIR.strip("/\\"))
    
    if clean_folder_path.startswith(base_dir_name + "/"):
        clean_folder_path = clean_folder_path[len(base_dir_name)+1:]
        
    target_dir = os.path.join(BASE_DIR, clean_folder_path)
    
    if not os.path.isdir(target_dir):
        return {"error": f"Podana ścieżka nie jest folderem: {target_dir}"}
        
    results = []
    files_in_dir = os.listdir(target_dir)
    print(f"\n--- BATCH DIAGNOSE: Skanowanie folderu {clean_folder_path} ---")
    
    for file_name in files_in_dir:
        abs_path = os.path.join(target_dir, file_name)
        
        if os.path.isfile(abs_path) and file_name.lower().endswith(".csv") and "referenc" not in file_name.lower():
            file_rel_path = f"{req.folder_path}/{file_name}" if not req.folder_path.startswith(base_dir_name + "/") else f"{clean_folder_path}/{file_name}"

            single_req = DiagnoseReq(
                robot_name=req.robot_name,
                test_file_path=abs_path.replace("\\", "/"), 
                override_config=req.override_config
            )
            
            try:
                diag_res = run_diagnosis(single_req)
                
                if "error" not in diag_res:
                    g_diag = diag_res.get("globalDiagnosis", {})
                    s_data = diag_res.get("statsData", {})
                    
                    auto_label = "BRAK"
                    if isinstance(g_diag, dict):
                        is_failure = g_diag.get("isFailure")
                        if is_failure is True: auto_label = "AWARIA"
                        elif is_failure is False: auto_label = "OK"

                    # --- ZMIANA 2: WYKORZYSTANIE ODŁOWIONEGO LABELA ---
                    manual_label = diag_res.get("manualLabel", "NIEZNANY")
                    
                    # Jeśli z jakiegoś powodu plik nie miał kolumny, wracamy do domyślnego zgadywania
                    if manual_label == "NIEZNANY":
                        path_lower = file_rel_path.lower()
                        if "awaria" in path_lower or "bad" in path_lower or "error" in path_lower:
                            manual_label = "AWARIA"
                        elif "ok" in path_lower or "good" in path_lower or "referenc" in path_lower:
                            manual_label = "OK"
                    
                    violation_percents = {}
                    if isinstance(s_data, dict) and "violationPercents" in s_data:
                        violation_percents = s_data["violationPercents"]
                    elif isinstance(s_data, dict) and "violation_percents" in s_data:
                        violation_percents = s_data["violation_percents"]
                    elif isinstance(diag_res, dict) and "violationPercents" in diag_res:
                        violation_percents = diag_res["violationPercents"]
                    else:
                        if isinstance(s_data, dict) and "signalParams" in s_data:
                            sig_params = s_data["signalParams"]
                            for col in diag_res.get("columns", []):
                                if col in sig_params and isinstance(sig_params[col], dict):
                                    col_data = sig_params[col]
                                    val = col_data.get("violationPercent", col_data.get("violation_percent"))
                                    if val is None and "raw" in col_data and isinstance(col_data["raw"], dict):
                                        val = col_data["raw"].get("violationPercent", col_data["raw"].get("violation_percent"))
                                    violation_percents[col] = float(val) if val is not None else 0.0
                    
                    results.append({
                        "file_name": file_name,
                        "manual_label": manual_label,
                        "auto_label": auto_label,
                        "violation_percents": violation_percents
                    })
                else:
                    print(f"[{file_name}] Pominięto błąd: {diag_res['error']}")
            except Exception as e:
                print(f"🔥 BŁĄD KRYTYCZNY w batch dla {file_name}: {e}")
                
    results = sorted(results, key=lambda x: x["file_name"])
    print(f"--- Zakończono. Przekazano {len(results)} plików do tabeli! ---\n")
    return {"batch_results": results}
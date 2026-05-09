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
        
        # Przeliczamy cały plik za jednym zamachem
        for _, row in df.iterrows():
            q = np.radians([row['A1']-90, row['A2']+90, row['A3'], row['A4'], row['A5'], row['A6']])
            
            T1 = T0 @ Rz(-q[0]) @ Tz(d1)
            T2 = T1 @ Tx(a1) @ Ry(q[1])
            T3 = T2 @ Tz(a2) @ Ry(q[2])
            T4 = T3 @ Tx(a3) @ Tz(d4) @ Rx(q[3])
            T5 = T4 @ Tz(0.10) @ Rx(-q[4])
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
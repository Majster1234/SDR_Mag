import os
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from backend.file_system import get_directory_tree, create_robot_structure, delete_file, swap_reference_file
from backend.websocket_manager import manager
from backend.config import BASE_DIR, DEFAULT_ROBOTS, ROOT_PATH
import math


router = APIRouter()

class RobotCreate(BaseModel):
    name: str

class FilePathReq(BaseModel):
    path: str

class FileDataReq(BaseModel):
    path: str

class RobotInfoReq(BaseModel):
    robot_name: str

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

        df = pd.read_csv(full_path)
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
        df = pd.read_csv(full_path)
        
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
                    df = pd.read_csv(ref_file_path)
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
                
    return {
        "robot_name": req.robot_name,
        "ref_file_info": ref_file_info
    }
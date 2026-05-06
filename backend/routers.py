import os
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from backend.file_system import get_directory_tree, create_robot_structure
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
import os
import asyncio
from watchfiles import awatch, Change
from backend.config import BASE_DIR, DEFAULT_ROBOTS, SUBFOLDERS, ROOT_PATH
from backend.websocket_manager import manager

def init_directories():
    os.makedirs(BASE_DIR, exist_ok=True)
    for robot in DEFAULT_ROBOTS:
        for sub in SUBFOLDERS:
            os.makedirs(os.path.join(BASE_DIR, robot, sub), exist_ok=True)

def get_directory_tree(path=BASE_DIR):
    tree = []
    try:
        entries = sorted(os.listdir(path))
        for entry in entries:
            full_path = os.path.join(path, entry)
            # Tworzymy ścieżkę do porównania z Reactem (np. Roboty\Robot_1\plik.csv)
            rel_path = os.path.relpath(full_path, start=ROOT_PATH)
            
            if os.path.isdir(full_path):
                tree.append({
                    "name": entry,
                    "type": "folder",
                    "path": rel_path,
                    "children": get_directory_tree(full_path)
                })
            else:
                tree.append({"name": entry, "type": "file", "path": rel_path})
    except Exception:
        pass
    return tree

async def watch_folder():
    print(f"Rozpoczęto nasłuchiwanie: {BASE_DIR}")
    async for changes in awatch(BASE_DIR):
        for change, path in changes:
            if change == Change.added:
                rel_path = os.path.relpath(path, start=ROOT_PATH)
                print(f"Nowy plik: {rel_path}")
                await manager.broadcast(rel_path)
                
def create_robot_structure(robot_name: str):
    # Zabezpieczenie: zostawiamy tylko litery, cyfry, spacje, myślniki i podkreślniki
    safe_name = "".join([c for c in robot_name if c.isalnum() or c in (' ', '_', '-')]).strip()
    
    if not safe_name:
        return False
        
    robot_path = os.path.join(BASE_DIR, safe_name)
    
    # Jeśli robot już istnieje, przerywamy
    if os.path.exists(robot_path):
        return False
        
    # Tworzymy główny folder robota
    os.makedirs(robot_path)
    # Tworzymy wymagane podfoldery
    for sub in SUBFOLDERS:
        os.makedirs(os.path.join(robot_path, sub))
        
    return True
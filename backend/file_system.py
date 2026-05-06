import os
import asyncio
from watchfiles import awatch, Change
from backend.config import BASE_DIR, DEFAULT_ROBOTS, SUBFOLDERS, ROOT_PATH
from backend.websocket_manager import manager
import shutil
from pathlib import Path

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

def delete_file(rel_path: str):
    full_path = os.path.join(ROOT_PATH, rel_path)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
            return True, ""
        except Exception as e:
            return False, str(e)
    return False, "Plik nie istnieje."

def swap_reference_file(rel_path: str):
    full_source_path = os.path.join(ROOT_PATH, rel_path)
    if not os.path.exists(full_source_path):
        return False, "Plik źródłowy nie istnieje na dysku."

    p = Path(rel_path)
    # Spodziewana struktura to: Roboty / NazwaRobota / Podfolder / plik.csv
    if len(p.parts) < 4:
        return False, "Nieprawidłowa ścieżka pliku."

    base_dir = p.parts[0]
    robot_name = p.parts[1]
    source_folder = p.parts[2]
    file_name = p.parts[-1]

    if source_folder == "Przebieg_referencyjny":
        return False, "Ten plik jest już plikiem referencyjnym."

    ref_dir = os.path.join(ROOT_PATH, base_dir, robot_name, "Przebieg_referencyjny")
    src_dir = os.path.dirname(full_source_path)

    if not os.path.exists(ref_dir):
        return False, "Folder referencyjny tego robota nie istnieje."

    try:
        # Sprawdzamy czy w folderze referencyjnym jest już jakiś plik
        existing_files = [f for f in os.listdir(ref_dir) if os.path.isfile(os.path.join(ref_dir, f))]
        
        target_path = os.path.join(ref_dir, file_name)

        if existing_files:
            # SWAP: stary plik referencyjny wędruje tam, skąd bierzemy nowy
            old_ref_file = existing_files[0]
            old_ref_path = os.path.join(ref_dir, old_ref_file)
            new_old_ref_path = os.path.join(src_dir, old_ref_file)
            shutil.move(old_ref_path, new_old_ref_path)

        # Przenosimy nasz wybrany plik do folderu referencyjnego
        shutil.move(full_source_path, target_path)
        return True, ""
    except Exception as e:
        return False, str(e)
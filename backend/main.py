import asyncio
import os
import shutil
import subprocess
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

PROJECT_DIR = Path(__file__).resolve().parent.parent
if str(PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(PROJECT_DIR))

from backend.file_system import init_directories, watch_folder
from backend.routers import router

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_directories()
    task = asyncio.create_task(watch_folder())
    yield
    task.cancel()

app = FastAPI(lifespan=lifespan)

# Konfiguracja interfejsu (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Podłączenie routerów
app.include_router(router)


FRONTEND_DIR = PROJECT_DIR / "frontend"


def start_frontend() -> subprocess.Popen:
    """Uruchamia serwer deweloperski Vite dla frontendu."""
    npm_command = "npm.cmd" if sys.platform == "win32" else "npm"

    if shutil.which(npm_command) is None:
        raise RuntimeError(
            "Nie znaleziono npm. Zainstaluj Node.js lub dodaj npm do zmiennej PATH."
        )

    process_options: dict = {}
    if sys.platform == "win32":
        process_options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        process_options["start_new_session"] = True

    return subprocess.Popen(
        [npm_command, "run", "dev", "--", "--host", "127.0.0.1"],
        cwd=FRONTEND_DIR,
        **process_options,
    )


def stop_frontend(frontend_process: subprocess.Popen) -> None:
    """Zatrzymuje Vite wraz z procesami uruchomionymi przez npm."""
    if frontend_process.poll() is not None:
        return

    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(frontend_process.pid), "/T", "/F"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        os.killpg(os.getpgid(frontend_process.pid), 15)

    try:
        frontend_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        frontend_process.kill()


def run_application() -> None:
    """Uruchamia frontend i backend; Ctrl+C zatrzymuje oba procesy."""
    frontend_process = start_frontend()

    try:
        uvicorn.run(app, host="127.0.0.1", port=8000)
    finally:
        stop_frontend(frontend_process)


if __name__ == "__main__":
    run_application()

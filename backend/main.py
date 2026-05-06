import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

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
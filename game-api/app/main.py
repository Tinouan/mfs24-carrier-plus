import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.db import engine, Base
from app.core.scheduler import start_scheduler, stop_scheduler
from app.routers import auth, company, users, inventory, profile
from app.routers.fleet import router as fleet_router
from app.routers.company_profile import router as company_profile_router
from app.routers.market import router as market_router
from app.routers.factories import router as factories_router
from app.routers.world import router as world_router
from app.routers.workers import router as workers_router
from app.routers.sql_executor import router as sql_executor_router
from app.routers.missions import router as missions_router


ROOT_PATH = os.getenv("ROOT_PATH", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events"""
    # Startup
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS game"))
    # Base.metadata.create_all(bind=engine)  # Commented - tables created via SQL scripts

    # Start production scheduler
    start_scheduler()
    logger.info("[Scheduler] Production scheduler started")

    yield

    # Shutdown
    stop_scheduler()
    logger.info("[Scheduler] Production scheduler stopped")


app = FastAPI(
    title="MSFS Game API",
    version="0.1",
    root_path=ROOT_PATH,
    lifespan=lifespan,
)

# CORS middleware for webmap access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health():
    return {"ok": True}


@app.get("/", tags=["system"])
def root():
    return {"service": "msfs-game-api"}


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(company.router)
app.include_router(inventory.router)
app.include_router(fleet_router)
app.include_router(profile.router)
app.include_router(company_profile_router)
app.include_router(market_router)
# V0.5 Factory System
app.include_router(factories_router)
app.include_router(world_router)
# V0.6 Workers System
app.include_router(workers_router)
# V0.8 Mission System
app.include_router(missions_router)
# SQL Executor (DEV ONLY)
app.include_router(sql_executor_router)


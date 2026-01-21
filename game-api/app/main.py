import os

from fastapi import FastAPI
from sqlalchemy import text

from app.core.db import engine, Base
from app.routers import auth, company, users, inventory, profile
from app.routers.fleet import router as fleet_router
from app.routers.company_profile import router as company_profile_router
from app.routers.market import router as market_router
from app.routers.factories import router as factories_router
from app.routers.world import router as world_router
from app.routers.sql_executor import router as sql_executor_router


ROOT_PATH = os.getenv("ROOT_PATH", "")

app = FastAPI(
    title="MSFS Game API",
    version="0.1",
    root_path=ROOT_PATH,
)


@app.on_event("startup")
def _startup():
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS game"))
    # Base.metadata.create_all(bind=engine)  # Commented - tables created via SQL scripts


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
# SQL Executor (DEV ONLY)
app.include_router(sql_executor_router)


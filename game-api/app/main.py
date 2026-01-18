import os

from fastapi import FastAPI
from sqlalchemy import text

from app.core.db import engine, Base
from app.routers import auth, company, users, inventory, profile
from app.routers.fleet import router as fleet_router

# This makes Swagger/OpenAPI work properly behind Nginx when exposed under /api
# Nginx routes /api/* -> FastAPI, so we set root_path to /api via env var.
ROOT_PATH = os.getenv("ROOT_PATH", "")

app = FastAPI(
    title="MSFS Game API",
    version="0.1",
    root_path=ROOT_PATH,
)


@app.on_event("startup")
def _startup():
    # Ensure schema exists
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS game"))
    # Create tables (MVP). Later: migrate with Alembic.
    Base.metadata.create_all(bind=engine)


@app.get("/health", tags=["system"])
def health():
    return {"ok": True}


@app.get("/", tags=["system"])
def root():
    return {"service": "msfs-game-api"}


# Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(company.router)
app.include_router(inventory.router)
app.include_router(fleet_router)
app.include_router(profile.router)

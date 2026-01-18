from fastapi import FastAPI
from sqlalchemy import text

from app.core.db import engine, Base
from app.routers import auth, company, users, inventory, profile
from app.routers.fleet import router as fleet_router


app = FastAPI(title="MSFS Game API", version="0.1")

@app.on_event("startup")
def _startup():
    # Ensure schema exists
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS game"))
    # Create tables (MVP). Later: migrate with Alembic.
    Base.metadata.create_all(bind=engine)

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/")
def root():
    return {"service": "msfs-game-api"}

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(company.router)
app.include_router(inventory.router)
app.include_router(fleet_router)
app.include_router(profile.router)


# Main FastAPI application

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from database import Base, engine
import models  # noqa: F401 - register all SQLAlchemy models
from routers import auth, restaurants, locations, queues, queue_entries


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Development setup: create any missing tables from the SQLAlchemy models.
    # This does not drop or reset existing tables.
    Base.metadata.create_all(bind=engine)
    # Lightweight compatibility migration for development/Render deployments
    # without Alembic: add the location status column if an older DB exists.
    columns = {column["name"] for column in inspect(engine).get_columns("locations")}
    if "status" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE locations ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'open'"))
    yield


app = FastAPI(title="Vque API", version="1.0.0", lifespan=lifespan)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5175").rstrip("/")
allowed_origins = [frontend_url]
if os.getenv("APP_ENV", "development").lower() == "development" and frontend_url != "http://localhost:5175":
    allowed_origins.append("http://localhost:5175")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", tags=["Health"])
def health_check():
    return {"message": "ok"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}


app.include_router(auth.router)
app.include_router(restaurants.router)
app.include_router(locations.router)
app.include_router(queues.router)
app.include_router(queue_entries.router)

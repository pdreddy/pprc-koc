"""Minimal stub. This app uses Firebase Realtime Database directly from frontend (no Python backend logic)."""
from fastapi import FastAPI

app = FastAPI()


@app.get("/api/health")
def health():
    return {"status": "ok", "note": "Frontend uses Firebase RTDB directly"}

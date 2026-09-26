from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth,sessions,student,delivery,reports,staff_attendance
app=FastAPI(title="KMIE Class Link & Delivery Management API",version="1.0.0")
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in settings.cors_origins.split(",")],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
app.include_router(auth.router); app.include_router(sessions.router); app.include_router(student.router); app.include_router(delivery.router); app.include_router(reports.router); app.include_router(staff_attendance.router)
@app.get("/health")
def health(): return {"status":"ok"}
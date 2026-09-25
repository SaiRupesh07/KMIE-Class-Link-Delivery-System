from datetime import date as Date, time as Time

from pydantic import BaseModel, HttpUrl

from app.models.session import SessionType


class SessionCreate(BaseModel):
    batch_id: str
    date: Date
    type: SessionType
    time: Time
    zoom_url: HttpUrl
    subject_name: str
    teacher_name: str


class SessionUpdate(BaseModel):
    batch_id: str | None = None
    date: Date | None = None
    type: SessionType | None = None
    time: Time | None = None
    zoom_url: HttpUrl | None = None
    subject_name: str | None = None
    teacher_name: str | None = None


class SessionOut(BaseModel):
    id: str
    batch_id: str
    date: Date
    type: SessionType
    time: Time
    zoom_url: str
    subject_name: str
    teacher_name: str
    status: str
    created_by: str
    approved_by: str | None = None
    approved_at: object | None = None

    model_config = {"from_attributes": True}
from datetime import datetime, date, time, timezone
from enum import Enum
from sqlalchemy import String, DateTime, Date, Time, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base
class SessionType(str, Enum): LIVE="LIVE"; RECORDED="RECORDED"
class SessionStatus(str, Enum): DRAFT="DRAFT"; APPROVED="APPROVED"
class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (UniqueConstraint("batch_id","date","type", name="uq_session_batch_date_type"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("batches.id", ondelete="RESTRICT"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[SessionType] = mapped_column(SAEnum(SessionType, name="session_type"), nullable=False)
    time: Mapped[time] = mapped_column(Time, nullable=False)
    zoom_url: Mapped[str] = mapped_column(String(500), nullable=False)
    subject_name: Mapped[str] = mapped_column(String(200), nullable=False)
    teacher_name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(SAEnum(SessionStatus, name="session_status"), default=SessionStatus.DRAFT, nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    approved_by: Mapped[str|None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime|None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    batch = relationship("Batch", back_populates="sessions")
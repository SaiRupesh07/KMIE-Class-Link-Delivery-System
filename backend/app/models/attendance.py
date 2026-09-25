from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
class AttendanceStatus(str, Enum): PRESENT="PRESENT"; ABSENT="ABSENT"
class Attendance(Base):
    __tablename__="attendance"
    __table_args__=(UniqueConstraint("student_id","session_id",name="uq_attendance_student_session"),)
    id: Mapped[str]=mapped_column(String(36),primary_key=True)
    student_id: Mapped[str]=mapped_column(ForeignKey("students.id",ondelete="CASCADE"),nullable=False)
    session_id: Mapped[str]=mapped_column(ForeignKey("sessions.id",ondelete="CASCADE"),nullable=False)
    status: Mapped[AttendanceStatus]=mapped_column(SAEnum(AttendanceStatus,name="attendance_status"),nullable=False)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc),nullable=False)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc),onupdate=lambda:datetime.now(timezone.utc),nullable=False)

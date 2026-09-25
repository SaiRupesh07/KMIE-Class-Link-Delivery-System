from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base
class DeliveryStatus(str, Enum): PENDING="PENDING"; SENT="SENT"; FAILED="FAILED"
class LinkDelivery(Base):
    __tablename__="link_deliveries"
    __table_args__=(UniqueConstraint("student_id","session_id",name="uq_delivery_student_session"),)
    id: Mapped[str]=mapped_column(String(36),primary_key=True)
    student_id: Mapped[str]=mapped_column(ForeignKey("students.id",ondelete="CASCADE"),nullable=False)
    session_id: Mapped[str]=mapped_column(ForeignKey("sessions.id",ondelete="CASCADE"),nullable=False)
    status: Mapped[DeliveryStatus]=mapped_column(SAEnum(DeliveryStatus,name="delivery_status"),default=DeliveryStatus.PENDING,nullable=False)
    attempt_count: Mapped[int]=mapped_column(default=0,nullable=False)
    last_attempt_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    sent_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc),nullable=False)
    updated_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=lambda:datetime.now(timezone.utc),onupdate=lambda:datetime.now(timezone.utc),nullable=False)

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.mixins import UUIDPKMixin


class Recall(Base, UUIDPKMixin):
    __tablename__ = "recalls"

    patient_id = Column(UUID(as_uuid=True), ForeignKey("patient_profiles.id"), nullable=False, index=True)
    doctor_id = Column(UUID(as_uuid=True), ForeignKey("doctor_profiles.id"), nullable=False, index=True)
    risk_tier = Column(String(20), nullable=False, default="moderate")
    recommended_interval_months = Column(Integer, nullable=False, default=6)
    due_date = Column(Date, nullable=False, index=True)
    status = Column(String(30), nullable=False, default="SCHEDULED", index=True)
    is_demo = Column(Boolean, nullable=False, default=False)
    message_channel = Column(String(20), nullable=True)
    message_status = Column(String(30), nullable=False, default="NOT_SENT")
    sms_status = Column(String(20), nullable=False, default="NOT_SENT")
    whatsapp_status = Column(String(20), nullable=False, default="NOT_SENT")
    email_status = Column(String(20), nullable=False, default="NOT_SENT")
    message_text = Column(Text, nullable=True)
    reminder_logged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

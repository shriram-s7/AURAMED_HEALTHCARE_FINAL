from sqlalchemy import Boolean, Column, ForeignKey, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.mixins import TimestampMixin

class AppointmentReminder(Base, TimestampMixin):
    __tablename__ = 'appointment_reminders'
    appointment_id = Column(UUID(as_uuid=True), ForeignKey('appointments.id'), primary_key=True)
    channels = Column(JSON, nullable=False, default=lambda: ['in_app'])
    lead_days = Column(Integer, nullable=False, default=1)
    consent = Column(Boolean, nullable=False, default=False)
    appointment = relationship('Appointment', back_populates='reminder_plan')

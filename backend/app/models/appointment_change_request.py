from sqlalchemy import Column, Date, ForeignKey, String, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
from app.core.database import Base
from app.models.mixins import TimestampMixin, UUIDPKMixin

class AppointmentChangeRequest(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = 'appointment_change_requests'
    appointment_id = Column(UUID(as_uuid=True), ForeignKey('appointments.id'), nullable=False)
    preferred_date = Column(Date, nullable=False)
    preferred_time = Column(Time, nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default='pending')
    appointment = relationship('Appointment', backref=backref('change_requests', cascade='all, delete-orphan'))

    def as_dict(self):
        return {'id': str(self.id), 'date': str(self.preferred_date), 'time': self.preferred_time.strftime('%H:%M') if self.preferred_time else '', 'reason': self.reason, 'status': self.status}

from datetime import datetime, timedelta, timezone
from app.models.notification import Notification

def appointment_message(appt):
    return f"Your appointment is on {appt.scheduled_date:%d %b %Y} at {appt.scheduled_time.strftime('%H:%M') if appt.scheduled_time else 'time to be confirmed'}, {appt.location or 'location to be confirmed'}. Please check your patient portal for details."

def queue_appointment_notice(db, appt, confirmation=False):
    if not appt.patient or not appt.patient.user_id:
        return []
    plan = appt.reminder_plan
    channels = ['in_app'] if confirmation or not plan else plan.channels
    notices=[]
    for channel in channels:
        if channel != 'in_app' and (not plan or not plan.consent):
            continue
        item=Notification(recipient_user_id=appt.patient.user_id, recipient_type='patient',
            notification_type='APPOINTMENT_BOOKED' if confirmation else 'APPOINTMENT_REMINDER',
            title='Appointment scheduled' if confirmation else 'Appointment reminder',
            message=appointment_message(appt), related_resource_type='appointment', related_resource_id=str(appt.id),
            delivery_method=channel, delivery_status='sent' if channel=='in_app' else 'pending',
            sent_at=datetime.now(timezone.utc) if channel=='in_app' else None)
        db.add(item);notices.append(item)
    return notices

def reminder_summary(appt):
    from sqlalchemy.orm import object_session
    session=object_session(appt)
    history=session.query(Notification).filter(Notification.related_resource_type=='appointment', Notification.related_resource_id==str(appt.id), Notification.notification_type=='APPOINTMENT_REMINDER').order_by(Notification.created_at.desc()).limit(10).all() if session else []
    plan=appt.reminder_plan
    return {'deliveries':[{'channel':n.delivery_method,'status':n.delivery_status,'created_at':n.created_at.isoformat() if n.created_at else None} for n in history], 'channels': plan.channels if plan else ['in_app'], 'lead_days':plan.lead_days if plan else 1,
            'consent':bool(plan and plan.consent), 'queued':bool(appt.reminder_sent),
            'due_date':str(appt.scheduled_date-timedelta(days=plan.lead_days if plan else 1))}

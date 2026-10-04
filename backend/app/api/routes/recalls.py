import calendar
import re
import secrets
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_doctor_profile
from app.core.database import get_db
from app.core.security import hash_password
from app.core.config import settings
from app.models.doctor_profile import DoctorProfile
from app.models.patient_profile import PatientProfile
from app.models.recall import Recall
from app.models.user import User
from app.models.enums import UserRole
from app.services.audit import log_action
from app.services.sms import SMSConfigurationError, SMSDeliveryError, send_sms, send_whatsapp
from app.services.email_service import EmailService

router = APIRouter(prefix="/api/doctor/recalls", tags=["recalls"])


class DemoRecallRequest(BaseModel):
    phone: str = Field(min_length=10, max_length=20)
    channels: list[str] = Field(default_factory=lambda: ["sms", "whatsapp"])
    email: str | None = Field(default=None, max_length=255)


def _add_months(start: date, months: int) -> date:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def _format_recall(recall: Recall, patient: PatientProfile) -> dict:
    recorded_channels = set((recall.message_channel or "").split("+"))
    legacy_simulated_sms = bool(recorded_channels & {"sms", "both"}) and recall.message_status == "SIMULATED"
    sms_status = recall.sms_status or "NOT_SENT"
    whatsapp_status = recall.whatsapp_status or "NOT_SENT"
    if legacy_simulated_sms:
        sms_status = "NOT_SENT"
    elif "whatsapp" in recorded_channels and recall.message_status == "SIMULATED":
        whatsapp_status = "SIMULATED"
    return {
        "id": str(recall.id),
        "patient_id": str(patient.id),
        "patient_name": patient.full_name,
        "patient_code": patient.patient_code,
        "phone": patient.phone,
        "email": patient.user.email if patient.user and not patient.user.email.endswith(".auramed.local") else None,
        "risk_tier": recall.risk_tier,
        "recommended_interval_months": recall.recommended_interval_months,
        "due_date": recall.due_date.isoformat(),
        "status": recall.status,
        "is_demo": bool(recall.is_demo),
        "message_channel": recall.message_channel,
        # Older backend builds marked SMS as simulated. Never present that as a sent SMS.
        "message_status": "NOT_SENT" if legacy_simulated_sms else recall.message_status,
        "sms_status": sms_status,
        "whatsapp_status": whatsapp_status,
        "email_status": recall.email_status or "NOT_SENT",
        "message_note": "This SMS was only simulated; no text was sent." if legacy_simulated_sms else None,
        "message_text": recall.message_text,
        "reminder_logged_at": (
            None if legacy_simulated_sms else recall.reminder_logged_at.isoformat() if recall.reminder_logged_at else None
        ),
    }


@router.get("")
def list_recalls(
    db: Session = Depends(get_db),
    doctor: DoctorProfile = Depends(get_current_doctor_profile),
):
    rows = (
        db.query(Recall, PatientProfile)
        .join(PatientProfile, Recall.patient_id == PatientProfile.id)
        .filter(Recall.doctor_id == doctor.id)
        .order_by(Recall.due_date.asc())
        .all()
    )
    return [_format_recall(recall, patient) for recall, patient in rows]


@router.post("/demo")
def run_demo_recall(
    payload: DemoRecallRequest,
    db: Session = Depends(get_db),
    doctor: DoctorProfile = Depends(get_current_doctor_profile),
):
    phone = re.sub(r"[\s\-()]+", "", payload.phone)
    if re.fullmatch(r"[6-9][0-9]{9}", phone):
        phone = f"+91{phone}"
    if not re.fullmatch(r"\+?[0-9]{10,15}", phone):
        raise HTTPException(status_code=400, detail="Enter a valid phone number with 10–15 digits.")
    email = (payload.email or "").strip().lower()
    channels = {channel.lower() for channel in payload.channels}
    if email:
        channels.add("email")
    if not channels or not channels.issubset({"sms", "whatsapp", "email"}):
        raise HTTPException(status_code=400, detail="Choose SMS, WhatsApp, and/or email for this recall.")
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=400, detail="Enter a valid patient email address.")
    twilio_auth_configured = bool(
        settings.twilio_account_sid
        and ((settings.twilio_api_key_sid and settings.twilio_api_key_secret) or settings.twilio_auth_token)
    )
    required_settings = [twilio_auth_configured]
    if "sms" in channels:
        required_settings.append(
            settings.twilio_phone_number or settings.twilio_from_number or settings.twilio_messaging_service_sid
        )
    if "whatsapp" in channels:
        required_settings.extend([settings.twilio_whatsapp_from, settings.twilio_whatsapp_content_sid])
    if "email" in channels:
        required_settings.extend([settings.smtp_host, settings.smtp_username, settings.smtp_password])
    if not all(required_settings):
        missing = []
        if not settings.twilio_account_sid:
            missing.append("TWILIO_ACCOUNT_SID")
        if not settings.twilio_auth_token and not (settings.twilio_api_key_sid and settings.twilio_api_key_secret):
            missing.append("TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET")
        if "sms" in channels and not (
            settings.twilio_phone_number or settings.twilio_from_number or settings.twilio_messaging_service_sid
        ):
            missing.append("TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID")
        if "whatsapp" in channels:
            if not settings.twilio_whatsapp_from:
                missing.append("TWILIO_WHATSAPP_FROM")
            if not settings.twilio_whatsapp_content_sid:
                missing.append("TWILIO_WHATSAPP_CONTENT_SID")
        if "email" in channels:
            if not settings.smtp_host:
                missing.append("SMTP_HOST")
            if not settings.smtp_username:
                missing.append("SMTP_USERNAME")
            if not settings.smtp_password:
                missing.append("SMTP_PASSWORD")
        raise HTTPException(
            status_code=503,
            detail="Real messaging is not fully configured. Missing: " + ", ".join(missing),
        )

    patient_code = f"DEMO-{str(doctor.id)[:8].upper()}"
    patient = (
        db.query(PatientProfile)
        .filter(PatientProfile.created_by_doctor_id == doctor.id, PatientProfile.patient_code == patient_code)
        .first()
    )
    if not patient:
        user = User(
            email=f"sujitha.demo.{doctor.id}@demo.auramed.local",
            password_hash=hash_password(secrets.token_urlsafe(24)),
            role=UserRole.patient,
            is_active=True,
            is_verified=False,
        )
        db.add(user)
        db.flush()
        patient = PatientProfile(
            user_id=user.id,
            patient_code=patient_code,
            full_name="Sujitha",
            gender="Female",
            phone=phone,
            consent={"demo_record": True},
            created_by_doctor_id=doctor.id,
            status="active",
            overall_notes="Demo patient record for the recall scheduling walkthrough.",
        )
        db.add(patient)
        db.flush()
    else:
        patient.phone = phone

    if email:
        existing_email = db.query(User).filter(User.email == email, User.id != patient.user_id).first()
        if existing_email:
            raise HTTPException(status_code=409, detail="That email address is already linked to another account.")
        patient.user.email = email

    recall = (
        db.query(Recall)
        .filter(Recall.doctor_id == doctor.id, Recall.patient_id == patient.id, Recall.is_demo.is_(True))
        .order_by(Recall.created_at.desc())
        .first()
    )
    due_date = _add_months(date.today(), 6)
    message = (
        f"Hi Sujitha, this is a reminder from AuraMed to plan your follow-up screening by "
        f"{due_date.strftime('%d %b %Y')}. Please contact your clinic to schedule a convenient time."
    )
    if not recall:
        recall = Recall(
            patient_id=patient.id,
            doctor_id=doctor.id,
            risk_tier="MODERATE",
            recommended_interval_months=6,
            due_date=due_date,
            status="SCHEDULED",
            is_demo=True,
        )
        db.add(recall)
    recall.due_date = due_date
    recall.message_channel = "+".join(sorted(channels))
    recall.message_text = message
    recall.sms_status = "PENDING" if "sms" in channels else "NOT_REQUESTED"
    recall.whatsapp_status = "PENDING" if "whatsapp" in channels else "NOT_REQUESTED"
    recall.email_status = "PENDING" if "email" in channels else "NOT_REQUESTED"
    recall.message_status = "PENDING"
    db.commit()
    db.refresh(recall)

    sms_id = None
    whatsapp_id = None
    email_sent = False
    sms_trial_template_used = False
    delivery_errors = {}
    if "sms" in channels:
        try:
            sms_id, sms_trial_template_used = send_sms(phone, message)
            recall.sms_status = "SENT"
        except (SMSConfigurationError, SMSDeliveryError) as exc:
            recall.sms_status = "FAILED"
            delivery_errors["sms"] = str(exc)
    if "whatsapp" in channels:
        try:
            whatsapp_id = send_whatsapp(phone, "Sujitha", due_date.strftime("%d %b %Y"))
            recall.whatsapp_status = "SENT"
        except (SMSConfigurationError, SMSDeliveryError) as exc:
            recall.whatsapp_status = "FAILED"
            delivery_errors["whatsapp"] = str(exc)
    if "email" in channels:
        email_sent = EmailService().send_email(
            to_email=email,
            subject="AuraMed follow-up screening reminder",
            html_content=(
                f"<p>Hi Sujitha,</p><p>This is a reminder from AuraMed to plan your follow-up screening by "
                f"{due_date.strftime('%d %b %Y')}.</p><p>Please contact your clinic to schedule a convenient time.</p>"
            ),
            text_content=message,
        )
        recall.email_status = "SENT" if email_sent else "FAILED"

    channel_statuses = {
        "sms": recall.sms_status,
        "whatsapp": recall.whatsapp_status,
        "email": recall.email_status,
    }
    successful_channels = sum(channel_statuses[channel] == "SENT" for channel in channels)
    requested_channels = len(channels)
    recall.message_status = "SENT" if successful_channels == requested_channels else "PARTIAL" if successful_channels else "FAILED"
    recall.reminder_logged_at = datetime.now(timezone.utc) if successful_channels else None
    db.commit()

    log_action(
        db,
        user_id=doctor.user_id,
        user_type="doctor",
        action="DEMO_RECALL_REMINDER_LOGGED",
        resource_type="recall",
        resource_id=recall.id,
        details={
            "patient_name": patient.full_name,
            "channels": sorted(channels),
            "sms_status": recall.sms_status,
            "whatsapp_status": recall.whatsapp_status,
            "email_status": recall.email_status,
            "sms_provider_message_id": sms_id,
            "whatsapp_provider_message_id": whatsapp_id,
        },
    )
    response = _format_recall(recall, patient)
    response["delivery_errors"] = delivery_errors
    response["sms_trial_template_used"] = sms_trial_template_used
    response["delivery_notes"] = (
        {"sms": "Twilio trial restrictions used its predefined appointment reminder content; the custom AuraMed text was not sent."}
        if sms_trial_template_used
        else {}
    )
    return response

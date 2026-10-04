from app.models.appointment_change_request import AppointmentChangeRequest
import uuid
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_patient, get_db
from app.models.user import User
from app.models.patient_profile import PatientProfile
from app.models.doctor_profile import DoctorProfile
from app.models.report import Report
from app.models.scan import Scan
from app.models.appointment import Appointment
from app.models.data_deletion_request import DataDeletionRequest
from app.models.enums import RiskLevel, AppointmentStatus, ReportStatus
from app.services.audit import log_action

router = APIRouter(prefix="/api/patient", tags=["patient-portal"])

def get_current_patient(
    db: Session = Depends(get_db),
    user: User = Depends(require_patient)
) -> PatientProfile:
    profile = db.query(PatientProfile).filter(PatientProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return profile

class RescheduleAppointmentPayload(BaseModel):
    preferred_date: str
    preferred_time: Optional[str] = "10:30 AM"
    reason: Optional[str] = None

class CancelAppointmentPayload(BaseModel):
    reason: Optional[str] = "Personal scheduling conflict"

import re
from pydantic import BaseModel, field_validator


class UpdateProfilePayload(BaseModel):
    phone: Optional[str] = None
    email: Optional[str] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None
    emergency_contact: Optional[str] = None
    address: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v.strip():
            cleaned = re.sub(r"[\s\-()]+", "", v)
            if not re.match(r"^(\+)?[0-9]{7,16}$", cleaned):
                raise ValueError("Invalid phone number format. Must contain 7 to 16 digits.")
        return v


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: Optional[str] = None

class DataDeletionRequestPayload(BaseModel):
    reason: str
    request_type: str = "Full Account Deletion"

# Helper for plain language risk conversion
# High Risk -> "Needs Follow-up" (red)
# Moderate -> "Monitor" (amber)
# Low/Normal -> "Normal" (green)
def translate_risk_level(risk_str: str) -> dict:
    r = (risk_str or "low").lower()
    if r in ("high", "critical"):
        return {
            "label": "Needs Follow-up",
            "color": "red",
            "code": "high",
            "summary_box": {
                "headline": "A suspicious finding was noted.",
                "message": "This does not mean you have cancer. Further evaluation and correlation with your physician is recommended for reassurance and proactive care."
            }
        }
    if r == "moderate":
        return {
            "label": "Monitor",
            "color": "amber",
            "code": "moderate",
            "summary_box": {
                "headline": "Slight variation noted.",
                "message": "Routine follow-up in 30–60 days is recommended to ensure baseline stability."
            }
        }
    return {
        "label": "Normal",
        "color": "green",
        "code": "low",
        "summary_box": {
            "headline": "No significant abnormalities detected.",
            "message": "Your screening results are within standard healthy reference parameters. Continue routine annual preventative screening."
        }
    }

# --- 1. DASHBOARD ---
@router.get("/dashboard")
def get_patient_dashboard(
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    first_name = patient.full_name.split()[0] if patient.full_name else "Patient"

    # Fetch patient reports that are shared/approved
    reports = (
        db.query(Report)
        .filter(
            Report.patient_id == patient.id,
            Report.shared_with_patient == True
        )
        .order_by(Report.created_at.desc())
        .all()
    )

    # Fetch patient scans
    scans = (
        db.query(Scan)
        .filter(Scan.patient_id == patient.id)
        .order_by(Scan.scan_date.desc(), Scan.created_at.desc())
        .all()
    )

    # Fetch upcoming appointment
    today = date.today()
    upcoming_appt = (
        db.query(Appointment)
        .filter(
            Appointment.patient_id == patient.id,
            Appointment.scheduled_date >= today,
            Appointment.status.in_([AppointmentStatus.scheduled, AppointmentStatus.rescheduled])
        )
        .order_by(Appointment.scheduled_date.asc(), Appointment.scheduled_time.asc())
        .first()
    )

    last_scan_date = str(scans[0].scan_date) if (scans and scans[0].scan_date) else (str(scans[0].created_at.date()) if (scans and scans[0].created_at) else None)
    last_report_id = str(reports[0].id) if reports else None

    # Format real recent reports (last 3)
    recent_reports = []
    for r in reports[:3]:
        mod = r.scan.module.value if (r.scan and hasattr(r.scan.module, "value")) else "breast"
        r_level = r.scan.risk_level.value if (r.scan and r.scan.risk_level) else "low"
        trans = translate_risk_level(r_level)
        rep_date = r.content.get("patient_info", {}).get("report_date") if r.content else ""
        if not rep_date and r.created_at:
            rep_date = r.created_at.strftime("%Y-%m-%d")

        recent_reports.append({
            "id": str(r.id),
            "module": mod,
            "report_type": f"{mod.title()} Screening Examination",
            "date": rep_date,
            "result_badge": trans["label"],
            "result_color": trans["color"],
            "doctor_name": r.doctor.full_name if r.doctor else "Doctor",
        })

    # Next appointment formatted
    next_appt_dict = None
    if upcoming_appt:
        doc = upcoming_appt.doctor
        time_str = upcoming_appt.scheduled_time.strftime("%I:%M %p") if upcoming_appt.scheduled_time else "10:00 AM"
        next_appt_dict = {
            "id": str(upcoming_appt.id),
            "date": str(upcoming_appt.scheduled_date),
            "month_abbr": upcoming_appt.scheduled_date.strftime("%b").upper(),
            "day_num": str(upcoming_appt.scheduled_date.day),
            "time": time_str,
            "type": upcoming_appt.appointment_type or "Follow-up Consultation",
            "doctor_name": doc.full_name if doc else "Doctor",
            "specialty": doc.specialty if doc else "Clinical Specialist",
            "registration_number": doc.registration_number if doc else "DOC-001",
            "location": upcoming_appt.location or "AuraMed Clinical Facility",
            "hospital": doc.hospital if doc else "AuraMed General Hospital",
            "confirmed": True,
            "pending_request": next((request.as_dict() for request in upcoming_appt.change_requests if request.status == "pending"), None),
        }

    timeline_preview = []
    if patient.created_at:
        timeline_preview.append({"date": patient.created_at.strftime("%b %d"), "event": "Registration", "label": "Account Created", "type": "registration"})
    for s in scans[:2]:
        s_date = s.scan_date.strftime("%b %d") if s.scan_date else (s.created_at.strftime("%b %d") if s.created_at else "")
        timeline_preview.append({"date": s_date, "event": f"{s.module.value.title()} Screening", "label": "Scan Completed", "type": "scan"})
    if upcoming_appt:
        timeline_preview.append({"date": upcoming_appt.scheduled_date.strftime("%b %d"), "event": "Doctor Follow-up", "label": "Upcoming", "type": "appointment"})

    health_tips = [
        {
            "id": 1,
            "title": "Why Early Screening Saves Lives",
            "description": "Routine preventative screening identifies subtle variations early, supporting proactive lifestyle management and timely care."
        },
        {
            "id": 2,
            "title": "Understanding Your Screening Cycle",
            "description": "Clinical guidelines recommend regular age-appropriate screenings and routine check-ups with your physician."
        },
        {
            "id": 3,
            "title": "Lifestyle Factors for Wellness",
            "description": "A balanced diet, daily moderate exercise, and regular hydration help support cellular health and metabolic harmony."
        },
    ]

    modules_screened = list(set(
        s.module.value if hasattr(s.module, "value") else str(s.module)
        for s in scans
    )) if scans else []
    last_mod = scans[0].module.value if (scans and hasattr(scans[0].module, "value")) else "breast"

    total_rep_count = len(reports)
    upcoming_count = 1 if upcoming_appt else 0

    return {
        "total_reports": total_rep_count,
        "upcoming_appointments_count": upcoming_count,
        "last_scan_date": last_scan_date or "None",
        "last_scan_module": last_mod,
        "health_modules": modules_screened,
        "recent_reports": recent_reports,
        "next_appointment": next_appt_dict,
        "health_timeline_preview": timeline_preview,
        "timeline_preview": timeline_preview,
        "patient": {
            "id": str(patient.id),
            "full_name": patient.full_name,
            "first_name": first_name,
            "patient_code": patient.patient_code,
        },
        "stats": {
            "total_reports": total_rep_count,
            "upcoming_appointments": upcoming_count,
            "last_scan_date": last_scan_date or "—",
            "last_report_id": last_report_id or "",
            "health_modules": " • ".join(m.title() for m in modules_screened) if modules_screened else "None",
        },
        "health_tips": health_tips,
    }

# --- 2. REPORTS LIST ---
@router.get("/reports")
def get_patient_reports(
    module: Optional[str] = None,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    # Check DB for real reports where shared_with_patient is true
    db_reports = (
        db.query(Report)
        .filter(
            Report.patient_id == patient.id,
            Report.shared_with_patient == True
        )
        .order_by(Report.created_at.desc())
        .all()
    )

    out = []
    for r in db_reports:
        mod = r.scan.module.value if (r.scan and hasattr(r.scan.module, "value")) else "breast"
        if module and module.lower() != "all" and mod.lower() != module.lower():
            continue
        r_level = r.scan.risk_level.value if (r.scan and r.scan.risk_level) else "low"
        trans = translate_risk_level(r_level)
        rep_date = r.content.get("patient_info", {}).get("report_date") if r.content else ""
        if not rep_date and r.created_at:
            rep_date = r.created_at.strftime("%Y-%m-%d")

        out.append({
            "id": str(r.id),
            "report_id": r.report_number,
            "module": mod,
            "report_type": f"{mod.title()} Screening Examination",
            "date": rep_date,
            "result": trans["label"],
            "result_in_plain_language": trans["label"],
            "doctor_name": r.doctor.full_name if r.doctor else "Doctor",
            "hospital": r.doctor.hospital if r.doctor else "AuraMed Hospital",
            "result_badge": trans["label"],
            "result_color": trans["color"],
            "rotterdam_positive": getattr(r.scan, "rotterdam_positive", None) if r.scan else None,
            "rotterdam_criteria_met": getattr(r.scan, "rotterdam_criteria_met", None) if r.scan else None,
        })
    return out


# --- 3. REPORT DETAIL (Plain language translation) ---
@router.get("/reports/{report_id}")
def get_patient_report_detail(
    report_id: str,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    # Lookup report
    real_rep = None
    try:
        ruuid = uuid.UUID(report_id)
        real_rep = db.query(Report).filter(Report.id == ruuid).first()
    except ValueError:
        real_rep = db.query(Report).filter(Report.report_number == report_id).first()

    if not real_rep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Enforce data isolation: 403 Forbidden if not belonging to this patient
    if real_rep.patient_id != patient.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. You do not have permission to view this report."
        )

    # Enforce visibility: only shared or approved reports are accessible
    if not real_rep.shared_with_patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This report has not yet been approved or shared by your physician."
        )

    mod = "breast"
    doc_name = real_rep.doctor.full_name if real_rep.doctor else "Consulting Specialist"
    hosp_name = real_rep.doctor.hospital if (real_rep.doctor and real_rep.doctor.hospital) else "AuraMed General Hospital"
    rep_num = real_rep.report_number
    rep_date = real_rep.created_at.strftime("%Y-%m-%d") if real_rep.created_at else str(date.today())
    is_high = False

    if real_rep.scan:
        mod = real_rep.scan.module.value if hasattr(real_rep.scan.module, "value") else str(real_rep.scan.module)
        is_high = bool(real_rep.scan.risk_level and real_rep.scan.risk_level.value in ("high", "critical"))

    risk_trans = translate_risk_level(real_rep.scan.risk_level.value if real_rep.scan and real_rep.scan.risk_level else "low")

    report_title = {
        "breast": "Breast Screening Examination",
        "cervical": "Cervical Cytology & Visual Inspection",
        "pcos": "Pelvic Ultrasound & Follicular Review",
    }.get(mod, f"{mod.title()} Screening Examination")

    header = {
        "report_id": rep_num,
        "module": mod,
        "report_type": report_title,
        "date": rep_date,
        "result_badge": risk_trans["label"],
        "result_color": risk_trans["color"],
        "patient_name": patient.full_name,
        "patient_code": patient.patient_code,
        "doctor_name": doc_name,
        "hospital": hosp_name,
    }

    # Patient wording comes from the signed report rather than invented anatomy.
    content = real_rep.content or {}
    summary_content = content.get("clinical_summary") or {}
    findings_content = content.get("imaging_findings") or {}
    risk_content = content.get("risk_assessment") or {}
    sharing = content.get("sharing") or {}
    plain_summary = (summary_content.get("clinical_indication") or summary_content.get("summary") or "") if isinstance(summary_content, dict) else str(summary_content)
    plain_summary = plain_summary or f"Your {mod} screening has been reviewed by {doc_name}. Result: {risk_trans['label']}. Review the findings and follow-up plan with your doctor."
    key_findings = findings_content.get("findings_bullets") or [] if isinstance(findings_content, dict) else []
    what_this_means = risk_content.get("recommendation_sentence") or "Screening results support clinical review. Your doctor will explain the findings and any required next steps." if isinstance(risk_content, dict) else str(risk_content)

    diagnostic_criteria_assessment = None
    if mod == "pcos":
        scan = real_rep.scan
        inps = (scan.clinical_inputs if scan else None) or {}
        rot_c = (real_rep.content.get("rotterdam_criteria") if (real_rep.content and isinstance(real_rep.content, dict)) else None) or {}

        c_oligo = rot_c.get("criterion_oligo_anovulation") if "criterion_oligo_anovulation" in rot_c else (getattr(scan, "criterion_oligo_anovulation", None) if scan else None)
        c_hyper = rot_c.get("criterion_hyperandrogenism") if "criterion_hyperandrogenism" in rot_c else (getattr(scan, "criterion_hyperandrogenism", None) if scan else None)
        c_poly = rot_c.get("criterion_polycystic_ovaries") if "criterion_polycystic_ovaries" in rot_c else (getattr(scan, "criterion_polycystic_ovaries", None) if scan else None)

        if c_oligo is None or c_hyper is None or c_poly is None:
            c_oligo = bool(inps.get("criterion_oligo_anovulation") or inps.get("oligo_anovulation_present") or str(inps.get("menstrual_regularity") or "").lower() in ("irregular", "absent"))
            c_hyper = bool(inps.get("criterion_hyperandrogenism") or inps.get("hyperandrogenism_present") or any(x in str(inps.get("clinical_symptoms") or "") for x in ["hirsutism", "acne"]))
            c_poly = bool((scan and scan.image_model_score and scan.image_model_score > 0.55) or "polycystic" in str(scan.reasoning if scan else "").lower())

        met_count = (1 if c_oligo else 0) + (1 if c_hyper else 0) + (1 if c_poly else 0)
        is_pos = met_count >= 2

        diagnostic_criteria_assessment = {
            "heading": "Diagnostic Criteria Assessment",
            "items": [
                {
                    "name": "Irregular periods",
                    "status": "Detected" if c_oligo else "Not detected",
                    "met": bool(c_oligo),
                    "detected": bool(c_oligo),
                },
                {
                    "name": "Hormone markers",
                    "status": "Elevated" if c_hyper else "Normal",
                    "met": bool(c_hyper),
                    "detected": bool(c_hyper),
                },
                {
                    "name": "Ovarian appearance",
                    "status": "Consistent with PCOS" if c_poly else "Normal",
                    "met": bool(c_poly),
                    "detected": bool(c_poly),
                },
            ],
            "summary": (
                "Based on your scan and clinical history, 2 or more PCOS diagnostic criteria were identified. Your doctor will discuss next steps with you."
                if is_pos else
                "Your results did not meet the threshold for a PCOS diagnosis based on current findings."
            ),
            "summary_line": (
                "Based on your scan and clinical history, 2 or more PCOS diagnostic criteria were identified. Your doctor will discuss next steps with you."
                if is_pos else
                "Your results did not meet the threshold for a PCOS diagnosis based on current findings."
            ),
            "is_positive": is_pos,
        }

    summary_tab = {
        "plain_paragraph": plain_summary,
        "highlight_box": risk_trans["summary_box"],
        "key_findings": key_findings,
        "what_this_means": what_this_means,
        "diagnostic_criteria_assessment": diagnostic_criteria_assessment,
        "disclaimer": "If you have questions about this report, please contact your doctor. This report is meant to support discussions with your healthcare provider.",
    }

    observations = findings_content.get("observations") or "See the signed report for detailed findings." if isinstance(findings_content, dict) else str(findings_content)
    findings_tab = {"description": "Findings recorded in your doctor's report:", "sections": [{"title": "Screening findings", "details": observations}]}
    recs = content.get("recommendations") or {}
    if isinstance(recs, dict):
        recs_text = "\n".join(str(item) for item in recs.get("recommendations_list", [])) or recs.get("followup_interval") or "Contact your doctor to confirm the follow-up plan."
    else:
        recs_text = str(recs) or "Contact your doctor to confirm the follow-up plan."
    upcoming = db.query(Appointment).filter(Appointment.patient_id == patient.id, Appointment.scheduled_date >= date.today(), Appointment.status.in_([AppointmentStatus.scheduled, AppointmentStatus.rescheduled])).order_by(Appointment.scheduled_date).first()
    recs_tab = {"doctor_advice": recs_text, "lifestyle_notes": "Ask your doctor about advice specific to your health.", "next_appointment": {"date": str(upcoming.scheduled_date), "time": upcoming.scheduled_time, "location": upcoming.location} if upcoming else None}

    # TAB 4: NEXT STEPS & FAQ
    next_steps_tab = {
        "steps": [
            {"step": 1, "title": "Discuss with Your Physician", "text": f"{doc_name} is readily available to answer questions and explain recommendations in detail."},
            {"step": 2, "title": "Confirm Follow-up Timing", "text": "If an appointment has been scheduled, please review the date and arrive 15 minutes early."},
            {"step": 3, "title": "Bring Past Records", "text": "Keep prior reports accessible in this portal—our doctors review historical trends for greater precision."},
        ],
        "faq": [
            {
                "q": "Does a follow-up recommendation mean I have cancer?",
                "a": "A screening result alone is not a diagnosis. Your doctor will interpret the result and explain whether further examination is needed."
            },
            {
                "q": "How can I prepare for my consultation?",
                "a": "Wear comfortable clothing, prepare a list of any questions or symptoms you wish to discuss, and review your family health history."
            },
            {
                "q": "Can I share this report with another doctor?",
                "a": "Yes. You can click 'Download PDF' or 'Share with Doctor' to transmit certified records anytime."
            },
        ]
    }

    # Previous reports from actual patient history
    previous_reps = (
        db.query(Report)
        .filter(
            Report.patient_id == patient.id,
            Report.id != real_rep.id,
            Report.shared_with_patient == True
        )
        .order_by(Report.created_at.desc())
        .limit(5)
        .all()
    )
    previous_reports = []
    for pr in previous_reps:
        p_mod = pr.scan.module.value if (pr.scan and hasattr(pr.scan.module, "value")) else "breast"
        p_risk = pr.scan.risk_level.value if (pr.scan and pr.scan.risk_level) else "low"
        p_trans = translate_risk_level(p_risk)
        previous_reports.append({
            "id": str(pr.id),
            "report_id": pr.report_number,
            "date": pr.created_at.strftime("%Y-%m-%d") if pr.created_at else "",
            "type": f"{p_mod.title()} Screening Examination",
            "result_badge": p_trans["label"],
            "result_color": p_trans["color"],
        })

    return {
        "report_id": rep_num,
        "plain_language_summary": plain_summary,
        "plain_language_findings": findings_tab["description"],
        "doctor_recommendations": recs_tab["doctor_advice"],
        "next_steps": next_steps_tab["steps"],
        "doctor_name": doc_name,
        "hospital": hosp_name,
        "sharing_message": sharing.get("message", ""),
        "header": header,
        "summary_tab": summary_tab,
        "findings_tab": findings_tab,
        "recommendations_tab": recs_tab,
        "next_steps_tab": next_steps_tab,
        "previous_reports": previous_reports,
    }


@router.get("/reports/{report_id}/pdf")
def download_patient_report_pdf(
    report_id: str,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    from app.services.pdf_generator import generate_report_pdf, generate_clinical_report_pdf
    from fastapi.responses import StreamingResponse
    import io

    # Check if this matches a real report in DB
    real_rep = None
    try:
        ruuid = uuid.UUID(report_id)
        real_rep = db.query(Report).filter(Report.id == ruuid, Report.patient_id == patient.id).first()
    except ValueError:
        real_rep = db.query(Report).filter(Report.report_number == report_id, Report.patient_id == patient.id).first()

    if real_rep:
        if not real_rep.shared_with_patient:
            raise HTTPException(status_code=403, detail="Your doctor has not shared this report yet.")
        doctor = real_rep.doctor
        scan = real_rep.scan
        from app.services.workflow import recipient_pdf_report
        pdf_bytes = generate_report_pdf(recipient_pdf_report(real_rep), scan, patient, doctor)
        patient_name = patient.full_name.replace(" ", "_") if patient.full_name else "Patient"
        mod_name = scan.module.value if (scan and hasattr(scan.module, "value")) else "screening"
        date_str = datetime.utcnow().strftime("%Y%m%d")
        filename = f"AuraMed_{patient_name}_{mod_name.title()}_{date_str}.pdf"
    else:
        # Generate official clinical PDF based on patient report detail
        rep_detail = get_patient_report_detail(report_id, db=db, patient=patient)
        header = rep_detail.get("header", {})
        summary = rep_detail.get("summary_tab", {})
        findings = rep_detail.get("findings_tab", {})
        recs = rep_detail.get("recommendations_tab", {})

        report_data = {
            "id": report_id,
            "report_number": header.get("report_id", "RPT-2026-0001"),
            "status": "signed",
            "signed_at": "2026-09-08 14:30 UTC",
            "signed_by_doctor_name": header.get("doctor_name", "Dr. Kavitha Mehta"),
            "signed_by_doctor_reg": "TNMC123456",
            "signed_by_doctor_specialty": "Gynecologic Oncology",
            "signed_by_doctor_hospital": header.get("hospital", "AuraMed Hospital"),
            "content": {
                "patient_info": {
                    "name": patient.full_name or header.get("patient_name", "Anita Sharma"),
                    "patient_id": patient.patient_code or header.get("patient_code", "P-2026-0004"),
                    "report_date": header.get("date", "2026-09-08"),
                    "gender": patient.gender or "Female",
                    "dob": str(patient.date_of_birth) if patient.date_of_birth else "1984-06-12",
                    "doctor_name": header.get("doctor_name", "Dr. Kavitha Mehta"),
                    "doctor_registration": "TNMC123456",
                    "indication": f"{header.get('module', 'Breast').title()} Screening Examination",
                },
                "clinical_summary": {
                    "clinical_indication": f"{header.get('module', 'Breast').title()} Evaluation",
                    "factors": {
                        "Screening Status": "Completed & Certified",
                        "Clinical Notes": summary.get("plain_paragraph", "")[:120],
                    }
                },
                "imaging_findings": {
                    "observations": "\n".join([f"{s.get('title')}: {s.get('details')}" for s in findings.get("sections", [])]),
                    "findings_bullets": [s.get("title") for s in findings.get("sections", [])],
                },
                "ai_assessment": {
                    "assessment_rows": [
                        {"parameter": "AI Image Classification", "result": "Normal" if header.get("result_color") == "green" else "Flagged for Clinical Correlation", "status": "Reviewed"},
                        {"parameter": "Clinical Guideline Scoring", "result": "Standard Consensus Concordant", "status": "Concordant"},
                    ]
                },
                "risk_assessment": {
                    "risk_level": "low" if header.get("result_color") == "green" else "high",
                    "risk_category": header.get("result_badge", "Normal"),
                    "overall_score": 0.22 if header.get("result_color") == "green" else 0.78,
                    "fusion_score": 0.20 if header.get("result_color") == "green" else 0.75,
                },
                "recommendations": {
                    "doctor_recommendations": recs.get("doctor_advice", "Follow routine preventative screening schedule."),
                    "additional_notes": recs.get("lifestyle_notes", ""),
                }
            }
        }
        pdf_bytes = generate_clinical_report_pdf(report_data)
        patient_name = (patient.full_name or "Patient").replace(" ", "_")
        mod_name = header.get("module", "screening")
        date_str = datetime.utcnow().strftime("%Y%m%d")
        filename = f"AuraMed_{patient_name}_{mod_name.title()}_{date_str}.pdf"

    log_action(
        db,
        user_id=patient.user_id,
        user_type="patient",
        action="PATIENT_REPORT_PDF_DOWNLOADED",
        resource_type="report",
        resource_id=real_rep.id if real_rep else patient.id,
        details={"report_id": report_id, "filename": filename},
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# --- 4. APPOINTMENTS ---
@router.get("/appointments")
def get_patient_appointments(
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    today = date.today()
    all_appts = (
        db.query(Appointment)
        .filter(Appointment.patient_id == patient.id)
        .order_by(Appointment.scheduled_date.asc(), Appointment.scheduled_time.asc())
        .all()
    )

    upcoming_list = []
    past_list = []

    for a in all_appts:
        doc = a.doctor
        doc_name = doc.full_name if doc else "Consulting Doctor"
        specialty = doc.specialty if doc else "Clinical Specialist"
        hosp = doc.hospital if (doc and doc.hospital) else "AuraMed General Hospital"
        reg = doc.registration_number if doc else "DOC-001"
        time_str = a.scheduled_time.strftime("%I:%M %p") if a.scheduled_time else "10:00 AM"
        date_formatted = a.scheduled_date.strftime("%B %d, %Y") if a.scheduled_date else ""
        date_iso = str(a.scheduled_date) if a.scheduled_date else ""

        is_completed = a.status == AppointmentStatus.completed
        is_cancelled = a.status == AppointmentStatus.cancelled
        is_scheduled = a.status in (AppointmentStatus.scheduled, AppointmentStatus.rescheduled)

        item = {
            "id": str(a.id),
            "appointment_id": str(a.id),
            "pending_request": next((request.as_dict() for request in a.change_requests if request.status == "pending"), None),
            "type": a.appointment_type or "Clinical Consultation",
            "appointment_type": a.appointment_type or "Clinical Consultation",
            "doctor": doc_name,
            "doctor_name": doc_name,
            "specialty": specialty,
            "registration_number": reg,
            "date": date_formatted,
            "date_iso": date_iso,
            "scheduled_date": date_iso,
            "time": time_str,
            "time_slot": f"{time_str} - 30 mins",
            "scheduled_time": time_str,
            "location": a.location or "AuraMed Clinical Facility",
            "hospital": hosp,
            "status": a.status.value if hasattr(a.status, "value") else str(a.status),
            "status_badge": "Confirmed" if is_scheduled else ("Completed" if is_completed else "Cancelled"),
            "status_color": "green" if is_completed else ("teal" if is_scheduled else "rose"),
            "notes": a.notes or "",
        }

        if is_scheduled and a.scheduled_date >= today:
            upcoming_list.append(item)
        else:
            past_list.append(item)

    upcoming_featured = upcoming_list[0] if upcoming_list else None

    stats = {
        "upcoming_count": len(upcoming_list),
        "completed_count": sum(1 for a in all_appts if a.status == AppointmentStatus.completed),
        "rescheduled_count": sum(1 for a in all_appts if a.status == AppointmentStatus.rescheduled),
        "cancelled_count": sum(1 for a in all_appts if a.status == AppointmentStatus.cancelled),
    }

    calendar_dates = [u["date_iso"] for u in upcoming_list if u.get("date_iso")]

    return {
        "stats": stats,
        "upcoming": upcoming_featured,
        "upcoming_list": upcoming_list,
        "calendar_dates": calendar_dates,
        "past": past_list,
        "items": upcoming_list + past_list,
    }

def _patient_appointment(db, patient, appointment_id):
    try: aid = uuid.UUID(appointment_id)
    except ValueError: raise HTTPException(status_code=404, detail="Appointment not found")
    appointment = db.query(Appointment).filter(Appointment.id == aid, Appointment.patient_id == patient.id).first()
    if not appointment: raise HTTPException(status_code=404, detail="Appointment not found")
    return appointment


def _notify_appointment_doctor(db, appointment, title, message):
    from app.services.notifications import create_notification
    create_notification(recipient_user_id=appointment.doctor.user_id, recipient_type='doctor', notification_type='APPOINTMENT_UPDATED', title=title, message=message, related_resource_type='appointment', related_resource_id=str(appointment.id), db=db)


@router.patch("/appointments/{id}/reschedule")
def reschedule_appointment(
    id: str,
    payload: RescheduleAppointmentPayload,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    appointment = _patient_appointment(db, patient, id)
    if appointment.status not in (AppointmentStatus.scheduled, AppointmentStatus.rescheduled):
        raise HTTPException(status_code=409, detail="Only upcoming appointments can be rescheduled.")
    try:
        requested_date = date.fromisoformat(payload.preferred_date)
        raw_time = payload.preferred_time or '10:30'
        requested_time = datetime.strptime(raw_time, '%I:%M %p' if 'M' in raw_time.upper() else '%H:%M').time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Enter a valid date and time.")
    if requested_date < date.today():
        raise HTTPException(status_code=400, detail="Choose today or a future date.")
    change = next((request for request in appointment.change_requests if request.status == 'pending'), None)
    if change is None:
        change = AppointmentChangeRequest(appointment_id=appointment.id)
    change.preferred_date = requested_date
    change.preferred_time = requested_time
    change.reason = payload.reason
    db.add(change); db.commit()
    _notify_appointment_doctor(db, appointment, 'Appointment date change requested', f'{patient.full_name} requests {requested_date} at {requested_time.strftime("%H:%M")}. Review and confirm the date in Appointments.')
    log_action(
        db,
        user_id=patient.user_id,
        user_type="patient",
        action="appointment_reschedule_requested",
        resource_type="appointment",
        resource_id=appointment.id,
        details={"appointment_id": id, "preferred_date": payload.preferred_date, "preferred_time": payload.preferred_time},
    )
    return {
        "id": id,
        "status": "pending",
        "message": f"Reschedule request submitted for {payload.preferred_date} at {payload.preferred_time}. Your clinic care coordinator will confirm shortly.",
    }

@router.patch("/appointments/{id}/cancel")
def cancel_appointment(
    id: str,
    payload: CancelAppointmentPayload,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    appointment = _patient_appointment(db, patient, id)
    if appointment.status not in (AppointmentStatus.scheduled, AppointmentStatus.rescheduled):
        raise HTTPException(status_code=409, detail="This appointment cannot be cancelled.")
    appointment.status = AppointmentStatus.cancelled
    appointment.notes = f'{appointment.notes or ""}\n[Patient cancellation]: {payload.reason or "Not specified"}'.strip()
    for change in appointment.change_requests:
        if change.status == 'pending': change.status = 'cancelled'
    db.commit()
    _notify_appointment_doctor(db, appointment, 'Appointment cancelled by patient', f'{patient.full_name} cancelled the appointment on {appointment.scheduled_date}.')
    log_action(
        db,
        user_id=patient.user_id,
        user_type="patient",
        action="appointment_cancelled_by_patient",
        resource_type="appointment",
        resource_id=appointment.id,
        details={"appointment_id": id, "reason": payload.reason},
    )
    return {
        "id": id,
        "status": "cancelled",
        "message": "Appointment cancelled. Your doctor has been notified.",
    }

# --- 5. TIMELINE ---
@router.get("/timeline")
def get_patient_timeline(
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    scans = db.query(Scan).filter(Scan.patient_id == patient.id).order_by(Scan.created_at.desc()).all()
    reports = db.query(Report).filter(Report.patient_id == patient.id, Report.shared_with_patient == True).order_by(Report.created_at.desc()).all()
    appointments = db.query(Appointment).filter(Appointment.patient_id == patient.id).all()
    events = []
    for report in reports:
        module = report.scan.module.value if report.scan else "screening"
        events.append({"id": str(report.id), "date": str((report.shared_at or report.created_at).date()),
                       "module": module, "dot_color": "teal", "title": f"{module.title()} report shared",
                       "description": f"{report.doctor.full_name} shared report {report.report_number}.",
                       "action_label": "View Report", "action_link": f"/patient/reports/{report.id}"})
    for appointment in appointments:
        events.append({"id": str(appointment.id), "date": str(appointment.scheduled_date), "module": "appointment",
                       "dot_color": "blue", "title": appointment.appointment_type or "Appointment",
                       "description": f"{appointment.status.value.title()} appointment with {appointment.doctor.full_name}.",
                       "action_label": "View appointment", "action_link": "/patient/appointments"})
    if patient.created_at:
        events.append({"id": "registration", "date": str(patient.created_at.date()), "module": "registration",
                       "dot_color": "gray", "title": "Care profile created", "description": "Your AuraMed account was registered.",
                       "action_label": "View profile", "action_link": "/patient/profile"})
    events.sort(key=lambda item: item["date"], reverse=True)
    health_summary = []
    for module, label, icon in [("breast", "Breast Health", "ribbon"), ("cervical", "Cervical Health", "uterus"), ("pcos", "PCOS Risk", "pcos")]:
        latest = next((r.scan for r in reports if r.scan and r.scan.module.value == module), None)
        translated = translate_risk_level(latest.risk_level.value) if latest and latest.risk_level else {"label": "Not assessed", "color": "gray"}
        health_summary.append({"module": label, "icon": icon, "last_screened": str(latest.scan_date) if latest and latest.scan_date else None,
                               "last_assessed": str(latest.scan_date) if latest and latest.scan_date else None,
                               "status_badge": translated["label"], "status_color": translated["color"]})
    return {"events": events, "health_summary": health_summary}

# --- 6. PROFILE ---
@router.get("/profile")
def get_patient_profile(
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    u: User = patient.user
    preferences = (patient.consent or {}).get("notification_preferences", {})
    pending = db.query(DataDeletionRequest).filter(DataDeletionRequest.patient_id == patient.id, DataDeletionRequest.status == "pending").first()
    return {"id": str(patient.id), "full_name": patient.full_name, "patient_code": patient.patient_code,
            "date_of_birth": str(patient.date_of_birth) if patient.date_of_birth else None,
            "gender": patient.gender, "blood_group": patient.blood_group, "email": u.email if u else None,
            "phone": patient.phone, "emergency_contact": patient.emergency_contact_phone or "",
            "address": patient.address or "", "email_notifications": preferences.get("email", True),
            "sms_notifications": preferences.get("sms", True), "data_deletion_pending": bool(pending)}

@router.patch("/profile")
def update_patient_profile(
    payload: UpdateProfilePayload,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    if payload.emergency_contact is not None:
        patient.emergency_contact_phone = payload.emergency_contact
    consent = dict(patient.consent or {})
    preferences = dict(consent.get("notification_preferences") or {})
    if payload.email_notifications is not None:
        preferences["email"] = payload.email_notifications
    if payload.sms_notifications is not None:
        preferences["sms"] = payload.sms_notifications
    consent["notification_preferences"] = preferences
    patient.consent = consent
    if payload.phone is not None:
        patient.phone = payload.phone
    if payload.address is not None:
        patient.address = payload.address
    if payload.email is not None and patient.user:
        patient.user.email = payload.email
    db.commit()

    log_action(
        db,
        user_id=patient.user_id,
        user_type="patient",
        action="PATIENT_PROFILE_UPDATED",
        resource_type="patient_profile",
        resource_id=patient.id,
        details={"updated_fields": [k for k, v in payload.dict().items() if v is not None]},
    )

    return {
        "message": "Contact details and preferences updated successfully.",
        "phone": patient.phone,
        "email": patient.user.email if patient.user else None,
        "address": getattr(patient, "address", None),
    }

@router.post("/change-password")
def change_patient_password(
    payload: ChangePasswordPayload,
    request: Request,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient),
):
    from app.core.security import verify_password, hash_password, validate_password_policy
    u: User = patient.user
    if not u or not verify_password(payload.current_password, u.password_hash):
        raise HTTPException(status_code=400, detail="Current password does not match.")

    if payload.confirm_new_password is not None:
        if payload.new_password != payload.confirm_new_password:
            raise HTTPException(status_code=400, detail="New password and confirm password do not match.")

    try:
        validate_password_policy(payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    u.password_hash = hash_password(payload.new_password)
    db.commit()

    log_action(
        db,
        user_id=patient.user_id,
        user_type="patient",
        action="PASSWORD_CHANGED",
        resource_type="user",
        resource_id=patient.user_id,
        request=request,
    )
    return {"message": "Password updated successfully."}


@router.post("/export-data")
def export_patient_data(
    request: Request,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient),
):
    """
    Generates export of patient's own data:
      Personal information
      All their reports (patient-friendly version)
      All their appointments
    Returns as JSON file download
    Audit log: DATA_EXPORTED
    """
    u: User = patient.user

    # 1. Personal Information
    personal_info = {
        "full_name": patient.full_name,
        "patient_code": patient.patient_code,
        "date_of_birth": str(patient.date_of_birth) if patient.date_of_birth else None,
        "gender": patient.gender,
        "blood_group": patient.blood_group,
        "phone": patient.phone,
        "email": u.email if u else None,
        "address": getattr(patient, "address", None),
        "emergency_contact": getattr(patient, "emergency_contact_phone", None),
        "created_at": patient.created_at.isoformat() if hasattr(patient, "created_at") and patient.created_at else None,
    }

    # 2. Patient Reports (patient-friendly format)
    db_reports = (
        db.query(Report)
        .filter(Report.patient_id == patient.id, Report.shared_with_patient == True)
        .order_by(Report.created_at.desc())
        .all()
    )
    reports_export = []
    for r in db_reports:
        mod = r.scan.module.value if (r.scan and hasattr(r.scan.module, "value")) else "breast"
        r_level = r.scan.risk_level.value if (r.scan and r.scan.risk_level) else "low"
        trans = translate_risk_level(r_level)
        content = r.content or {}
        reports_export.append({
            "report_id": r.report_number,
            "module": mod.title(),
            "date": r.created_at.strftime("%Y-%m-%d") if r.created_at else "",
            "summary": trans["label"],
            "findings": content.get("plain_language_findings") or trans["summary_box"]["message"],
            "doctor_name": r.doctor.full_name if r.doctor else "AuraMed Clinician",
            "hospital": r.doctor.hospital if r.doctor else "AuraMed Hospital",
            "status": "Signed & Verified",
        })

    # 3. Appointments
    appts = (
        db.query(Appointment)
        .filter(Appointment.patient_id == patient.id)
        .order_by(Appointment.scheduled_date.desc())
        .all()
    )
    appointments_export = [
        {
            "id": str(a.id),
            "appointment_type": a.appointment_type,
            "scheduled_date": str(a.scheduled_date),
            "scheduled_time": a.scheduled_time.strftime("%H:%M") if a.scheduled_time else "10:00",
            "location": a.location,
            "status": a.status.value if hasattr(a.status, "value") else str(a.status),
            "notes": a.notes,
        }
        for a in appts
    ]

    import json
    from datetime import timezone
    bundle = {
        "personal_information": personal_info,
        "reports": reports_export,
        "appointments": appointments_export,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "data_protection_standard": "Indian DPDP Act 2023 / Right to Data Portability",
    }

    json_str = json.dumps(bundle, indent=2)
    filename = f"auramed_patient_data_{patient.patient_code}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    log_action(
        db,
        user_id=patient.user_id,
        user_type="patient",
        action="DATA_EXPORTED",
        resource_type="patient_profile",
        resource_id=patient.id,
        details={"record_counts": {"reports": len(reports_export), "appointments": len(appointments_export)}},
        request=request,
    )

    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/data-deletion-request")
def request_patient_data_deletion(
    payload: DataDeletionRequestPayload,
    db: Session = Depends(get_db),
    patient: PatientProfile = Depends(get_current_patient)
):
    req = DataDeletionRequest(
        patient_id=patient.id,
        reason=payload.reason,
        request_type=payload.request_type,
        status="pending",
    )
    db.add(req)
    db.commit()

    log_action(
        db,
        user_id=patient.user_id,
        user_type="patient",
        action="DELETION_REQUEST_SUBMITTED",
        resource_type="data_deletion_request",
        resource_id=req.id,
        details={"request_type": payload.request_type, "reason": payload.reason},
    )

    return {
        "message": "Your data erasure request has been submitted for administrative and compliance review.",
        "request_id": f"REQ-{str(req.id)[:8].upper()}",
        "status": "pending",
    }



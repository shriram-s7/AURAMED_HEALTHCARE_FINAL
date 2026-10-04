from app.models.enums import ReportStatus

FINAL_REPORT_STATES = {ReportStatus.signed, ReportStatus.addendum, ReportStatus.approved, ReportStatus.shared_with_patient}

def report_is_finalized(report):
    return bool(report.signed_at) or report.status in FINAL_REPORT_STATES


def recipient_pdf_report(report):
    """Create an export view; the signed original is never rewritten."""
    from types import SimpleNamespace
    content = dict(report.content or {})
    sections = (content.get('sharing') or {}).get('sections') or {}
    content['_shared_sections'] = sections
    return SimpleNamespace(id=report.id, report_number=report.report_number, status=report.status, signed_at=report.signed_at, content=content)

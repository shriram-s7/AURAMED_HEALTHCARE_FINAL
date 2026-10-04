export const FINAL_REPORT_STATES = ['signed', 'addendum', 'approved', 'shared_with_patient']
export function isReportFinalized(report) {
  return Boolean(report?.signed_at) || FINAL_REPORT_STATES.includes(report?.status)
}

export function moduleFromPath(path, fallback = 'breast') {
  return path.match(/\/scan\/(breast|cervical|pcos)(?:\/|$)/)?.[1] || fallback
}

export function followupDate(interval = '', now = new Date()) {
  const text = String(interval).toLowerCase()
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(day|week|month|year)/)
  const single = text.match(/(\d+)\s*(day|week|month|year)/)
  const amount = range ? (Number(range[1]) + Number(range[2])) / 2 : single ? Number(single[1]) : 1
  const unit = range?.[3] || single?.[2] || (text.includes('annual') ? 'year' : text.includes('month') ? 'month' : text.includes('week') ? 'week' : 'day')
  const days = Math.round(amount * ({ day: 1, week: 7, month: 30, year: 365 }[unit]))
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function workflowPage(path, query = '') {
  const role = path.split('/')[1]
  const home = `/${role}`
  const params = new URLSearchParams(query)
  const patient = params.get('patientId')
  const scan = path.match(/^\/doctor\/scan\/(breast|cervical|pcos)(?:\/(results|report|share)\/([^/]+))?$/)
  if (scan) {
    const [, module, stage, id] = scan
    const stages = { results: 2, report: 3, share: 4 }
    return { home, title: `${module === 'pcos' ? 'PCOS' : module[0].toUpperCase() + module.slice(1)} screening`,
      back: stage === 'share' ? `/doctor/scan/${module}/report/${id}` : stage === 'report' ? `/doctor/scan/${module}/results/${id}` : stage === 'results' ? `/doctor/scan/${module}?scanId=${id}` : patient ? `/doctor/patients/${patient}` : '/doctor/patients',
      backLabel: stage === 'share' ? 'Back to report' : stage === 'report' ? 'Back to results' : stage === 'results' ? 'Back to inputs' : patient ? 'Back to patient' : 'Back to patients',
      hint: !stage ? '1. Select a patient and enter inputs → 2. Review results → 3. Review and sign report → 4. Share and schedule follow-up.' : `${stages[stage]} of 4 · ${stage === 'results' ? 'Review findings, then prepare the report.' : stage === 'report' ? 'Review and save your edits before signing. Signed reports stay locked.' : 'Share the signed report, then confirm the follow-up appointment.'}` }
  }
  if(path==='/doctor/examinations/new') return {home, back:patient?'/doctor/examinations/new':'/doctor',backLabel:patient?'Back to patient selection':'Back to workspace',title:'New examination',hint:'Choose a patient, then an examination.'}
  if (path.startsWith('/doctor/referrals/new/')) return { home, back: referralReturnPath(params.get('returnTo'), path.split('/').pop()), backLabel: 'Back to examination / patient', title: 'New referral', hint: 'Record the referral, then return to the examination.' }
  const detail = path.match(/^\/(doctor|patient)\/(patients|reports)\/([^/]+)$/)
  if (detail) return { home, back: `/${role}/${detail[2]}`, backLabel: `Back to ${detail[2]}`, title: detail[3] === 'new' ? 'New patient' : `${detail[2] === 'patients' ? 'Patient record' : 'Report details'}`, hint: detail[3] === 'new' ? 'Complete basic information, medical history and consent, then review and save. Your unfinished form is kept in this browser session.' : detail[2] === 'patients' ? 'Patient record → screening → results → signed report → follow-up. Use the tabs to review the complete record.' : 'Review the report, download its PDF and check the follow-up plan.' }
  const section = path.split('/')[2] || 'dashboard'
  const hints = {
    doctor: { dashboard: 'Start with a patient, continue a screening, or review appointments and reports.', patients: 'Select a patient or register a new patient to begin a screening.', appointments: 'Schedule, reschedule or complete appointments. Changes appear in the patient portal.', reports: 'Open a draft to continue editing, or a signed report to share it or add an addendum.', referrals: 'Choose a patient and specialist, review attachments, then send the referral.', recalls: 'Review due follow-ups and track reminder delivery.', settings: 'Edit a section and save it to apply changes.' },
    patient: { dashboard: 'Review your latest shared reports and your next appointment.', reports: 'Reports appear here after your doctor shares them. Open one to review findings and download the PDF.', appointments: 'Review upcoming appointments and request a new date or cancel when needed.', timeline: 'Your screenings, shared reports and appointments in date order.', profile: 'Update contact details and notification choices, then save.' },
    admin: { dashboard: 'Review pending doctor approvals, patient requests and system activity.', doctors: 'Review registration details, verify doctors and manage account access.', patients: 'Review patient records and manage account requests.', scans: 'Review screening records across modules.', reports: 'Review report status and patient sharing.', appointments: 'Review clinic appointments and cancellations.', 'data-requests': 'Review the request, check retained records, then approve or explain a rejection.', 'audit-logs': 'Review recorded system actions and filter by actor or event.', settings: 'Save each settings section to apply changes. Review operation outcomes before continuing.' },
  }
  return { home, back: home, backLabel: 'Back to dashboard', title: section.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase()), hint: hints[role]?.[section] || 'Review the details, complete the action, then return to the previous screen.' }
}

export function referralReturnPath(value, patientId) {
  return /^\/doctor\/(?:scan\/(?:breast|cervical|pcos)\/(?:results|report|share)\/[a-zA-Z0-9-]+|(?:reports|patients)\/[a-zA-Z0-9-]+)(?:\?[^#]*)?$/.test(value || '') ? value : `/doctor/patients/${patientId}`
}
export function referralPath(patientId, scanId, returnTo) {
  const query = new URLSearchParams({ returnTo: referralReturnPath(returnTo, patientId) })
  if (scanId) query.set('scanId', scanId)
  return `/doctor/referrals/new/${patientId}?${query}`
}

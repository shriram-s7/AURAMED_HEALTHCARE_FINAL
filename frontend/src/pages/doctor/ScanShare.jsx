import { HOSTED_DEMO } from '../../config/demoAccess'
import {CareHeader,CareAction,CareNotice,CareComplete,Disclosure} from '../../components/common/CareUI'
import AppointmentReminders from '../../components/doctor/AppointmentReminders'
import api from '../../services/api'
import { referralPath, moduleFromPath, isReportFinalized, followupDate as recommendedDate } from '../../utils/workflow'
import { useDraftState } from '../../hooks/useDraftState'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import DoctorLayout from '../../components/doctor/DoctorLayout'
import RiskBadgeLarge from '../../components/doctor/scan-results/RiskBadgeLarge'
import ScanResultsSkeleton from '../../components/doctor/scan-results/ScanResultsSkeleton'
import ReportStepper from '../../components/doctor/report/ReportStepper'
import {
  fetchReportForScan,
  generateReportPdf,
  shareReportWithPatient,
} from '../../services/reportService'
import { scheduleAppointment } from '../../services/appointmentService'
import { triggerPdfDownload } from '../../utils/downloadPdf'

function ScanShare() {
  const params=useParams()
  const location=useLocation()
  const module=params.module||moduleFromPath(location.pathname)
  const scanId=params.scanId||params.id
  const [appointment,setAppointment]=useState(null)
  const [referrals, setReferrals] = useState(null)
  const [suggested,setSuggested]=useState('')
  const [confirmChange,setConfirmChange]=useState(false)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null)

  // Section 2: Selected contents
  const [contents, setContents] = useDraftState('contents', {
    patient_info: true,
    clinical_summary: true,
    imaging_findings: true,
    ai_results: true,
    risk_assessment: true,
    recommendations: true,
    reference_ranges: true,
  })

  // Section 3: Delivery Options
  const [sharePatient, setSharePatient] = useDraftState('sharePatient', true)
  const [deliveryChannel, setDeliveryChannel] = useDraftState('deliveryChannel', 'portal') // portal, email, sms
  const [sharePhysician, setSharePhysician] = useDraftState('sharePhysician', false)
  const [selectedPhysician, setSelectedPhysician] = useDraftState('selectedPhysician', '')
  const [patientMessage, setPatientMessage] = useDraftState('patientMessage', 
    'Your clinical screening analysis is complete. Please review the attached findings and follow-up plan.'
  )
  const [physicians, setPhysicians] = useState([])
  const [followupTime, setFollowupTime] = useDraftState('followupTime', '10:30')
  const [followupLocation, setFollowupLocation] = useDraftState('followupLocation', '')
  const [sharing, setSharing] = useState(false)
  const [sharedSuccess, setSharedSuccess] = useState(false)

  // Section 4: Schedule Follow-up
  const [followupType, setFollowupType] = useDraftState('followupType', '')
  const [followupDate, setFollowupDate] = useDraftState('followupDate', '')
  const [followupNotes, setFollowupNotes] = useDraftState('followupNotes', '')
  const [scheduling, setScheduling] = useState(false)
  const [scheduleSuccess, setScheduleSuccess] = useState(false)

  const [toastMsg, setToastMsg] = useState('')

  useEffect(() => {
    if (!scanId) return
    setLoading(true)
    setError(null)
    api.get('/auth/me').then(res => setFollowupLocation(previous => previous || res.data.profile?.hospital || 'AuraMed Clinic')).catch(() => {})
    api.get('/doctor/referrals').then(res => setReferrals((res.data || []).filter(item => item.attachments?.scan_id === scanId && item.status !== 'cancelled'))).catch(() => setReferrals(null))
    api.get('/doctor/report-recipients').then(res => setPhysicians(res.data)).catch(() => setPhysicians([]))
    api.get('/doctor/appointments', { params: { scan_id: scanId, page_size: 100 } }).then(res => {
      const upcoming = (res.data.items || []).find(item => ['scheduled', 'rescheduled'].includes(item.status) && item.scheduled_date >= new Date().toISOString().slice(0, 10))
      setScheduleSuccess(Boolean(upcoming))
      setAppointment(upcoming||null)
      if (upcoming) {
        setFollowupDate(upcoming.scheduled_date)
        setFollowupTime(upcoming.scheduled_time)
        setFollowupLocation(upcoming.location)
        setFollowupType(upcoming.appointment_type)
      }
    }).catch(() => {})
    fetchReportForScan(scanId)
      .then((res) => {
        setReport(res.data)
        setSharedSuccess(Boolean(res.data.shared_with_patient))
        const risk = (res.data.risk_level || 'low').toLowerCase()
        setFollowupType(previous => previous || (risk === 'critical' || risk === 'high' ? 'Specialist consultation' : risk === 'moderate' ? 'Repeat diagnostic scan' : 'Routine annual follow-up'))
        const interval = res.data.content?.recommendations?.followup_interval || (['critical', 'high'].includes(risk) ? '2 weeks' : risk === 'moderate' ? '2 months' : '1 year')
        setSuggested(recommendedDate(interval))
        setFollowupDate(previous => previous || recommendedDate(interval))
        setFollowupNotes(previous => previous || `Follow-up for ${res.data.patient_name}`)
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load report data.')
      })
      .finally(() => setLoading(false))
  }, [scanId])

  const handleToggleContent = (key) => {
    setContents((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSendReport = async () => {
    if (!report?.id || !isSigned) return
    setSharing(true)
    try {
      await shareReportWithPatient(report.id, { share_with_patient: sharePatient, share_with_physician: sharePhysician, physician_id: selectedPhysician, delivery_method: deliveryChannel, message: patientMessage, sections: contents })
      setSharedSuccess(sharePatient || Boolean(report.shared_with_patient))
      setToastMsg(HOSTED_DEMO ? 'Demo sharing simulated in this tab. No messages sent.' : 'Report shared with the selected recipients.')
      setTimeout(() => setToastMsg(''), 4000)
    } catch (err) {
      setToastMsg(err.response?.data?.detail || 'Failed to share report.')
    } finally {
      setSharing(false)
    }
  }

  const handleScheduleFollowup = async (e, confirmed=false) => {
    e?.preventDefault()
    const selectedDate = e?.currentTarget?.elements?.scheduled_date?.value || followupDate
    const selectedTime = e?.currentTarget?.elements?.scheduled_time?.value || followupTime
    setFollowupDate(selectedDate)
    setFollowupTime(selectedTime)
    if (!confirmed && (selectedDate !== suggested || selectedTime !== '10:30')) { setConfirmChange(true); return }
    setConfirmChange(false)
    if (!report?.patient_id || !followupDate) return
    setScheduling(true)
    try {
      const response = await scheduleAppointment({
        patient_id: report.patient_id,
        scan_id: scanId,
        appointment_type: followupType,
        scheduled_date: selectedDate,
        scheduled_time: selectedTime,
        location: followupLocation,
        notes: followupNotes,
      })
      setAppointment(response.data)
      setScheduleSuccess(true)
      setToastMsg(`Follow-up appointment booked for ${followupDate}!`)
      setTimeout(() => setToastMsg(''), 4000)
    } catch (err) {
      setToastMsg(err.response?.data?.detail || 'Failed to book follow-up appointment.')
    } finally {
      setScheduling(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!report?.id) return
    try {
      const response = await generateReportPdf(report.id)
      const filename = `AuraMed_${report.patient_name || 'Patient'}_${module.toUpperCase()}.pdf`
      triggerPdfDownload(response.data, filename)
      setToastMsg('PDF downloaded successfully.')
      setTimeout(() => setToastMsg(''), 3000)
    } catch (err) {
      setToastMsg('Failed to download PDF.')
    }
  }

  const patientName = report?.patient_name || 'Patient'
  const patientCode = report?.patient_code || '—'
  const patientId = report?.patient_id
  const riskLevel = report?.risk_level || 'unassessed'
  const isSigned = isReportFinalized(report)

  return <DoctorLayout><div className="care-page care-page-narrow">
    <CareHeader eyebrow="Share & follow-up" title={`Complete care for ${patientName}`} description={HOSTED_DEMO ? "Demo portal sharing is simulated. Booking visits and referrals require the real backend." : "Share the signed report, confirm the next visit and arrange any referral."}/>
    <ReportStepper currentStep={4} isSigned={isSigned} module={module} scanId={scanId} patientId={patientId}/>
    {toastMsg&&<CareNotice>{toastMsg}</CareNotice>}
    {loading?<ScanResultsSkeleton/>:error?<CareNotice tone="error">{error}</CareNotice>:report&&<>
      <div className="care-patient-context"><div><strong>{patientName}</strong><small>{patientCode} · {module.toUpperCase()} assessment</small></div><div className="ml-auto"><RiskBadgeLarge level={riskLevel} size="md"/></div></div>
      {!isSigned?<CareNotice tone="warning">Review and sign the report first. <Link className="care-text-link" to={`/doctor/scan/${module}/report/${scanId}`}>Return to report</Link></CareNotice>:<>
      <section className="care-panel space-y-3" aria-label="Examination progress"><h2>{sharedSuccess && scheduleSuccess ? 'Report handoff complete' : 'Examination handoff in progress'}</h2><p className="text-sm text-slate-500">Progress for this examination. Appointments and specialist responses are tracked separately.</p><ol className="grid gap-2 text-sm sm:grid-cols-2">{[['Results reviewed', true], ['Report signed', isSigned], ['Shared with patient', sharedSuccess], ['Follow-up scheduled', scheduleSuccess]].map(([label, done]) => <li key={label} className={done ? 'text-teal-700' : 'text-slate-500'}>{done ? '✓' : '○'} {label}</li>)}<li className="text-slate-600">{referrals?.length ? `✓ Referral recorded (${referrals.length})` : referrals === null ? 'Referral status unavailable' : '○ Referral optional · review below'}</li></ol></section>
      <section className="care-panel space-y-5"><h2>1. Share the report</h2>
        {sharedSuccess&&<CareComplete title="Report shared">The selected recipients can access the signed report in their portal.</CareComplete>}
        <p className="text-sm text-slate-500">Share with the patient through their secure AuraMed portal.</p>
        <Disclosure title="Recipients, message and included sections" description="Optional changes before sharing.">
          <div className="space-y-4"><label className="flex gap-2 text-sm"><input type="checkbox" checked={sharePatient} onChange={e=>setSharePatient(e.target.checked)}/>Patient portal</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={sharePhysician} onChange={e=>setSharePhysician(e.target.checked)}/>Another registered physician</label>
          {sharePhysician&&<label className="care-field">Physician<select value={selectedPhysician} onChange={e=>setSelectedPhysician(e.target.value)}><option value="">Choose a physician</option>{physicians.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
          <label className="care-field">Message to patient<textarea rows={3} maxLength={500} value={patientMessage} onChange={e=>setPatientMessage(e.target.value)}/></label>
          <div className="grid gap-3 sm:grid-cols-2">{Object.keys(contents).map(key=><label key={key} className="flex gap-2 text-xs capitalize"><input type="checkbox" checked={contents[key]} disabled={['patient_info','risk_assessment','recommendations','reference_ranges'].includes(key)} onChange={()=>handleToggleContent(key)}/>{key.replaceAll('_',' ')}</label>)}</div></div>
        </Disclosure>
        <div className="flex flex-wrap items-center gap-4"><CareAction disabled={sharing||(!sharePatient&&!sharePhysician)||(sharePhysician&&!selectedPhysician)} onClick={handleSendReport}>{sharing?'Sharing…':HOSTED_DEMO ? 'Simulate portal sharing' : sharedSuccess?'Update sharing':'Share report'}</CareAction><button className="care-text-link" onClick={handleDownloadPdf}>Download PDF</button></div>
      </section>
      <section className="care-panel space-y-5"><h2>2. Plan the next visit</h2>
      {scheduleSuccess&&appointment?<><CareComplete title="Appointment scheduled">{appointment.scheduled_date} at {appointment.scheduled_time} · {appointment.location}<br/><Link className="care-text-link" to="/doctor/appointments">Manage or reschedule appointment</Link></CareComplete><AppointmentReminders appointment={appointment} onSaved={setAppointment}/></>:<>
        <CareNotice>Suggested follow-up: {suggested} at 10:30. This is a proposed time; confirm the clinical plan and clinic availability before booking.</CareNotice>
        <form onSubmit={handleScheduleFollowup} className="space-y-4"><label className="care-field">Visit purpose<select value={followupType} onChange={e=>setFollowupType(e.target.value)}>{['Specialist consultation','Repeat diagnostic scan','Routine annual follow-up','Biopsy recommended'].map(x=><option key={x}>{x}</option>)}</select></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="care-field">Date<input type="date" name="scheduled_date" required value={followupDate} onInput={e=>setFollowupDate(e.currentTarget.value)} onChange={e=>setFollowupDate(e.target.value)}/></label><label className="care-field">Time<input type="time" name="scheduled_time" required value={followupTime} onInput={e=>setFollowupTime(e.currentTarget.value)} onChange={e=>setFollowupTime(e.target.value)}/></label></div>
        <label className="care-field">Clinic or location<input required value={followupLocation} onChange={e=>setFollowupLocation(e.target.value)} placeholder="Enter the confirmed location"/></label>
        <Disclosure title="Appointment notes"><label className="care-field">Notes<textarea rows={2} value={followupNotes} onChange={e=>setFollowupNotes(e.target.value)}/></label></Disclosure>
        <CareAction type="submit" disabled={HOSTED_DEMO || scheduling}>{scheduling?'Booking…':HOSTED_DEMO ? 'Booking requires backend' : 'Confirm appointment'}</CareAction></form>
      </>}
      </section>
      <section className="care-panel space-y-4"><h2>3. Consider a referral</h2><p className="text-sm leading-6 text-slate-600">{['critical','high'].includes(riskLevel.toLowerCase())?'The elevated risk assessment suggests reviewing the need for a specialist referral. Confirm the urgency using your clinical judgement.':'You can create a specialist referral whenever clinically appropriate.'}</p>{referrals?.length > 0 && <CareComplete title="Referral recorded for this examination">{referrals.map(item => <div key={item.id}>{item.specialty} · {item.specialist_name || item.to_specialist} · {item.priority} priority · {item.status}</div>)}<Link className="care-text-link" to="/doctor/referrals">Track specialist response</Link></CareComplete>}<button className="care-secondary" disabled={HOSTED_DEMO} onClick={()=>navigate(referralPath(patientId, scanId, location.pathname + location.search))}>{referrals?.length ? 'Add another referral' : 'Choose specialist and urgency'}</button><p className="text-xs text-slate-500">Review the referral before submitting. Creating a record does not confirm that an external specialist has received it.</p></section>
      <div className="care-sticky"><p>Reports, appointments and referrals remain available in the patient record.</p><Link className="care-primary" to={`/doctor/patients/${patientId}`}>Return to patient record →</Link></div>
      </>}
    </>}
    {confirmChange&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="confirm-followup" className="care-panel max-w-md space-y-4"><h2 id="confirm-followup">Use a different appointment time?</h2><p className="text-sm text-slate-600">Suggested: {suggested} at 10:30.<br/>Your choice: {followupDate} at {followupTime}.</p><p className="text-sm text-slate-600">Confirm that this timing is appropriate for the patient.</p><div className="flex gap-3"><button className="care-secondary" onClick={()=>setConfirmChange(false)}>Keep editing</button><CareAction disabled={scheduling} onClick={()=>handleScheduleFollowup(null,true)}>Confirm change</CareAction></div></section></div>}
  </div></DoctorLayout>
}
export default ScanShare

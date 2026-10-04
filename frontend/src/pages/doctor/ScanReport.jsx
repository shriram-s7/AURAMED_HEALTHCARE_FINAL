import { HOSTED_DEMO } from '../../config/demoAccess'
import { referralPath } from '../../utils/workflow'
import { CareHeader, CareAction, Disclosure } from '../../components/common/CareUI'
import { fetchCurrentUser } from '../../services/authService'
import { useDraftState } from '../../hooks/useDraftState'
import { moduleFromPath, isReportFinalized } from '../../utils/workflow'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Lock, ShieldCheck } from 'lucide-react'
import DoctorLayout from '../../components/doctor/DoctorLayout'
import ReportStepper from '../../components/doctor/report/ReportStepper'
import ReportPatientContextCard from '../../components/doctor/report/ReportPatientContextCard'
import ReportSectionsNav from '../../components/doctor/report/ReportSectionsNav'
import ReportPreview from '../../components/doctor/report/ReportPreview'
import ReportEditSectionPanel from '../../components/doctor/report/ReportEditSectionPanel'
import SignReportModal from '../../components/doctor/report/SignReportModal'
import ScheduleFollowupModal from '../../components/doctor/scan-results/ScheduleFollowupModal'
import ScanResultsSkeleton from '../../components/doctor/scan-results/ScanResultsSkeleton'
import {
  fetchReportForScan,
  generateReportPdf,
  saveReportDraft,
  signReport,
} from '../../services/reportService'
import { getScanResults } from '../../services/scanService'
import { triggerPdfDownload } from '../../utils/downloadPdf'

function ScanReport() {
  const params = useParams()
  const location = useLocation()
  const module = params.module || moduleFromPath(location.pathname)
  const scanId = params.scanId || params.id
  const navigate = useNavigate()


  const [signer, setSigner] = useState(null)
  useEffect(()=>{ fetchCurrentUser().then(res=>setSigner(res.data.profile)).catch(()=>{}) },[])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null)
  const [content, setContent] = useDraftState('reportContent', null, `/doctor/scan/${module}/report/${scanId}`)
  const [activeSection, setActiveSection] = useState('patient_info')

  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

  // Section Refs for live auto-scrolling
  const sectionRefs = {
    patient_info: useRef(null),
    clinical_summary: useRef(null),
    imaging_findings: useRef(null),
    ai_assessment: useRef(null),
    rotterdam_criteria: useRef(null),
    risk_assessment: useRef(null),
    recommendations: useRef(null),
  }

  useEffect(() => {
    if (!scanId) return
    setLoading(true)
    setError(null)
    fetchReportForScan(scanId)
      .then(async (res) => {
        let repData = res.data
        // If report doesn't have the blended grad_cam_base64 overlay yet, retrieve from scan results
        if (!repData?.grad_cam_base64) {
          try {
            const scanRes = await getScanResults(scanId)
            const blended = scanRes.data?.grad_cam_base64
            if (blended) {
              repData = {
                ...repData,
                grad_cam_base64: blended,
              }
            }
          } catch {
            // non-fatal, fallback to repData
          }
        }
        setReport(repData)
        setContent(previous => HOSTED_DEMO || isReportFinalized(repData) ? repData.content : previous || repData.content)
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to initialize or fetch report.')
      })
      .finally(() => setLoading(false))
  }, [scanId])

  const handleSelectSection = (secId) => {
    setActiveSection(secId)
    const ref = sectionRefs[secId]
    if (ref && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const handleContentChange = (newContent) => {
    setContent(newContent)
  }

  const handleOptionsChange = (newOptions) => {
    setContent((prev) => ({
      ...prev,
      options: newOptions,
    }))
  }

  const handleTemplateChange = (newTemplate) => {
    setContent((prev) => ({
      ...prev,
      template: newTemplate,
    }))
  }

  const handleSaveDraft = async () => {
    if (!report?.id || !content) return
    setSavingDraft(true)
    try {
      const res = await saveReportDraft(report.id, content)
      setReport(res.data)
      setToastMessage('Report draft successfully saved.')
      setTimeout(() => setToastMessage(''), 3000)
    } catch (err) {
      setToastMessage('Failed to save draft.')
    } finally {
      setSavingDraft(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!report?.id) return
    setDownloadingPdf(true)
    try {
      if (!isReportFinalized(report)) await saveReportDraft(report.id, content)
      const response = await generateReportPdf(report.id)
      const patientName = (report.patient_name || 'Patient').replace(/\s+/g, '_')
      const mod = module.toUpperCase()
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const filename = `AuraMed_${patientName}_${mod}_${dateStr}.pdf`
      triggerPdfDownload(response.data, filename)
      setToastMessage('PDF downloaded successfully.')
      setTimeout(() => setToastMessage(''), 3000)
    } catch (err) {
      setToastMessage('Failed to generate PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleSignConfirm = async () => {
    if (!report?.id) return
    setSigning(true)
    try {
      // Only save draft if report is not already signed
      if (!isReportFinalized(report)) {
        await saveReportDraft(report.id, content)
      }
      const signedRes = await signReport(report.id)
      setSignModalOpen(false)
      const reportId = signedRes.data?.id || signedRes.data?.report_id || signedRes.data?.report?.id || report.id
      if (reportId && reportId !== 'undefined') {
        setReport(signedRes.data.report || { ...report, status: 'signed', signed_at: new Date().toISOString() })
        navigate(`/doctor/scan/${module}/share/${scanId}`)
      } else {
        console.error('Report ID is undefined, cannot navigate')
        setToastMessage('Report was signed, but report ID could not be determined.')
      }
    } catch (err) {
      setToastMessage(err.response?.data?.detail || 'Failed to digitally sign report.')
    } finally {
      setSigning(false)
    }
  }

  const isSigned = isReportFinalized(report)

  const handleSharePatient = () => {
    if (!isSigned) {
      setToastMessage('This report must be signed before proceeding to Share & Follow-up. Please sign the report first.')
      setSignModalOpen(true)
      return
    }
    navigate(`/doctor/scan/${module}/share/${scanId}`)
  }

  const handleReferSpecialist = () => {
    navigate(referralPath(report?.patient_id, report?.scan_id || scanId, location.pathname + location.search))
  }

  return (
    <DoctorLayout>
      <div className="care-page care-page-narrow">
        <CareHeader eyebrow="Review & sign" title="Make the report ready to share" description={HOSTED_DEMO ? "Saved sample report. Demo signing and sharing are simulated in this tab; the PDF stays a labeled sample." : "Review the full report. Open Edit report to make changes before signing."}/>
        <ReportStepper currentStep={3} isSigned={isSigned} module={module} scanId={scanId} patientId={report?.patient_id} />
        <p className="text-xs text-slate-500">{HOSTED_DEMO ? 'Read-only sample. Signing and portal sharing reset on refresh.' : 'Unfinished edits are kept when you navigate back. Save Draft syncs them to the server; signing locks the report.'}</p>

        {/* Patient Context Card */}
        <ReportPatientContextCard report={report} />

        {toastMessage && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-300 p-3 text-xs font-bold text-emerald-800 shadow-sm">
            {toastMessage}
          </div>
        )}

        {loading ? (
          <ScanResultsSkeleton />
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-8 text-center">
            <p className="text-base font-bold text-danger">Error Loading Report</p>
            <p className="mt-1 text-xs text-primary/70">{error}</p>
            <button
              type="button"
              onClick={() => navigate(`/doctor/scan/${module}/results/${scanId}`)}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white"
            >
              Return to Analysis Results
            </button>
          </div>
        ) : content ? (
          <>
            {!HOSTED_DEMO && !isSigned && <Disclosure title={isSigned ? 'Report layout and options' : 'Edit report'} description="Choose a section to edit. Changes appear in the preview below.">
              <div className="grid gap-6 md:grid-cols-[240px_1fr]">
                <ReportSectionsNav activeSection={activeSection} onSelectSection={setActiveSection} options={content.options||{}} onOptionsChange={handleOptionsChange} template={content.template||'Standard Clinical Report'} onTemplateChange={handleTemplateChange} isPcos={module==='pcos'} module={module}/>
                <ReportEditSectionPanel hideActions activeSection={activeSection} content={content} isSigned={isSigned} onContentChange={handleContentChange}/>
              </div>
            </Disclosure>}
            <ReportPreview content={content} reportNumber={report?.report_number} status={report?.status} sectionRefs={sectionRefs} report={report}/>
            <div className="care-sticky"><p>{HOSTED_DEMO ? 'Public sample report. No real signature or delivery is created.' : isSigned?'Signed report. Continue to sharing and follow-up.':'Signing locks edits. Later changes require an addendum.'}</p><div className="flex flex-wrap gap-2"><button className="care-secondary" disabled={downloadingPdf} onClick={handleDownloadPdf}>Download PDF</button>{!isSigned&&<button className="care-secondary" disabled={HOSTED_DEMO||savingDraft||signing} onClick={handleSaveDraft}>{savingDraft?'Saving…':'Save draft'}</button>}<CareAction disabled={!isSigned && (!signer || savingDraft)} onClick={isSigned?handleSharePatient:()=>setSignModalOpen(true)}>{isSigned?'Share & follow-up':(HOSTED_DEMO ? 'Simulate signing' : 'Sign report')}</CareAction></div></div>
          </>
        ) : null}

        {/* Sign Report Modal */}
        {signModalOpen && (
          <SignReportModal
            reportNumber={report?.report_number}
            doctorName={signer?.full_name}
            registrationNumber={signer?.registration_number}
            onClose={() => setSignModalOpen(false)}
            onConfirm={handleSignConfirm}
            signing={signing}
          />
        )}

        {/* Schedule Followup Modal */}
        {scheduleModalOpen && (
          <ScheduleFollowupModal
            scanId={scanId}
            interval={report?.risk_level === 'high' ? 'within 1 month' : 'within 2-3 months'}
            patientName={report?.patient_name}
            onClose={() => setScheduleModalOpen(false)}
            onSuccess={() => setToastMessage('Follow-up scheduled successfully.')}
          />
        )}
      </div>
    </DoctorLayout>
  )
}

export default ScanReport

import { HOSTED_DEMO } from '../../config/demoAccess'
import { CareHeader, CareAction, CareNotice, Disclosure } from '../../components/common/CareUI'
import ReportStepper from '../../components/doctor/report/ReportStepper'
import { moduleFromPath, isReportFinalized } from '../../utils/workflow'
import { useDraftState } from '../../hooks/useDraftState'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  FileCheck,
  Layers,
  Sparkles,
  User,
} from 'lucide-react'
import DoctorLayout from '../../components/doctor/DoctorLayout'
import InitialsAvatar from '../../components/common/InitialsAvatar'
import ImageAnalysisSection from '../../components/doctor/scan-results/ImageAnalysisSection'
import ClinicalAnalysisSection from '../../components/doctor/scan-results/ClinicalAnalysisSection'
import RotterdamCriteriaSection from '../../components/doctor/scan-results/RotterdamCriteriaSection'
import FusionFinalResultSection from '../../components/doctor/scan-results/FusionFinalResultSection'
import AiVisualIntelligenceSection from '../../components/doctor/scan-results/AiVisualIntelligenceSection'
import ReferenceImagesSection from '../../components/doctor/scan-results/ReferenceImagesSection'
import DoctorReviewSection from '../../components/doctor/scan-results/DoctorReviewSection'
import NextStepsSection from '../../components/doctor/scan-results/NextStepsSection'
import RiskBadgeLarge from '../../components/doctor/scan-results/RiskBadgeLarge'
import ScanResultsSkeleton from '../../components/doctor/scan-results/ScanResultsSkeleton'
import {
  fetchScanResults,
  togglePatientUrgent,
  updateDoctorReview,
} from '../../services/scanResultsService'

const MODULE_TITLES = {
  breast: 'Breast Cancer Detection',
  cervical: 'Cervical Cancer Screening',
  pcos: 'PCOS Ultrasound Analysis',
}

const TABS = [
  { id: 'ai-analysis', label: 'AI Analysis' },
  { id: 'clinical-analysis', label: 'Clinical Analysis' },
  { id: 'fusion-score', label: 'Fusion and Risk Score' },
  { id: 'visual-intelligence', label: 'AI Visual Intelligence' },
  { id: 'reference-images', label: 'Reference Images' },
  { id: 'doctor-review', label: 'Doctor Review' },
  { id: 'report-preview', label: 'Report Preview' },
]

function ScanResults() {
  const params = useParams()
  const location = useLocation()
  const module = params.module || moduleFromPath(location.pathname)
  const scanId = params.scanId || params.id
  const navigate = useNavigate()


  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [activeTab, setActiveTab] = useDraftState('activeTab', 'ai-analysis')

  const sec1Ref = useRef(null)
  const sec2Ref = useRef(null)
  const rotterdamRef = useRef(null)
  const sec3Ref = useRef(null)
  const aiVisualRef = useRef(null)
  const sec4Ref = useRef(null)
  const sec5Ref = useRef(null)

  const tabs =
    module === 'pcos'
      ? [
          { id: 'ai-analysis', label: 'AI Analysis' },
          { id: 'clinical-analysis', label: 'Clinical Analysis' },
          { id: 'rotterdam-criteria', label: 'Rotterdam Criteria' },
          { id: 'fusion-score', label: 'Fusion & Risk Score' },
          { id: 'visual-intelligence', label: 'AI Visual Intelligence' },
          { id: 'reference-images', label: 'Reference Images' },
          { id: 'doctor-review', label: 'Doctor Review' },
          { id: 'report-preview', label: 'Report Preview' },
        ]
      : TABS

  useEffect(() => {
    if (!scanId) return
    setLoading(true)
    setError(null)
    fetchScanResults(scanId)
      .then((res) => {
        setResult(res.data)
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load scan analysis results.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [scanId])

  const handleTabClick = (tabId) => {
    setActiveTab(tabId)
    if (tabId === 'report-preview') {
      navigate('/doctor/scan/' + module + '/report/' + scanId)
      return
    }
    const refMap = {
      'ai-analysis': sec1Ref,
      'clinical-analysis': sec2Ref,
      'rotterdam-criteria': rotterdamRef,
      'fusion-score': sec3Ref,
      'visual-intelligence': aiVisualRef,
      'reference-images': sec4Ref,
      'doctor-review': sec5Ref,
    }
    const targetRef = refMap[tabId]
    if (targetRef && targetRef.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleUpdateDoctorReview = async (values, notes) => {
    const res = await updateDoctorReview(scanId, values, notes)
    setResult(res.data)
    return res.data
  }

  const handleToggleUrgent = async () => {
    if (!result?.patient?.id) return
    const res = await togglePatientUrgent(result.patient.id)
    setResult((prev) => ({
      ...prev,
      is_urgent: res.data.is_urgent,
    }))
  }

  const patient = result?.patient
  const moduleLabel = MODULE_TITLES[module] || module.toUpperCase()

  const formattedScanDate = result?.scan_date
    ? new Date(result.scan_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Not specified'

  const formattedAnalysisTime = result?.analysis_datetime
    ? new Date(result.analysis_datetime).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Just now'

  return <DoctorLayout><div className="care-page care-page-narrow">
    <CareHeader eyebrow="Review results" title={patient?.full_name || 'Examination results'} description={`${moduleLabel} · Review the findings before preparing the report.`}/>
    <ReportStepper currentStep={2} module={module} scanId={scanId} patientId={patient?.id}/>
    {loading ? <ScanResultsSkeleton/> : error ? <CareNotice tone="error">{error}</CareNotice> : result && <>
      <FusionFinalResultSection result={result} sectionRef={sec3Ref}/>
      <Disclosure open={HOSTED_DEMO} title="Image and clinical findings" description="Review the evidence behind the assessment."><div className="grid gap-5 md:grid-cols-2"><ImageAnalysisSection result={result} sectionRef={sec1Ref}/><ClinicalAnalysisSection result={result} sectionRef={sec2Ref}/></div>{module==='pcos'&&<RotterdamCriteriaSection result={result} sectionRef={rotterdamRef}/>}</Disclosure>
      <Disclosure open={HOSTED_DEMO} title="Image explanation and reference examples"><AiVisualIntelligenceSection module={module} result={result} scanId={scanId} sectionRef={aiVisualRef}/><ReferenceImagesSection result={result} sectionRef={sec4Ref}/></Disclosure>
      <DoctorReviewSection result={result} onUpdateSuccess={handleUpdateDoctorReview} sectionRef={sec5Ref}/>
      {!HOSTED_DEMO && <Disclosure title="Other clinical actions" description="Urgency, referrals and follow-up tools."><NextStepsSection result={result} onToggleUrgent={handleToggleUrgent}/></Disclosure>}
      <div className="care-sticky"><p>{HOSTED_DEMO ? "Previously generated model output. Review the saved sample report next." : "Next, review and edit the report before signing."}</p><CareAction onClick={()=>navigate(`/doctor/scan/${module}/report/${scanId}`)}>Review report</CareAction></div>
    </>}
  </div></DoctorLayout>
}
export default ScanResults

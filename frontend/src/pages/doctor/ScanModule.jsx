import { HOSTED_DEMO } from '../../config/demoAccess'
import breastDemoPairs from '../../config/breastDemoPairs.json'
import { CareHeader, CareAction, CareNotice, Disclosure } from '../../components/common/CareUI'
import { DEMO_IMAGES } from '../../config/demoCases'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, useLocation, Navigate } from 'react-router-dom'
import { ChevronRight, Play, RefreshCcw, Save, ShieldCheck, Trash2 } from 'lucide-react'
import DoctorLayout from '../../components/doctor/DoctorLayout'
import ReportStepper from '../../components/doctor/report/ReportStepper'
import PatientSelectorCard from '../../components/doctor/scan/PatientSelectorCard'
import ImageUploadPanel from '../../components/doctor/scan/ImageUploadPanel'
import ClinicalInputForm from '../../components/doctor/scan/ClinicalInputForm'
import ReferenceImagesPanel from '../../components/doctor/scan/ReferenceImagesPanel'
import ReferenceRangesPanel from '../../components/doctor/scan/ReferenceRangesPanel'
import ValidationPanel from '../../components/doctor/scan/ValidationPanel'
import Toast from '../../components/common/Toast'
import { SCAN_MODULES, getReferenceRanges } from '../../config/scanModules'
import { SCAN_TEST_CASES } from '../../config/scanTestCases'
import { validateClinicalInputs } from '../../utils/scanValidation'
import { fetchPatientDetail } from '../../services/patientDetailService'
import { analyzeScan, checkScanQuality, saveScanDraft } from '../../services/scanService'
import { useDraftState, draftScope, saveDraftField } from '../../hooks/useDraftState'
import { loadScanFiles, saveScanFiles } from '../../utils/scanDrafts'
import api from '../../services/api'

const OTHER_MODULES = {
  breast: [
    { key: 'cervical', label: 'Cervical Cancer' },
    { key: 'pcos', label: 'PCOS' },
  ],
  cervical: [
    { key: 'breast', label: 'Breast Cancer' },
    { key: 'pcos', label: 'PCOS' },
  ],
  pcos: [
    { key: 'breast', label: 'Breast Cancer' },
    { key: 'cervical', label: 'Cervical Cancer' },
  ],
}

const PCOS_ALIASES = {
  amh_ng_ml: 'amh_ng_mL',
  amh_ng_mL: 'amh_ng_ml',
  lh_miu_ml: 'lh_mIU_mL',
  lh_mIU_mL: 'lh_miu_ml',
  fsh_miu_ml: 'fsh_mIU_mL',
  fsh_mIU_mL: 'fsh_miu_ml',
  total_testosterone_ng_dl: 'testosterone_ng_dL',
  testosterone_ng_dL: 'total_testosterone_ng_dl',
  prolactin_ng_ml: 'prolactin_ng_mL',
  prolactin_ng_mL: 'prolactin_ng_ml',
  left_ovary_volume_ml: 'left_ovarian_volume_mL',
  left_ovarian_volume_mL: 'left_ovary_volume_ml',
  right_ovary_volume_ml: 'right_ovarian_volume_mL',
  right_ovarian_volume_mL: 'right_ovary_volume_ml',
  menstrual_regularity: 'menstrual_cycle_regularity',
  menstrual_cycle_regularity: 'menstrual_regularity',
}

function syncAliases(vals, mod) {
  if (!vals) return {}
  const res = { ...vals }
  if (mod === 'pcos') {
    for (const [k, alt] of Object.entries(PCOS_ALIASES)) {
      if (res[k] !== undefined && res[alt] === undefined) {
        res[alt] = res[k]
      }
    }
  }
  return res
}

function ScanModule({ defaultModule, initialModule }) {
  const { module: paramModule } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const module = useMemo(() => {
    if (paramModule && SCAN_MODULES[paramModule]) return paramModule
    if ((defaultModule || initialModule) && SCAN_MODULES[defaultModule || initialModule]) return defaultModule || initialModule
    const p = location.pathname.toLowerCase()
    if (p.includes('/scan/cervical')) return 'cervical'
    if (p.includes('/scan/pcos')) return 'pcos'
    if (p.includes('/scan/breast')) return 'breast'
    return 'breast'
  }, [paramModule, defaultModule, initialModule, location.pathname])

  const moduleConfig = SCAN_MODULES[module] || SCAN_MODULES.breast

  const [patient, setPatient] = useState(null)
  const [images, setImages] = useState([])
  const [qualityResult, setQualityResult] = useState(null)
  const [qualityChecking, setQualityChecking] = useState(false)
  const patientId = searchParams.get('patientId')
  const requestedScanId = searchParams.get('scanId')
  const scanScope = `scan:${module}:${patientId || 'unselected'}:${requestedScanId || 'working'}`
  const fileKey = `${draftScope()}:${scanScope}`
  const [values, setValues] = useDraftState('clinicalInputs', {}, scanScope)
  const [draftId, setDraftId] = useDraftState('scanId', null, scanScope)
  const [filesReady, setFilesReady] = useState(false)
  const [sourceScan, setSourceScan] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const [step, setStep] = useState(1)
  const [analyzing, setAnalyzing] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [clearModalOpen, setClearModalOpen] = useState(false)
  const [moduleMenuOpen, setModuleMenuOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [sampleRequest, setSampleRequest] = useState(0)

  useEffect(() => {
    let cancelled = false
    setPatient(null)
    if (!patientId) {
      return
    }
    fetchPatientDetail(patientId).then((res) => {
      if (cancelled) return
      const p = res.data.patient
      setPatient({ id: p.id, full_name: p.full_name, patient_code: p.patient_code, age: p.age, gender: p.gender })
    }).catch(err => { if (!cancelled) setToast(err.response?.data?.detail || 'Could not load the selected patient.') })
    return () => { cancelled = true }
  }, [patientId])

  useEffect(() => {
    let cancelled = false
    setFilesReady(false)
    setImages([])
    setSourceScan(null)
    setQualityResult(null)
    setQualityChecking(false)
    setShowErrors(false)
    setStep(1)
    loadScanFiles(fileKey).then(async files => {
      if (!files.length && requestedScanId) {
        try {
          const { data: source } = await api.get(`/doctor/scans/${requestedScanId}`)
          if (source.module !== module || (patientId && String(source.patient_id) !== patientId)) throw new Error('Patient mismatch')
          const { data } = await api.get(`/doctor/scans/${requestedScanId}/draft-images`)
          files = data.map(item => {
            const bytes = Uint8Array.from(atob(item.data), char => char.charCodeAt(0))
            const file = new File([bytes], item.name, { type: /\.jpe?g$/i.test(item.name) ? 'image/jpeg' : 'image/png' })
            return { file, name: item.name, size: file.size, view: item.view }
          })
          if (!cancelled && files.length) saveScanFiles(fileKey, files).catch(() => {})
        } catch { if (!cancelled) setToast('Saved inputs restored. Re-upload images if they are unavailable.') }
      }
      if (!cancelled) { setImages(files.map(item => ({ ...item, url: URL.createObjectURL(item.file) }))); setFilesReady(true) }
    })
    if (requestedScanId) api.get(`/doctor/scans/${requestedScanId}`).then(({ data }) => {
      if (cancelled || data.module !== module) return
      if (patientId && String(data.patient_id) !== patientId) { setToast('This scan belongs to a different patient.'); return }
      if (!patientId) { setSearchParams({ patientId: data.patient_id, scanId: requestedScanId }, { replace: true }); return }
      setSourceScan(data)
      setValues(previous => Object.keys(previous).length ? previous : syncAliases(data.clinical_inputs || {}, module))
      setDraftId(data.status === 'draft' ? data.id : null)
    }).catch(err => { if (!cancelled) setToast(err.response?.data?.detail || 'Could not restore this scan.') })
    return () => { cancelled = true }
  }, [module, patientId, requestedScanId, fileKey])

  function handleImagesChange(next) {
    setImages(next)
    saveScanFiles(fileKey, next).catch(() => setToast('Image retained for navigation. Browser storage is unavailable; keep this tab open.'))
  }

  useEffect(() => {
    if (!filesReady || !images.length) {
      setQualityResult(null)
      setQualityChecking(false)
      return undefined
    }

    let cancelled = false
    setQualityChecking(true)
    setQualityResult(null)
    checkScanQuality({
      module,
      image: images[0].file,
      additionalImages: images.slice(1).map((item) => item.file),
      imageViews: images.map((item) => item.view || ''),
    })
      .then((response) => {
        if (!cancelled) setQualityResult(response.data)
      })
      .catch((error) => {
        if (!cancelled) {
          setQualityResult({
            quality: 'poor',
            reasons: [error.response?.data?.detail || 'Could not check image quality. Check your connection and try again.'],
          })
        }
      })
      .finally(() => {
        if (!cancelled) setQualityChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [images, module, filesReady])

  const handleChange = useCallback((key, value) => {
    setValues((v) => {
      const next = { ...v, [key]: value }
      const alt = PCOS_ALIASES[key]
      if (alt) next[alt] = value
      return next
    })
  }, [setValues])

  function handleSelectPatient(p) {
    if (!p) {
      saveDraftField('clinicalInputs', {}, `scan:${module}:unselected:working`)
      saveScanFiles(`${draftScope()}:scan:${module}:unselected:working`, []).catch(() => {})
      const next = new URLSearchParams(searchParams)
      next.delete('patientId')
      next.delete('scanId')
      setSearchParams(next)
      return
    }
    setPatient({ id: p.id, full_name: p.full_name, patient_code: p.patient_code, age: p.age, gender: p.gender })
    if (!patientId) {
      saveDraftField('clinicalInputs', values, `scan:${module}:${p.id}:working`)
      saveScanFiles(`${draftScope()}:scan:${module}:${p.id}:working`, images).catch(() => {})
    }
    const next = new URLSearchParams(searchParams)
    next.delete('scanId')
    next.set('patientId', p.id)
    setSearchParams(next)
  }

  const validation = useMemo(() => validateClinicalInputs(module, values), [module, values])
  const imageUploaded = images.length > 0
  const canRun =
    filesReady && validation.valid && imageUploaded && Boolean(patient) && !qualityChecking && qualityResult?.quality === 'adequate'

  async function handleSaveDraft() {
    if (!patient) {
      setToast('Select a patient before saving a draft.')
      return
    }
    setSavingDraft(true)
    try {
      const draftInputs = syncAliases(values, module)
      const res = await saveScanDraft({ scanId: draftId, module, patientId: patient.id, clinicalInputs: draftInputs })
      setDraftId(res.data.scan_id)
      const form = new FormData()
      images.forEach(item => form.append('images', item.file))
      form.append('image_views', JSON.stringify(images.map(item => item.view || '')))
      await api.post(`/doctor/scans/${res.data.scan_id}/draft-images`, form)
      setToast('Draft and images synced. You can return from the patient record and continue.')
    } catch (err) {
      setToast(err.response?.data?.detail || 'Could not save draft.')
    } finally {
      setSavingDraft(false)
    }
  }

  function handleLoadTestCase(tier) {
    const testCase = SCAN_TEST_CASES[module]?.[tier]
    if (!testCase) return
    setValues((v) => syncAliases({ ...v, ...testCase }, module))
    setToast(`${tier.charAt(0).toUpperCase()}${tier.slice(1)} risk test case loaded.`)
  }

  async function handleLoadDemo(tier) {
    try {
      const sources=module==='breast'?breastDemoPairs[tier]:[{src:DEMO_IMAGES[module][tier],view:null}]
      const loaded=await Promise.all(sources.map(async item=>{
        const response=await fetch(item.src)
        if(!response.ok) throw new Error('Image unavailable')
        const blob=await response.blob()
        if(!blob.type.startsWith('image/')) throw new Error('Invalid image')
        const file=new File([blob],item.src.split('/').pop(),{type:blob.type})
        return {file,name:file.name,size:file.size,url:URL.createObjectURL(file),view:item.view}
      }))
      setValues(syncAliases({...SCAN_TEST_CASES[module][tier]}, module))
      handleImagesChange(loaded)
      setShowErrors(false)
      setToast(HOSTED_DEMO ? 'Sample loaded. View its saved model result below.' : `${tier} risk demo inputs and image loaded. Analysis calculates the result independently.`)
    } catch { setToast('Could not load the demo image. Please try again.') }
  }

  function handleClearAll() {
    setValues({})
    handleImagesChange([])
    setDraftId(null)
    setClearModalOpen(false)
    setShowErrors(false)
    setToast('All inputs cleared.')
  }

  async function handleRunAnalysis() {
    setShowErrors(true)
    if (!patient) {
      setToast('Select a patient before running analysis.')
      return
    }
    if (!canRun) {
      setToast('Please resolve the validation issues before running analysis.')
      return
    }
    setAnalyzing(true)
    setStep(2)
    try {
      const submissionInputs = syncAliases(values, module)
      submissionInputs.image_quality = qualityResult.quality
      if (module === 'breast') submissionInputs.mammogram_views = images.map((item) => item.view).filter(Boolean)
      const res = await analyzeScan({
        draftId,
        module,
        patientId: patient.id,
        clinicalInputs: submissionInputs,
        imageQuality: qualityResult?.quality,
        image: images[0].file,
        additionalImages: images.slice(1).map((i) => i.file),
        imageViews: images.map((item) => item.view || ''),
      })
      setDraftId(null)
      const resultScope = `scan:${module}:${patient.id}:${res.data.scan_id}`
      saveDraftField('clinicalInputs', submissionInputs, resultScope)
      saveScanFiles(`${draftScope()}:${resultScope}`, images).catch(() => {})
      navigate(`/doctor/scan/${module}/results/${res.data.scan_id}`)
    } catch (err) {
      setStep(1)
      setToast(err.response?.data?.detail || 'Analysis failed. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  if (!moduleConfig) {
    return (
      <DoctorLayout>
        <div className="p-6">
          <p className="text-sm text-danger">Unknown screening module.</p>
        </div>
      </DoctorLayout>
    )
  }

  if (!patientId && !requestedScanId) return <Navigate replace to={`/doctor/examinations/new?module=${module}`} />
  return (
    <DoctorLayout>
    <div className="care-page">
      <CareHeader eyebrow="Prepare examination" title={moduleConfig.label} description={HOSTED_DEMO ? "Choose a bundled sample to view its previously generated model result." : "Add an image and clinical details, then run the analysis."} />
      <ReportStepper currentStep={1} resultsReady={Boolean(sourceScan && sourceScan.status !== 'draft')} module={module} scanId={requestedScanId} patientId={patientId}/>
      <div className="care-patient-context"><div><strong>{patient?.full_name || 'Loading patient…'}</strong><small>{patient?.patient_code}</small></div><button className="care-text-link ml-auto" onClick={()=>navigate(`/doctor/examinations/new?patientId=${patientId}&module=${module}`)}>Change examination</button></div>
      {sourceScan && sourceScan.status !== 'draft' && <CareNotice>These are saved inputs from an existing analysis. Running again creates a new examination.</CareNotice>}
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
      <Disclosure open={HOSTED_DEMO} title="Try demo inputs — start here" description={HOSTED_DEMO ? "Choose one of three fixed samples. Inputs are locked to match the saved model result. Case names describe presets; actual results can differ." : "New to screening? Choose a sample below to fill the scan and clinical details, then run analysis. The result is calculated independently."}>
        <div className="flex flex-wrap gap-3">{['low','medium','high'].map(tier=><button key={tier} className="care-secondary capitalize" disabled={!filesReady || analyzing} onClick={()=>handleLoadDemo(tier)}>{tier} {HOSTED_DEMO ? "input sample" : "risk case"}</button>)}</div>
      </Disclosure>
      </div>
      {module==='breast'&&<CareNotice>Breast demo cases include paired MLO and CC images with dataset view labels. For uploaded examinations, add and label both required views.</CareNotice>}
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <fieldset disabled={HOSTED_DEMO} className="min-w-0"><ImageUploadPanel moduleConfig={moduleConfig} images={images} onImagesChange={handleImagesChange} sampleRequest={sampleRequest}/></fieldset>
        <fieldset disabled={HOSTED_DEMO} className="care-panel min-w-0"><ClinicalInputForm moduleKey={module} values={values} onChange={handleChange} showErrors={showErrors}/></fieldset>
      </div>
      <ValidationPanel errors={validation.errors} patientSelected={Boolean(patient)} imageUploaded={imageUploaded} qualityResult={qualityResult} qualityChecking={qualityChecking}/>
      <Disclosure title="References and examination options" description="Reference images, clinical ranges and clear current inputs."><div className="grid gap-5 md:grid-cols-2"><ReferenceImagesPanel moduleConfig={moduleConfig}/><ReferenceRangesPanel ranges={getReferenceRanges(module)}/></div><button className="care-text-link mt-5" onClick={()=>setClearModalOpen(true)}>Clear current inputs</button></Disclosure>
      <div className="care-sticky"><p>{HOSTED_DEMO ? "Saved demonstration only. Custom inputs and new scans need the full backend." : "Your inputs stay here when you go back. Save draft to sync them to the patient record."}</p><div className="flex gap-3"><button className="care-secondary" disabled={HOSTED_DEMO || savingDraft || analyzing || !filesReady} onClick={handleSaveDraft}>{savingDraft?'Saving…':'Save draft'}</button><CareAction disabled={!canRun || analyzing || savingDraft} onClick={handleRunAnalysis}>{analyzing ? (HOSTED_DEMO ? 'Loading sample…' : 'Analyzing…') : HOSTED_DEMO ? 'View saved sample result' : 'Run analysis'}</CareAction></div></div>
      {clearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setClearModalOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-primary">Clear all inputs?</h3>
            <p className="mt-2 text-sm text-primary/60">
              This will remove the uploaded image and all clinical inputs entered for this scan.
              This cannot be undone.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setClearModalOpen(false)}
                className="flex-1 rounded-md border border-border py-2 text-sm font-medium text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="flex-1 rounded-md bg-danger py-2 text-sm font-semibold text-white hover:bg-danger/90"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
    </DoctorLayout>
  )
}

export default ScanModule

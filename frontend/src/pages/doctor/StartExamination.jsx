import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, Microscope, ScanLine, Search, UserRound } from 'lucide-react'
import { fetchPatients } from '../../services/patientService'
import { fetchPatientDetail as fetchPatientById } from '../../services/patientDetailService'
import { useDraftState } from '../../hooks/useDraftState'
import { CareAction, CareHeader, CareNotice } from '../../components/common/CareUI'

const examinations = [
  { id: 'breast', title: 'Breast assessment', detail: 'Breast images and clinical risk factors', icon: ScanLine },
  { id: 'cervical', title: 'Cervical screening', detail: 'Cytology images and screening history', icon: Microscope },
  { id: 'pcos', title: 'PCOS assessment', detail: 'Ovarian ultrasound and clinical findings', icon: Activity },
]

export default function StartExamination() {
  const navigate = useNavigate()
  const [query, setQuery] = useSearchParams()
  const patientId = query.get('patientId')
  const [search, setSearch] = useDraftState('patientSearch', '')
  const [patients, setPatients] = useState([])
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [module, setModule] = useDraftState('examination', query.get('module') || '')
  useEffect(()=>{ const requested=query.get('module');if(examinations.some(item=>item.id===requested))setModule(requested) },[query.get('module')])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const timer = setTimeout(() => {
      const request = patientId ? fetchPatientById(patientId) : fetchPatients({ search, page_size: 12, status: 'active' })
      request.then(res => { if (active) patientId ? setPatient(res.data.patient || res.data) : setPatients(res.data.items || []) })
        .catch(() => { if (active) setError('Could not load patients. Refresh to try again.') })
        .finally(() => { if (active) setLoading(false) })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [patientId, search])
  return <div className="care-page care-page-narrow">
    <CareHeader eyebrow="New examination" title={patientId ? 'What would you like to assess?' : 'Who are we seeing?'} description={patientId ? 'Choose an examination for this patient. All three are available to every doctor.' : 'Choose an existing patient to begin. Their history will stay with you throughout the examination.'} />
    <div className="care-start-progress"><span className={!patientId ? 'active' : ''}>1 · Patient</span><span className={patientId ? 'active' : ''}>2 · Examination</span></div>
    {error && <CareNotice tone="error">{error}</CareNotice>}
    {!patientId ? <section className="care-panel">
      <label className="care-search"><Search size={18}/><input autoFocus aria-label="Find patient" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by patient name or ID" /></label>
      <div className="care-patient-list">{loading ? <p className="care-empty">Finding your patients…</p> : patients.length ? patients.map(item => <button key={item.id} onClick={() => setQuery({ patientId: item.id })} className="care-patient-row"><span className="care-avatar"><UserRound size={20}/></span><span><strong>{item.full_name}</strong><small>{item.patient_code} · {item.age ? `${item.age} years` : 'Patient record'}</small></span><span className="ml-auto text-teal-700">Select →</span></button>) : <p className="care-empty">No matching patients. Try another name or register a patient.</p>}</div>
      <div className="care-panel-footer">First visit? <Link to="/doctor/patients/new" className="care-text-link">Register a patient</Link></div>
    </section> : <>
      <div className="care-patient-context"><span className="care-avatar"><UserRound size={20}/></span><div><strong>{loading ? 'Loading patient…' : patient?.full_name}</strong><small>{patient?.patient_code}</small></div><button className="care-text-link ml-auto" onClick={() => { setPatient(null); setQuery({}) }}><ArrowLeft size={14}/>Change patient</button></div>
      <div className="care-exam-grid">{examinations.map(item => <button key={item.id} className={`care-exam-card ${module === item.id ? 'selected' : ''}`} onClick={() => setModule(item.id)} aria-pressed={module === item.id}><item.icon size={26}/><h2>{item.title}</h2><p>{item.detail}</p><span>{module === item.id ? 'Selected' : 'Select examination'}</span></button>)}</div>
      <div className="care-sticky"><p>Your patient is selected. Next, add images and clinical details.</p><CareAction disabled={!module || !patient || loading} onClick={() => navigate(`/doctor/scan/${module}?patientId=${patientId}`)}>Prepare examination</CareAction></div>
    </>}
  </div>
}

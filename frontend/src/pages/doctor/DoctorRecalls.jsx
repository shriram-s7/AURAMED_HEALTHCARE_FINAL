import {useEffect,useState} from 'react'
import api from '../../services/api'
import useDataSync from '../../hooks/useDataSync'
import {CareHeader,CareNotice,Disclosure} from '../../components/common/CareUI'
import AppointmentReminders from '../../components/doctor/AppointmentReminders'
import RecallDeliveryTest from './RecallDeliveryTest'
export default function DoctorRecalls(){
 const [items,setItems]=useState([]),[selected,setSelected]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 const load=()=>api.get('/doctor/appointments',{params:{page_size:100}}).then(({data})=>{setItems((data.items||[]).filter(x=>['scheduled','rescheduled'].includes(x.status)));setError('')}).catch(()=>setError('Could not load appointments.')).finally(()=>setLoading(false))
 useEffect(()=>{load()},[]);useDataSync(load)
 const appointment=items.find(x=>x.id===selected)
 return <div className="care-page care-page-narrow"><CareHeader eyebrow="Follow-up care" title="Appointment reminders" description="Choose a booked visit, save reminder preferences and preview the patient journey."/>{error&&<CareNotice tone="error">{error}<button className="underline ml-2" onClick={load}>Retry</button></CareNotice>}
 <section className="care-panel space-y-5"><label className="care-field">Booked appointment<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{loading?'Loading appointments…':'Choose an appointment'}</option>{items.map(x=><option key={x.id} value={x.id}>{x.patient_name} · {x.scheduled_date} at {x.scheduled_time}</option>)}</select></label>{appointment&&<AppointmentReminders key={appointment.id} appointment={appointment} onSaved={updated=>setItems(old=>old.map(x=>x.id===updated.id?updated:x))}/>}</section>
 <Disclosure title="Advanced messaging delivery test" description="Uses the configured provider and sends real messages to the entered destination."><RecallDeliveryTest/></Disclosure></div>
}

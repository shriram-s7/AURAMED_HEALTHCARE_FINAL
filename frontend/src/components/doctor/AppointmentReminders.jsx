import {useServerDraftState} from '../../hooks/useDraftState'
import {useEffect,useState} from 'react'
import api from '../../services/api'
import {CareNotice,Disclosure} from '../common/CareUI'
export default function AppointmentReminders({appointment,onSaved}){
 const scope=`reminders:${appointment.id}`
 const [channels,setChannels,hydrateChannels,commitChannels]=useServerDraftState('channels',['in_app'],scope)
 const [lead,setLead,hydrateLead,commitLead]=useServerDraftState('lead',1,scope)
 const [consent,setConsent,hydrateConsent,commitConsent]=useServerDraftState('consent',false,scope)
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState('')
 useEffect(()=>{hydrateChannels(appointment.reminders?.channels||['in_app']);hydrateLead(appointment.reminders?.lead_days||1);hydrateConsent(appointment.reminders?.consent||false)},[appointment.id,appointment.reminders])
 useEffect(()=>{setNotice('');setPreview('')},[appointment.id])
 async function save(){setBusy(true);setError('');try{const {data}=await api.put(`/doctor/appointments/${appointment.id}/reminders`,{channels,lead_days:Number(lead),consent});commitChannels(data.reminders.channels);commitLead(data.reminders.lead_days);commitConsent(data.reminders.consent);onSaved?.(data);setNotice('Reminder preferences saved for this appointment. Text delivery requires a configured messaging provider.')}catch(e){setError(e.response?.data?.detail||'Could not save reminders.')}finally{setBusy(false)}}
 return <div className="space-y-4"><p className="text-sm leading-6 text-slate-500">The patient receives an appointment confirmation in their portal. Choose how to remind them before the visit.</p>
 <div className="flex flex-wrap gap-5">{[['in_app','Patient portal'],['sms','SMS'],['whatsapp','WhatsApp']].map(([key,label])=><label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={channels.includes(key)} onChange={e=>setChannels(old=>e.target.checked?[...old,key]:old.filter(x=>x!==key))}/>{label}</label>)}</div>
 <label className="care-field max-w-xs">Remind before the visit<select value={lead} onChange={e=>setLead(Number(e.target.value))}>{[1,2,3,7].map(n=><option value={n} key={n}>{n} day{n>1?'s':''} before</option>)}</select></label>
 {channels.some(x=>x!=='in_app')&&<label className="flex items-start gap-2 text-sm text-slate-600"><input className="mt-1" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>The patient has agreed to receive appointment text reminders.</label>}
 <button className="care-secondary" disabled={busy||(channels.some(x=>x!=='in_app')&&!consent)} onClick={save}>{busy?'Saving…':'Save reminders'}</button>
 {notice&&<CareNotice>{notice}</CareNotice>}{error&&<CareNotice tone="error">{error}</CareNotice>}
 {appointment.reminders?.deliveries?.length>0&&<div className="space-y-2 text-xs text-slate-600">{appointment.reminders.deliveries.map((item,i)=><p key={i}>{item.channel==='in_app'?'Patient portal':item.channel.toUpperCase()}: {item.status==='accepted'?'Accepted by provider (delivery not confirmed)':item.status==='accepted_trial_template'?'Provider accepted a trial template':item.status==='sent'?'Available in portal':item.status}</p>)}</div>}
 <Disclosure title="Preview the recall journey" description="Presentation mode · no messages are sent and the appointment is unchanged."><div className="flex flex-wrap gap-2"><button className="care-secondary" onClick={()=>setPreview('confirmation')}>Appointment booked</button><button className="care-secondary" onClick={()=>setPreview('reminder')}>Jump to reminder day</button></div>{preview&&<div role="status" className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-5"><p className="care-kicker">Simulation only</p><h3 className="font-semibold">{preview==='confirmation'?'Appointment scheduled':'Your appointment is coming up'}</h3><p className="mt-2 text-sm">{appointment.patient_name}: your appointment is on {appointment.scheduled_date} at {appointment.scheduled_time}, {appointment.location}.</p><p className="mt-2 text-xs text-slate-500">{preview==='confirmation'?'Patient portal confirmation':`${lead} day(s) before the visit · ${channels.map(x=>x==='in_app'?'Patient portal':x).join(', ')||'Reminders disabled'}`}</p></div>}</Disclosure>
 </div>
}

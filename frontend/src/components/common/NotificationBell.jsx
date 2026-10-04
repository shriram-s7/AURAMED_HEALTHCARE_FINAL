import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import api from '../../services/api'
import useDataSync from '../../hooks/useDataSync'

export default function NotificationBell() {
  const seen = useRef(null)
  const [popup, setPopup] = useState(null)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const role = useLocation().pathname.split('/')[1]
  const navigate = useNavigate()
  const load = () => api.get('/notifications').then(res => { const next=res.data||[]; if(seen.current){const fresh=next.find(item=>!seen.current.has(item.id));if(fresh)setPopup(fresh)}; seen.current=new Set(next.map(item=>item.id)); setItems(next); setError('') }).catch(() => setError('Could not load notifications.'))
  useEffect(() => { seen.current=null; setPopup(null); load(); const timer=setInterval(load,30000); return()=>clearInterval(timer) }, [role])
  useDataSync(load)
  async function read(item) {
    try {
      await api.patch(`/notifications/${item.id}/read`)
      setItems(previous => previous.filter(n => n.id !== item.id))
      setOpen(false)
      setPopup(null)
      const resource = item.related_resource_type
      const target = resource === 'report' ? `/${role}/reports/${item.related_resource_id}` : resource === 'appointment' ? `/${role}/appointments` : resource === 'patient' && role === 'doctor' ? `/doctor/patients/${item.related_resource_id}` : `/${role}`
      navigate(role === 'admin' && resource === 'report' ? '/admin/reports' : target)
    } catch { setError('Could not mark this notification as read. Please retry.') }
  }
  return <div className="relative">
    <button type="button" onClick={() => { setOpen(!open); if (!open) load() }} aria-label="Notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"><Bell size={19} />{items.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-teal-600 px-1.5 text-[10px] text-white">{items.length}</span>}</button>
    {popup && !open && <div role="status" className="fixed right-5 top-20 z-50 w-80 max-w-[90vw] rounded-xl border border-teal-200 bg-white p-4 shadow-xl"><div className="flex justify-between gap-3"><strong className="text-sm">{popup.title}</strong><button aria-label="Dismiss notification" onClick={()=>setPopup(null)}><X size={16}/></button></div><p className="my-2 text-xs leading-5 text-slate-600">{popup.message}</p><button className="care-text-link" onClick={()=>read(popup)}>View details</button></div>}
    {open && <div className="absolute right-0 top-11 z-50 w-80 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-2 flex justify-between text-sm font-semibold"><span>Notifications</span><button onClick={() => setOpen(false)} aria-label="Close notifications"><X size={16} /></button></div>
      {error && <button onClick={load} className="text-xs text-red-600">{error} Retry</button>}
      {!error && !items.length && <p className="py-5 text-center text-xs text-slate-500">You are up to date.</p>}
      <div className="max-h-72 overflow-y-auto">{items.map(item => <button key={item.id} onClick={() => read(item)} className="mb-1 block w-full rounded-lg p-2 text-left hover:bg-teal-50"><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 text-xs text-slate-600">{item.message}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString()}</p></button>)}</div>
    </div>}
  </div>
}

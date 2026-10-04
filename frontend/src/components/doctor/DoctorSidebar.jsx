import { Link, useLocation } from 'react-router-dom'
import { Activity, Calendar, CalendarClock, FileText, LayoutDashboard, Plus, Send, Settings, Users } from 'lucide-react'
import InitialsAvatar from '../common/InitialsAvatar'
const main = [['/doctor','Today',LayoutDashboard],['/doctor/patients','Patients',Users],['/doctor/appointments','Schedule',Calendar],['/doctor/reports','Reports',FileText]]
const more = [['/doctor/referrals','Referrals',Send],['/doctor/recalls','Reminders',CalendarClock],['/doctor/activity','Activity',Activity],['/doctor/settings','Settings',Settings]]
export default function DoctorSidebar({doctor}) {
 const {pathname}=useLocation()
 const links=items=>items.map(([to,label,Icon])=><Link key={to} to={to} aria-current={(to==='/doctor'?pathname===to:pathname.startsWith(to))?'page':undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${(to==='/doctor'?pathname===to:pathname.startsWith(to))?'bg-teal-50 font-semibold text-teal-800':'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={18}/>{label}</Link>)
 return <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-slate-200 bg-white">
 <Link to="/doctor" className="px-6 py-6 text-xl font-semibold tracking-tight text-slate-900">Aura<span className="text-teal-700">Med</span><span className="mt-1 block text-[10px] font-medium uppercase tracking-widest text-slate-400">Clinical workspace</span></Link>
 <div className="px-4 pb-5"><Link to="/doctor/examinations/new" className="care-primary w-full !px-2"><Plus size={17}/>New examination</Link></div>
 <nav aria-label="Doctor navigation" className="flex-1 overflow-y-auto px-3 space-y-1">{links(main)}<details className="pt-5" open={more.some(([to])=>pathname.startsWith(to))||undefined}><summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-400">More tools</summary><div className="mt-2 space-y-1">{links(more)}</div></details></nav>
 <div className="m-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3"><InitialsAvatar name={doctor?.full_name||'Doctor'} size={30}/><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{doctor?.full_name||'Doctor'}</p><p className="truncate text-[10px] text-slate-500">{doctor?.registration_number||'Signed-in clinician'}</p></div></div></aside>
}

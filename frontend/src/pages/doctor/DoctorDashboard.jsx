import {useCallback,useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import useDataSync from '../../hooks/useDataSync'
import {CareHeader,CareNotice,Disclosure} from '../../components/common/CareUI'
import UrgentCasesTable from '../../components/doctor/UrgentCasesTable'
import FollowupsTable from '../../components/doctor/FollowupsTable'
import RecentScansTable from '../../components/doctor/RecentScansTable'
import ActivityChart from '../../components/doctor/ActivityChart'
import {fetchDashboardSummary} from '../../services/dashboardService'
export default function DoctorDashboard(){
 const [summary,setSummary]=useState(null),[error,setError]=useState('')
 const load=useCallback(()=>fetchDashboardSummary().then(res=>{setSummary(res.data);setError('')}).catch(()=>setError('Could not refresh the workspace. Please retry.')),[])
 useEffect(()=>{load();const timer=setInterval(load,60000);return()=>clearInterval(timer)},[load]);useDataSync(load)
 return <div className="care-page"><CareHeader eyebrow="Your clinical workspace" title="What needs your attention?" description="Start an examination or pick up care where you left off."><Link className="care-primary" to="/doctor/examinations/new">New examination →</Link></CareHeader>
 {error&&<CareNotice tone="error">{error} <button className="underline" onClick={load}>Retry</button></CareNotice>}
 {!summary?<p className="care-empty">Loading your workspace…</p>:<>
 <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[['Patients','total_patients'],['Examinations','scans_analyzed'],['Upcoming visits','upcoming_followups'],['Critical cases','critical_cases']].map(([label,key])=><div key={key} className="care-panel !p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{summary.stats?.[key]?.value??0}</p></div>)}</div>
 <section><h2 className="mb-3 font-semibold text-slate-900">Needs attention</h2><UrgentCasesTable cases={summary.urgent_cases||[]}/></section>
 <section><div className="mb-3 flex justify-between"><h2 className="font-semibold text-slate-900">Upcoming visits</h2><Link className="care-text-link" to="/doctor/appointments">View schedule</Link></div><FollowupsTable followups={summary.upcoming_followups||[]}/></section>
 <section><h2 className="mb-3 font-semibold text-slate-900">Continue recent examinations</h2><RecentScansTable scans={summary.recent_scans||[]}/></section>
 <Disclosure title="Activity over the last 30 days"><ActivityChart data={summary.activity||[]}/></Disclosure>
 </>}
 </div>
}

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import api from '../../services/api'

const destinations = {
  doctor: ['Patients', 'Appointments', 'Reports', 'Referrals', 'Recalls', 'Activity', 'Settings'],
  patient: ['Reports', 'Appointments', 'Timeline', 'Profile'],
  admin: ['Doctors', 'Patients', 'Scans', 'Reports', 'Appointments', 'Data requests', 'Audit logs', 'Settings'],
}
export default function GlobalSearch() {
  const role = useLocation().pathname.split('/')[1]
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    setResults([]); setError('')
    if (query.trim().length < 2) { setBusy(false); return }
    setBusy(true)
    const timer = setTimeout(async () => {
      const sections = role === 'doctor' ? ['patients', 'reports'] : role === 'admin' ? ['patients', 'doctors', 'reports'] : ['reports']
      const responses = await Promise.allSettled(sections.map(section => api.get(`/${role}/${section}`, { params: { search: query, page_size: 100 } })))
      if (cancelled) return
      const matches = []
      responses.forEach((response, index) => {
        if (response.status !== 'fulfilled') return
        const data = response.value.data
        const list = Array.isArray(data) ? data : data?.items || data?.[sections[index]] || []
        list.forEach(item => {
          const label = item.full_name || item.name || item.patient_name || item.report_type || item.report_number || ''
          const detail = item.patient_code || item.email || item.report_number || item.date || ''
          if (!`${label} ${detail}`.toLowerCase().includes(query.toLowerCase())) return
          const id = item.id || item.report_id
          const section = sections[index]
          matches.push({ label, detail, url: role === 'admin' ? `/${role}/${section}` : `/${role}/${section}/${id}` })
        })
      })
      setResults(matches.slice(0, 10))
      if (responses.every(response => response.status === 'rejected')) setError('Search unavailable. Use the page links below or try again.')
      setBusy(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, role])
  const pages = (destinations[role] || []).filter(title => title.toLowerCase().includes(query.toLowerCase()))
  return <div className="relative min-w-0 flex-1">
    <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
    <input aria-label="Search portal" value={query} onChange={e => setQuery(e.target.value)} placeholder={role === 'patient' ? 'Search reports or pages…' : 'Search patients, reports or pages…'} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-xs outline-none focus:border-teal-500" />
    {query && <><button aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-2.5 text-slate-400"><X size={14} /></button><div className="absolute left-0 right-0 top-11 z-50 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      {busy && <p className="p-2 text-xs text-slate-500">Searching…</p>}
      {error && <p className="p-2 text-xs text-red-600">{error}</p>}
      {pages.map(title => <Link onClick={() => setQuery('')} key={title} to={`/${role}/${title.toLowerCase().replaceAll(' ', '-')}`} className="block rounded-lg p-2 text-xs font-semibold hover:bg-teal-50">{title}</Link>)}
      {results.map((result, i) => <Link onClick={() => setQuery('')} key={i} to={result.url} className="block rounded-lg p-2 text-xs hover:bg-teal-50"><p className="font-semibold">{result.label}</p><p className="text-slate-500">{result.detail}</p></Link>)}
      {!busy && !pages.length && !results.length && <p className="p-2 text-xs text-slate-500">{query.length < 2 ? 'Type at least two characters to search records.' : 'No matching records or pages.'}</p>}
    </div></>}
  </div>
}

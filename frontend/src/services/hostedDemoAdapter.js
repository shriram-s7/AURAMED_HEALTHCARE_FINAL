import { AxiosError } from 'axios'

const copy = value => structuredClone(value)
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
const encode = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
function claims(token) {
  try {
    if (!token?.startsWith('public-demo.')) return null
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch { return null }
}

// This adapter never forwards a request to a backend. Only an explicitly opted-in
// production build installs it; development continues to use the real API.
export function createHostedDemoAdapter(load = () => fetch('/hosted-demo/fixtures.json').then(r => {
  if (!r.ok) throw new Error('Saved demo data could not be loaded.')
  return r.json()
})) {
  let fixturesPromise
  const signed = new Set()
  const shared = new Set()
  return async config => {
    const path = new URL(config.url, 'https://demo.invalid').pathname.replace(/^\/api(?=\/)/, '')
    const method = (config.method || 'get').toLowerCase()
    const ok = data => ({ data: copy(data), status: 200, statusText: 'OK', headers: {}, config })
    const fail = (detail, status = 403) => {
      throw new AxiosError(detail, 'ERR_BAD_REQUEST', config, null, { data: { detail }, status, statusText: 'Demo request unavailable', headers: {}, config })
    }
    const f = await (fixturesPromise ||= Promise.resolve().then(load))
    const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {}
    const session = claims(config.headers?.Authorization?.replace(/^Bearer /, ''))
    const role = session?.role
    const tokenFor = account => {
      const payload = { sub: account.id, email: account.email, name: account.profile.full_name, role: account.role, doctor_id: account.role === 'doctor' ? account.profile.id : undefined, patient_id: account.role === 'patient' ? account.profile.id : undefined, exp: Math.floor(Date.now() / 1000) + 86400, demo: true }
      const token = `public-demo.${encode(payload)}.public-demo`
      return { access_token: token, refresh_token: token, expires_in: 86400, role: account.role }
    }
    if (/^\/auth\/(?:admin\/|doctor\/|patient\/)?login$/.test(path)) {
      const account = Object.values(f.accounts).find(a => a.email === (body.email || body.identifier)?.trim().toLowerCase())
      const passwords = { doctor: 'Doctor@123', patient: 'Patient@123', admin: 'Admin@123' }
      if (!account || body.password !== passwords[account.role]) fail('Choose Doctor, Patient or Admin above to use a public sample account.', 401)
      const requestedRole = path.split('/')[2]
      if (requestedRole !== 'login' && requestedRole !== account.role) fail('Choose the matching demo role.', 401)
      return ok(tokenFor(account))
    }
    if (path === '/auth/refresh') {
      const previous = claims(body.refresh_token)
      if (!previous || !f.accounts[previous.role]) fail('Please sign in to the demo again.', 401)
      return ok(tokenFor(f.accounts[previous.role]))
    }
    if (path === '/public/stats' && method === 'get') return ok(f.responses['doctor:/public/stats'])
    if (!role || !f.accounts[role]) fail('Please choose a demo account first.', 401)
    if (path === '/auth/logout') return ok({ message: 'Demo session ended.' })
    if (path.startsWith('/doctor/') && role !== 'doctor') fail('Use the Doctor demo account for this page.')
    if ((path.startsWith('/patient/') || path.startsWith('/patients/')) && role !== 'patient') fail('Use the Patient demo account for this page.')
    if (path.startsWith('/admin/') && role !== 'admin') fail('Use the Admin demo account for this page.')
    const caseByReport = f.cases.find(c => path.includes(c.report_id))
    const caseByScan = f.cases.find(c => path.includes(c.scan_id))
    const reportFor = c => {
      const report = copy(signed.has(c.report_id) ? f.signed_reports[c.report_id] : f.responses[`doctor:/doctor/reports/${c.report_id}`])
      report.shared_with_patient = shared.has(c.report_id)
      return report
    }
    if (method === 'get') {
      if (caseByScan && path === `/scans/${caseByScan.scan_id}/primary-image`) return ok({ image_url: caseByScan.sources[0].src, image_path: caseByScan.sources[0].src })
      if (caseByScan && path.endsWith('/report')) return ok(reportFor(caseByScan))
      if (caseByReport && path === `/doctor/reports/${caseByReport.report_id}`) return ok(reportFor(caseByReport))
      if (caseByScan && path === `/doctor/scans/${caseByScan.scan_id}`) return ok({ ...f.responses[`doctor:/doctor/scans/${caseByScan.scan_id}/results`], id: caseByScan.scan_id, patient_id: caseByScan.patient_id })
      if (caseByReport && path.endsWith('/pdf')) {
        const response = await fetch(caseByReport.pdf_url)
        if (!response.ok) fail('The sample PDF is unavailable.', 404)
        return { ...ok(null), data: await response.blob() }
      }
      const snapshot = f.responses[`${role}:${path}`]
      if (snapshot === undefined) fail('This page is not included in the saved demonstration.', 404)
      const data = copy(snapshot)
      const urgent = Array.isArray(data) && path.endsWith('/urgent-cases') ? data : data.urgent_cases
      for (const item of urgent || []) {
        try { item.reason = JSON.parse(item.reason).overall || item.reason } catch { /* Plain text reason. */ }
      }
      if (Array.isArray(data.items)) {
        let items = data.items
        if (path === '/doctor/patients') items = items.filter(item => item.id === f.cases[0].patient_id)
        for (const key of ['module', 'status', 'risk_level', 'scan_id', 'patient_id']) {
          if (config.params?.[key] && config.params[key] !== 'all') items = items.filter(item => String(item[key]) === String(config.params[key]))
        }
        const search = (config.params?.search || '').toLowerCase()
        if (search) items = items.filter(item => JSON.stringify(item).toLowerCase().includes(search))
        data.total = items.length
        const limit = Number(config.params?.page_size || config.params?.limit || 100)
        const page = Number(config.params?.page || 1)
        data.items = items.slice((page - 1) * limit, page * limit)
        data.page = page; data.total_pages = Math.ceil(data.total / limit)
      }
      return ok(data)
    }
    if (path === '/doctor/scans/quality-check' || path === '/doctor/scans/analyze') {
      if (!(body instanceof FormData)) fail('Load a bundled sample first.', 422)
      const images = [body.get('image'), ...body.getAll('additional_images')].filter(Boolean)
      const hashes = await Promise.all(images.map(async image => {
        const digest = await crypto.subtle.digest('SHA-256', await image.arrayBuffer())
        return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
      }))
      const views = JSON.parse(body.get('image_views') || '[]')
      const c = f.cases.find(c => c.module === body.get('module') && canonical(c.sha256) === canonical(hashes) && canonical(c.sources.map(s => s.view || '')) === canonical(views))
      if (!c) fail('Only the nine bundled demo samples work online. Choose a sample from Try demo inputs; custom images need the real backend.', 422)
      if (path.endsWith('/quality-check')) return ok(c.quality)
      if (body.get('patient_id') !== c.patient_id || canonical(JSON.parse(body.get('clinical_inputs') || '{}')) !== canonical(c.inputs) || body.get('image_quality') !== c.quality.quality) fail('The saved result requires the original demo patient and unchanged sample inputs. Load the sample again.', 422)
      return ok(c.analysis)
    }
    if (caseByReport && path.endsWith('/generate-pdf')) {
      const response = await fetch(caseByReport.pdf_url)
      if (!response.ok) fail('The sample PDF is unavailable.', 404)
      return { ...ok(null), data: await response.blob() }
    }
    if (caseByReport && method === 'put') {
      if (canonical(body.content) !== canonical(reportFor(caseByReport).content)) fail('Saved demo reports are read-only so the displayed findings match the sample PDF.')
      return ok(reportFor(caseByReport))
    }
    if (caseByReport && path.endsWith('/sign')) {
      signed.add(caseByReport.report_id)
      return ok({ id: caseByReport.report_id, report: reportFor(caseByReport), message: 'Demo signing simulated in this tab.' })
    }
    if (caseByReport && path.endsWith('/share')) {
      if (!signed.has(caseByReport.report_id)) fail('Simulate signing the demo report first.')
      if (body.delivery_method !== 'portal' || body.share_with_physician) fail('The demo supports simulated patient portal sharing only. No messages are sent.')
      if (body.share_with_patient) shared.add(caseByReport.report_id)
      return ok({ message: 'Demo portal sharing simulated in this tab.', report: reportFor(caseByReport) })
    }
    fail('This action needs the real backend. The public demo supports saved sample results, PDF downloads and simulated signing and portal sharing.')
  }
}

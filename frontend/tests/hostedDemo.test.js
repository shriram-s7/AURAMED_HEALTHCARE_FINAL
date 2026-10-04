import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import axios from 'axios'
import { createHostedDemoAdapter } from '../src/services/hostedDemoAdapter.js'
import { isHostedDemoBuild } from '../src/config/demoAccess.js'
test('Only an explicitly opted-in production build uses saved results; development stays real', () => {
  assert.equal(isHostedDemoBuild({PROD:true,VITE_HOSTED_DEMO:'true'}),true)
  for (const env of [{DEV:true,PROD:false,VITE_HOSTED_DEMO:'true'}, {DEV:true,PROD:true,VITE_HOSTED_DEMO:'true'}, {PROD:true}, {PROD:true,VITE_HOSTED_DEMO:'false'}]) assert.equal(isHostedDemoBuild(env),false)
})
const f = JSON.parse(await readFile(new URL('../public/hosted-demo/fixtures.json', import.meta.url)))
function client() { return axios.create({ adapter: createHostedDemoAdapter(() => f) }) }
async function login(api, role = 'doctor') {
  const { data } = await api.post('/auth/login', { email: f.accounts[role].email, password: ({doctor:'Doctor@123',patient:'Patient@123',admin:'Admin@123'})[role] })
  api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`
  return data
}
async function form(c) {
  const data = new FormData()
  data.append('module', c.module); data.append('patient_id', c.patient_id)
  data.append('clinical_inputs', JSON.stringify(c.inputs)); data.append('image_quality', c.quality.quality)
  data.append('image_views', JSON.stringify(c.sources.map(s => s.view || '')))
  for (const [i, source] of c.sources.entries()) data.append(i ? 'additional_images' : 'image', new Blob([await readFile(new URL(`../public${source.src}`, import.meta.url))]), source.src.split('/').pop())
  return data
}
for (const c of f.cases) test(`${c.module}/${c.tier}: exact saved model, heatmap and report agree`, async () => {
  const api = client(); await login(api)
  const submission = await form(c)
  assert.deepEqual((await api.post('/doctor/scans/quality-check', submission)).data, c.quality)
  assert.deepEqual((await api.post('/doctor/scans/analyze', submission)).data, c.analysis)
  const { data: result } = await api.get(`/doctor/scans/${c.scan_id}/results`)
  assert.deepEqual(result, f.responses[`doctor:/doctor/scans/${c.scan_id}/results`])
  for (const key of ['fusion_score','image_model_score','formula_score','grad_cam_base64']) assert.deepEqual(result[key], c.analysis[key])
  // The backend normalizes diagnostic labels to dashboard risk categories on GET.
  const normalized = { normal:'low', unlikely:'low', confirmed:'critical' }
  assert.equal(result.risk_level, normalized[c.analysis.risk_level] || c.analysis.risk_level)
  assert.ok(result.grad_cam_base64.length > 100)
  const { data: report } = await api.get(`/doctor/scans/${c.scan_id}/report`)
  assert.equal(report.scan_id, c.scan_id); assert.equal(report.risk_level, result.risk_level)
  const weights = c.analysis.fusion_result
  assert.deepEqual(result.fusion_weights, {image:weights.image_weight, clinical:weights.formula_weight})
  const calculated = result.image_model_score * weights.image_weight + result.formula_score * weights.formula_weight
  assert.ok(Math.abs(calculated - result.fusion_score) < 0.00011, 'Displayed weights reproduce the stored fusion score')
  assert.equal(report.content.ai_assessment.rows.at(-1).score, result.fusion_score)
  assert.ok(report.content.ai_assessment.rows.at(-1).component.includes(`${Math.round(weights.image_weight*100)}/${Math.round(weights.formula_weight*100)}`))
  if (c.module === 'pcos') {
    assert.deepEqual(report.content.recommendations.recommendations_list, c.analysis.recommended_actions)
    const patient = f.responses[`patient:/patient/reports/${c.report_id}`]
    assert.equal(patient.recommendations_tab.doctor_advice, c.analysis.recommended_actions.join('\n'))
    assert.doesNotMatch(JSON.stringify(patient.summary_tab), /oncology|biopsy|cancer/i)
  }
  assert.ok((await readFile(new URL(`../public${c.pdf_url}`, import.meta.url))).subarray(0,5).equals(Buffer.from('%PDF-')))
})
test('Rejects changed inputs, mismatched patient, unrecognized image bytes and incorrect views', async () => {
  const api = client(); await login(api); const c = f.cases[0]
  for (const change of [s => s.set('clinical_inputs', JSON.stringify({...c.inputs, age: 99})), s => s.set('patient_id','unknown'), s => s.set('image',new Blob(['not-a-demo-image']),'low_mlo.png'), s => s.set('image_views',JSON.stringify(['R CC','R MLO']))]) {
    const submission = await form(c); change(submission)
    await assert.rejects(api.post('/doctor/scans/analyze', submission), err => err.response.status === 422)
  }
})
test('Sample accounts require correct credentials and respect role boundaries', async () => {
  const api = client()
  await assert.rejects(api.post('/auth/login',{ email:f.accounts.doctor.email,password:'wrong' }), err => err.response.status === 401)
  await login(api,'patient')
  await assert.rejects(api.get('/doctor/scans'), err => err.response.status === 403)
  assert.equal((await api.get('/patient/reports')).status,200)
  await login(api,'admin'); assert.equal((await api.get('/admin/stats')).status,200)
  await assert.rejects(api.post('/admin/doctors',{name:'New'}), err => err.response.status === 403)
})
test('Read-only reports, tab-local signing/sharing and no unsupported action forwarding', async () => {
  const api = client(); await login(api); const c = f.cases[0]
  await assert.rejects(api.post(`/doctor/reports/${c.report_id}/share`,{delivery_method:'portal',share_with_patient:true}), err => err.response.status === 403)
  await assert.rejects(api.put(`/doctor/reports/${c.report_id}`,{content:{risk_level:'low'}}), err => err.response.status === 403)
  await api.post(`/doctor/reports/${c.report_id}/sign`)
  await api.post(`/doctor/reports/${c.report_id}/share`,{delivery_method:'portal',share_with_patient:true})
  assert.equal((await api.get(`/doctor/scans/${c.scan_id}/report`)).data.shared_with_patient,true)
  await assert.rejects(api.post(`/doctor/reports/${c.report_id}/share`,{delivery_method:'email',share_with_patient:true}), err => err.response.status === 403)
  const fresh = client(); await login(fresh)
  assert.equal((await fresh.get(`/doctor/scans/${c.scan_id}/report`)).data.shared_with_patient,false)
  await assert.rejects(api.post('/doctor/scans/draft',{}), err => err.response.status === 403)
})

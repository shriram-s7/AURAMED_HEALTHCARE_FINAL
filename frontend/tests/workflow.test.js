/* global process */
import test from 'node:test'
import assert from 'node:assert/strict'
import { SCAN_TEST_CASES } from '../src/config/scanTestCases.js'
import { validateClinicalInputs } from '../src/utils/scanValidation.js'
import { followupDate, isReportFinalized, moduleFromPath, workflowPage } from '../src/utils/workflow.js'

for (const [module, tiers] of Object.entries(SCAN_TEST_CASES)) {
  for (const [tier, inputs] of Object.entries(tiers)) {
    test(`${module} ${tier} demonstration inputs satisfy the workbench requirements`, () => {
      assert.deepEqual(validateClinicalInputs(module, inputs), { valid: true, errors: [] })
    })
  }
}
test('literal module routes retain their module and signed legacy reports stay locked', () => {
  assert.equal(moduleFromPath('/doctor/scan/cervical/results/abc'), 'cervical')
  assert.equal(moduleFromPath('/doctor/scan/pcos/report/abc'), 'pcos')
  assert.equal(isReportFinalized({ status: 'draft', signed_at: '2026-10-04' }), true)
  assert.equal(isReportFinalized({ status: 'draft' }), false)
})
test('follow-up month and year intervals are not treated as days', () => {
  const today = new Date(2026, 9, 4, 12)
  assert.equal(followupDate('2 months', today), '2026-12-03')
  assert.equal(followupDate('2–4 weeks', today), '2026-10-25')
  assert.equal(followupDate('annual', today), '2027-10-04')
})
test('returning from results retains the scan identity', () => {
  assert.match(JSON.stringify(workflowPage('/doctor/scan/pcos/results/scan-id')), /scanId=scan-id/)
})


test('referral detours preserve the examination and reject external return paths', async () => {
  const { referralPath, referralReturnPath } = await import('../src/utils/workflow.js')
  const origin = '/doctor/scan/breast/share/scan-1'
  const link = referralPath('patient-1', 'scan-1', origin)
  const query = new URLSearchParams(link.split('?')[1])
  assert.equal(query.get('scanId'), 'scan-1')
  assert.equal(query.get('returnTo'), origin)
  assert.equal(referralReturnPath('//evil.example', 'patient-1'), '/doctor/patients/patient-1')
  assert.equal(workflowPage('/doctor/referrals/new/patient-1', '?' + query).back, origin)
})

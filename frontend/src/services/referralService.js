import api from './api'

export function fetchSpecialists() {
  return api.get('/doctor/referrals/specialists')
}

export function fetchPatientReferralContext(patientId, scanId) {
  return api.get('/doctor/referrals/patient-context/' + patientId, { params: { scan_id: scanId } })
}

export function createReferral(payload) {
  return api.post('/doctor/referrals', payload)
}

export function fetchDoctorReferrals() {
  return api.get('/doctor/referrals')
}

import api from './api'

export function fetchRecalls() {
  return api.get('/doctor/recalls')
}

export function runDemoRecall(payload) {
  return api.post('/doctor/recalls/demo', payload)
}

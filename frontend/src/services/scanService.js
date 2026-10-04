import api from './api'

function appendImages(formData, image, additionalImages, imageViews) {
  if (image) formData.append('image', image)
  for (const extra of additionalImages) formData.append('additional_images', extra)
  formData.append('image_views', JSON.stringify(imageViews || []))
}

export function checkScanQuality({ module, image, additionalImages = [], imageViews = [] }) {
  const formData = new FormData()
  formData.append('module', module)
  appendImages(formData, image, additionalImages, imageViews)
  return api.post('/doctor/scans/quality-check', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function analyzeScan({ draftId, module, patientId, clinicalInputs, imageQuality, image, additionalImages = [], imageViews = [] }) {
  const formData = new FormData()
  formData.append('module', module)
  if (draftId) formData.append('draft_id', draftId)
  formData.append('patient_id', patientId)
  formData.append('clinical_inputs', JSON.stringify(clinicalInputs))
  if (imageQuality) formData.append('image_quality', imageQuality)
  appendImages(formData, image, additionalImages, imageViews)
  return api.post('/doctor/scans/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function saveScanDraft({ scanId, module, patientId, clinicalInputs, scanDate }) {
  return api.post('/doctor/scans/draft', {
    module,
    scan_id: scanId || undefined,
    patient_id: patientId,
    clinical_inputs: clinicalInputs,
    scan_date: scanDate || undefined,
  })
}

export function getScanPrimaryImage(scanId) {
  return api.get(`/scans/${scanId}/primary-image`)
}

export function getScanResults(scanId) {
  return api.get(`/doctor/scans/${scanId}/results`)
}

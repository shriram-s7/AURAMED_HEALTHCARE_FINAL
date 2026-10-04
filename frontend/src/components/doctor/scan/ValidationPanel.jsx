import { AlertTriangle, CheckCircle2 } from 'lucide-react'

function ValidationPanel({ errors, patientSelected, imageUploaded, qualityResult, qualityChecking }) {
  const allErrors = [...errors]
  if (!patientSelected) allErrors.push('Select a patient before running analysis')
  if (!imageUploaded) allErrors.push('At least one image must be uploaded')
  if (qualityChecking) allErrors.push('Image quality check is running')
  if (imageUploaded && !qualityChecking && !qualityResult) allErrors.push('Image quality has not been checked')
  if (imageUploaded && !qualityChecking && qualityResult && qualityResult.quality !== 'adequate') {
    allErrors.push(...(qualityResult.reasons || ['Image quality is inadequate; retake or recheck the scan']))
  }

  const valid = allErrors.length === 0

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-sm font-semibold text-primary">Input Validation</p>
      <div className={`mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-xs ${
        qualityChecking
          ? 'bg-slate-100 text-slate-600'
          : qualityResult?.quality === 'adequate'
            ? 'bg-success/10 text-success'
            : qualityResult?.quality === 'poor'
              ? 'bg-danger/10 text-danger'
              : 'bg-slate-100 text-slate-500'
      }`}>
        {qualityChecking ? (
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : qualityResult?.quality === 'adequate' ? (
          <CheckCircle2 size={15} className="shrink-0" />
        ) : (
          <AlertTriangle size={15} className="shrink-0" />
        )}
        <div>
          <p className="font-semibold">
            {qualityChecking ? 'Checking image quality…' : qualityResult?.quality === 'adequate' ? 'Image Quality: Adequate' : qualityResult?.quality === 'poor' ? 'Retake recommended' : 'Image Quality: Awaiting upload'}
          </p>
          {qualityResult?.quality === 'poor' && (
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {(qualityResult.reasons || []).map((reason, index) => <li key={index}>{reason}</li>)}
            </ul>
          )}
          {qualityResult?.method && <p className="mt-1 opacity-75">{qualityResult.method}</p>}
        </div>
      </div>
      {valid ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          <CheckCircle2 size={16} />
          Ready to run analysis
        </div>
      ) : (
        <div className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={16} />
            {allErrors.length} issue{allErrors.length > 1 ? 's' : ''} to resolve
          </div>
          <ul className="mt-1.5 space-y-1 pl-6 text-xs list-disc">
            {allErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ValidationPanel

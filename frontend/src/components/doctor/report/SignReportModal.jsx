import {useState} from 'react'
import { HOSTED_DEMO } from '../../../config/demoAccess'
import { AlertTriangle, Lock, ShieldCheck, X } from 'lucide-react'

function SignReportModal({
  reportNumber,
  doctorName = 'Signed-in clinician',
  registrationNumber = 'Not provided',
  onClose,
  onConfirm,
  signing = false,
}) {
  const [reviewed,setReviewed]=useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Lock className="text-accent" size={18} />
            <h3 className="text-base font-bold text-primary">{HOSTED_DEMO ? 'Simulate demo signing' : 'Sign clinical report'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-primary/40 hover:bg-slate-100 hover:text-primary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{HOSTED_DEMO ? 'Practice the signing step' : 'Sign and lock this report'}</p>
              <p className="mt-0.5 text-[11px] text-amber-800/90 leading-relaxed">
                {HOSTED_DEMO ? 'This uses a fictional sample clinician. No real signature is created. The sample PDF stays unchanged; refresh resets this simulated step.' : 'You are about to digitally sign this report. Once signed, the report cannot be edited. Only addendums can be added.'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-slate-50 p-3.5 text-xs space-y-1.5">
            <p>
              <span className="text-primary/60">Report Number: </span>
              <strong className="font-mono text-primary">{reportNumber}</strong>
            </p>
            <p>
              <span className="text-primary/60">Signing Physician: </span>
              <strong className="text-primary">{doctorName}</strong>
            </p>
            <p>
              <span className="text-primary/60">Medical Registration No: </span>
              <strong className="font-mono text-primary">{registrationNumber}</strong>
            </p>
          </div>
        </div>

        <label className="mt-5 flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" className="mt-1" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>{HOSTED_DEMO ? 'I understand this is a sample workflow with simulated signing.' : 'I have reviewed this report and approve it under my signed-in physician identity.'}</label>
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={signing}
            className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-primary hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={signing || !reviewed}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-xs font-bold text-white shadow transition hover:bg-accent/90 disabled:opacity-50"
          >
            <ShieldCheck size={14} />
            {signing ? 'Processing...' : HOSTED_DEMO ? 'Confirm demo simulation' : 'Confirm Sign Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SignReportModal

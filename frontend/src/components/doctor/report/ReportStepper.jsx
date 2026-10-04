import { Check, ChevronRight, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

function ReportStepper({ currentStep = 3, isSigned = false, module, scanId, patientId, resultsReady = currentStep > 1 }) {
  const steps = [
    { id: 1, label: 'Prepare' },
    { id: 2, label: 'Review results' },
    { id: 3, label: 'Review & sign' },
    { id: 4, label: 'Share & follow-up' },
  ]

  return (
    <div className="rounded-xl border border-border bg-surface px-6 py-3.5 shadow-sm">
      <div className="flex items-center justify-between overflow-x-auto">
        {steps.map((step, idx) => {
          const isCompleted = step.id < currentStep || (step.id === 3 && isSigned)
          const isCurrent = step.id === currentStep
          const isLocked = step.id === 4 ? !isSigned : step.id > 1 && !resultsReady
          const paths = module && scanId ? {
            1: `/doctor/scan/${module}?${new URLSearchParams({ ...(patientId ? { patientId } : {}), scanId })}`,
            2: `/doctor/scan/${module}/results/${scanId}`,
            3: `/doctor/scan/${module}/report/${scanId}`,
            4: `/doctor/scan/${module}/share/${scanId}`,
          } : {}

          return (
            <div key={step.id} className="flex items-center gap-3">
              <div className="flex items-center gap-2.5" aria-current={isCurrent ? 'step' : undefined}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition ${
                    isCurrent
                      ? 'bg-accent text-white ring-4 ring-accent/20'
                      : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : isLocked
                      ? 'bg-slate-100 text-slate-400 border border-slate-200'
                      : 'bg-slate-100 text-primary/40'
                  }`}
                >
                  {isLocked ? (
                    <Lock size={12} className="text-slate-400" />
                  ) : isCompleted ? (
                    <Check size={14} />
                  ) : (
                    step.id
                  )}
                </span>
                <span
                  className={`text-xs whitespace-nowrap ${
                    isCurrent
                      ? 'font-extrabold text-primary'
                      : isCompleted
                      ? 'font-semibold text-primary/80'
                      : isLocked
                      ? 'text-slate-400 font-medium flex items-center gap-1'
                      : 'text-primary/40 font-medium'
                  }`}
                >
                  {paths[step.id] && !isLocked && !isCurrent ? <Link to={paths[step.id]} className="hover:text-accent hover:underline">{step.label}</Link> : step.label}
                  {isLocked && <span className="text-[10px] text-slate-400 font-normal">(Locked)</span>}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <ChevronRight size={14} className="mx-2 text-primary/20 flex-shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ReportStepper


import { ArrowRight, CheckCircle2, ChevronDown } from 'lucide-react'

export function CareHeader({ eyebrow, title, description, children }) {
  return <header className="care-header"><div><p className="care-kicker">{eyebrow}</p><h1>{title}</h1>{description && <p className="care-description">{description}</p>}</div>{children}</header>
}
export function Disclosure({ title, description, children, open = false, className = '' }) {
  return <details className={`care-disclosure ${className}`} open={open || undefined}><summary><div><span>{title}</span>{description && <p>{description}</p>}</div><ChevronDown size={18} /></summary><div className="care-disclosure-body">{children}</div></details>
}
export function CareNotice({ children, tone = 'info' }) {
  return <div className={`care-notice care-notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}
export function CareAction({ children, onClick, disabled, type = 'button' }) {
  return <button type={type} className="care-primary" onClick={onClick} disabled={disabled}>{children}<ArrowRight size={17} /></button>
}
export function CareComplete({ title, children }) {
  return <div className="care-complete"><CheckCircle2 size={24} /><div><h3>{title}</h3><div>{children}</div></div></div>
}

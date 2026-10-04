import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'
import { workflowPage } from '../../utils/workflow'

export default function WorkflowBar() {
  const { pathname, search } = useLocation()
  const page = workflowPage(pathname, search)
  if (pathname === page.home) return null
  return <div className="border-b border-border bg-white px-4 py-3 sm:px-6" aria-label="Page navigation">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        {pathname !== page.home && <Link to={page.back} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-background"><ArrowLeft size={14} />{page.backLabel}</Link>}
        <span className="text-sm font-semibold text-primary">{page.title}</span>
      </div>
      <Link to={page.home} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent"><Home size={14} />Dashboard</Link>
    </div>
    
  </div>
}

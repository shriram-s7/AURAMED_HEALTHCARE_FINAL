import NotificationBell from '../common/NotificationBell'
import GlobalSearch from '../common/GlobalSearch'
import { useState } from 'react'
import { Bell, ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import InitialsAvatar from '../common/InitialsAvatar'
import { useAuth } from '../../context/AuthContext'

export default function DoctorNavbar({
  doctor,
  notificationCount = 0,
  notifications = [],
  search = '',
  onSearchChange = () => {},
  onToggleSidebar = () => {},
  sidebarOpen = true,
}) {
  const [bellOpen, setBellOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }


  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-border bg-surface px-4 sm:px-6 shrink-0 z-20">
      {/* Left section: Hamburger button & Patient search */}
      <div className="flex items-center gap-3 w-full max-w-md">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-primary/70 hover:bg-background hover:text-primary transition focus:outline-none focus:ring-2 focus:ring-accent/40"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <Menu size={20} />
        </button>

        <GlobalSearch />
      </div>

      {/* Right section: Notifications & Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        <NotificationBell />

        {/* Doctor Profile Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((v) => !v)
              setBellOpen(false)
            }}
            className="flex items-center gap-2.5 rounded-lg py-1 pl-1.5 pr-2.5 hover:bg-background transition focus:outline-none"
          >
            <InitialsAvatar name={doctor?.full_name || 'Doctor'} size={32} />
            <div className="hidden text-left sm:block">
              <p className="text-xs font-bold text-primary leading-tight">
                {doctor?.full_name || 'Doctor'}
              </p>
              <p className="text-[10px] text-primary/50 leading-tight">
                {doctor?.registration_number || '—'}
              </p>
            </div>
            <ChevronDown size={14} className="text-primary/40 hidden sm:block" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-border bg-surface p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-2 border-b border-border/50 sm:hidden">
                <p className="text-xs font-bold text-primary">{doctor?.full_name || 'Doctor'}</p>
                <p className="text-[10px] text-primary/50">{doctor?.registration_number || '—'}</p>
              </div>
              <Link
                to="/doctor/settings"
                onClick={() => setProfileOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-primary hover:bg-background transition"
              >
                <Settings size={15} className="text-primary/60" /> Settings
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition"
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

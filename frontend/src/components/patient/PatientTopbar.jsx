import NotificationBell from '../common/NotificationBell'
import GlobalSearch from '../common/GlobalSearch'
import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search,
  Menu,
  Bell,
  ChevronDown,
  User,
  LogOut,
  ShieldCheck,
  Calendar,
  FileText,
  HelpCircle
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import InitialsAvatar from '../common/InitialsAvatar'

export default function PatientTopbar({ search, onSearchChange, patientInfo, onToggleSidebar = () => {}, sidebarOpen = true }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const patientName = patientInfo?.full_name || 'Patient'
  const patientCode = patientInfo?.patient_code || '—'

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }


  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 z-20 shrink-0">
      {/* Left: Hamburger & Search Bar */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 rounded-xl text-slate-600 hover:text-teal-700 hover:bg-teal-50 transition-colors focus:outline-none"
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
        <GlobalSearch />
      </div>

      {/* Right Controls: Notification Bell + Patient Profile Dropdown */}
      <div className="flex items-center space-x-3">
        <NotificationBell />

        {/* Divider */}
        <div className="h-6 w-px bg-slate-200" />

        {/* Patient Name and Patient ID with Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu)
              setShowNotifications(false)
            }}
            className="flex items-center space-x-2.5 p-1 rounded-2xl hover:bg-slate-50 transition-colors text-left"
          >
            {/* Initials avatar only */}
            <InitialsAvatar name={patientName} size={34} />
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-slate-900 leading-tight">{patientName}</p>
              <p className="text-[10px] font-mono text-slate-400 leading-tight">ID: {patientCode}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* User menu dropdown */}
          {showUserMenu && (
            <div
              onMouseLeave={() => setShowUserMenu(false)}
              className="absolute right-0 top-12 w-52 bg-white rounded-3xl shadow-xl border border-slate-200 py-2 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <div className="px-3.5 py-2 border-b border-slate-100">
                <p className="font-bold text-slate-900">{patientName}</p>
                <p className="text-[10px] font-mono text-teal-600 font-semibold">{patientCode}</p>
              </div>

              <Link
                to="/patient/profile"
                onClick={() => setShowUserMenu(false)}
                className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
              >
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>My Profile</span>
              </Link>

              <Link
                to="/patient/reports"
                onClick={() => setShowUserMenu(false)}
                className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
              >
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>My Reports</span>
              </Link>

              <Link
                to="/patient/appointments"
                onClick={() => setShowUserMenu(false)}
                className="w-full px-3.5 py-2 text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Appointments</span>
              </Link>

              <div className="border-t border-slate-100 my-1" />

              <button
                onClick={handleLogout}
                className="w-full px-3.5 py-2 text-rose-600 hover:bg-rose-50 flex items-center space-x-2 font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

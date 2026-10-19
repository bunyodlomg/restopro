import React from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Grid3X3, ClipboardList, LogOut, Sun, Moon, LayoutDashboard } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { BrandMark, initials } from '../components/ui.jsx'
import SyncBadge from '../components/shared/SyncBadge.jsx'

const NAV = [
  { to: '/waiter',           label: 'Stollar',      Icon: Grid3X3, end: true },
  { to: '/waiter/my-orders', label: 'Buyurtmalarim', Icon: ClipboardList },
]

// Qora yuqori panel — stollar va buyurtmalar sahifalari uchun.
// Buyurtma olish ekrani (POS) o'z panelini chizadi.
export function TopBar({ children }) {
  const { user, logout, isAdmin } = useAuth()
  const { settings } = useSettings()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark size={42}/>
        <div className="hide-mobile"><b>{settings.brandName || 'RestoPro'}</b><small>{isAdmin ? 'Administrator' : 'Ofitsant'}</small></div>
      </div>
      {children}
      <div className="right">
        <SyncBadge/>
        {isAdmin && <button className="bar-btn hide-mobile" title="Admin panel" onClick={() => navigate('/admin')}><LayoutDashboard size={21}/></button>}
        <button className="bar-btn" onClick={toggle} title={isDark ? "Yorug' rejim" : "Qorong'u rejim"}>{isDark ? <Sun size={21}/> : <Moon size={21}/>}</button>
        <span className="avatar hide-mobile" style={{ width: 40, height: 40 }}>{initials(user?.name)}</span>
        <span className="hide-mobile" style={{ fontWeight: 600 }}>{user?.name?.split(' ')[0]}</span>
        <button className="bar-btn" title="Chiqish" onClick={() => { logout(); navigate('/login') }}><LogOut size={21}/></button>
      </div>
    </header>
  )
}

export default function WaiterLayout() {
  const location = useLocation()
  // Buyurtma olish ekrani butun ekranni egallaydi
  const isOrderScreen = /^\/waiter\/(order|soboy)/.test(location.pathname)
  if (isOrderScreen) return <Outlet/>

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar>
        <nav className="topnav hide-mobile" style={{ marginLeft: 16 }}>
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={19}/>{label}
            </NavLink>
          ))}
        </nav>
      </TopBar>
      <main style={{ flex: 1 }}><Outlet/></main>
      <nav className="rail show-mobile">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`} style={{ flex: 1 }}>
            <Icon size={22}/>{label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

import React from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Grid3X3, ClipboardList, LogOut, Sun, Moon } from 'lucide-react'
import { useAuth }     from '../context/AuthContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { useTheme }    from '../context/ThemeContext.jsx'
import { API_URL }     from '../config.js'

export default function WaiterLayout() {
  const { user, logout }   = useAuth()
  const { settings }       = useSettings()
  const { isDark, toggle } = useTheme()
  const navigate           = useNavigate()
  const location           = useLocation()

  const handleLogout = () => { logout(); navigate('/login') }
  const logoSrc   = settings.brandLogo || '🍽'
  const isEmoji   = logoSrc && !logoSrc.startsWith('/')
  const brandName = settings.brandName || 'RestoPro'

  // POS mode: order screen takes full real estate, hides header/nav chrome
  const isOrderScreen = /^\/waiter\/(order|soboy)/.test(location.pathname)

  const NAV = [
    { to: '/waiter',           label: 'Stollar',     Icon: Grid3X3,     end: true },
    { to: '/waiter/my-orders', label: 'Buyurtmalar', Icon: ClipboardList },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'var(--wai-bg)', display:'flex', flexDirection:'column' }}>
      {!isOrderScreen && (
        <header className="wai-header">
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <div className="wai-header-logo">
              {isEmoji ? logoSrc : <img src={`${API_URL}${logoSrc}`} alt="logo" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>}
            </div>
            <div>
              <div style={{ fontFamily:'Sora,sans-serif', fontWeight:700, fontSize:'0.875rem', color:'var(--wai-text)' }}>{brandName}</div>
              <div className="show-mobile-only" style={{ fontSize:'0.65rem', color:'var(--wai-text3)', fontWeight:500 }}>👤 {user?.name}</div>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="wai-header-nav hide-mobile">
            {NAV.map(({ to, label, Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className="wai-header-link"
                style={({ isActive }) => ({
                  background: isActive ? 'var(--brand-glow)' : 'transparent',
                  color: isActive ? 'var(--brand)' : 'var(--wai-text2)',
                  fontWeight: isActive ? 700 : 500,
                })}>
                <Icon size={18}/> {label}
              </NavLink>
            ))}
          </nav>

          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
            {/* Desktop user badge */}
            <div className="wai-header-user hide-mobile">
              <div className="wai-header-avatar">
                {(user?.name||'A')[0].toUpperCase()}
              </div>
              <span style={{ fontWeight:600, fontSize:'0.88rem', color:'var(--wai-text)' }}>{user?.name}</span>
            </div>

            <button onClick={toggle}
              style={{ width:40, height:40, borderRadius:12, border:'1px solid var(--wai-border)', background:'var(--wai-card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--wai-text3)' }}>
              {isDark ? <Sun size={16} color="var(--brand)"/> : <Moon size={16} color="var(--brand)"/>}
            </button>

            <button onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.55rem 1rem', borderRadius: 22,
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
                color: '#EF4444', fontSize: '0.85rem', fontWeight: 600,
                fontFamily: 'DM Sans,sans-serif', cursor: 'pointer',
              }}
            ><LogOut size={14}/> <span className="hide-mobile">Chiqish</span></button>
          </div>
        </header>
      )}

      <main style={{ flex:1, overflowX:'hidden', display:'flex', flexDirection:'column' }}>
        <Outlet/>
      </main>

      {!isOrderScreen && (
        <nav className="show-mobile-only" style={{
          position: 'sticky', bottom: 0,
          background: 'var(--wai-header)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--wai-border)',
          display: 'flex',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
          zIndex: 40, paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} style={{ flex:1, textDecoration:'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 4, padding: '0.85rem 0',
                  color: isActive ? 'var(--brand)' : 'var(--wai-text3)',
                  transition: 'color 0.2s',
                }}>
                  <div style={{
                    width: 48, height: 34, borderRadius: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'var(--brand-glow)' : 'transparent',
                    transition: 'background 0.2s',
                  }}>
                    <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8}/>
                  </div>
                  <span style={{ fontSize:'0.72rem', fontWeight: isActive ? 700 : 500 }}>{label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

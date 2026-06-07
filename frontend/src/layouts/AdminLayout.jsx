import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import{motion,AnimatePresence}from'framer-motion'
import {
  LayoutDashboard, ClipboardList, History, UtensilsCrossed,
  Package2, Hash, Users, Wallet, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu, X, Sun, Moon
} from 'lucide-react'
import { useAuth }     from '../context/AuthContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { useTheme }    from '../context/ThemeContext.jsx'
import { API_URL }     from '../config.js'
import { io }          from 'socket.io-client'
import toast           from 'react-hot-toast'
import { getNewOrderSoundUrl } from '../utils/sound.js'

const NAV = [
  { to:'/admin',             label:'Dashboard',   Icon:LayoutDashboard, end:true },
  { to:'/admin/orders',      label:'Buyurtmalar', Icon:ClipboardList },
  { to:'/admin/history',     label:'Tarix',       Icon:History },
  { to:'/admin/products',    label:'Taomlar',     Icon:UtensilsCrossed },
  { to:'/admin/ingredients', label:'Ombor',       Icon:Package2 },
  { to:'/admin/tables',      label:'Stollar',     Icon:Hash },
  { to:'/admin/users',       label:'Xodimlar',    Icon:Users },
  { to:'/admin/salaries',    label:'Ish haqi',    Icon:Wallet },
  { to:'/admin/settings',    label:'Sozlamalar',  Icon:Settings },
]

export default function AdminLayout() {
  const [collapsed,  setCollapsed]  = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout }            = useAuth()
  const { settings }                = useSettings()
  const { isDark, toggle }          = useTheme()
  const navigate = useNavigate()

  // Yangi buyurtma — admin qaysi sahifada bo'lsa ham ovoz + bildirishnoma
  useEffect(() => {
    const socket = io(API_URL, { transports: ['websocket'], reconnection: true })
    socket.on('newOrder', o => {
      if (localStorage.getItem('rp_sound') === 'true') {
        try { new Audio(getNewOrderSoundUrl(API_URL)).play().catch(() => {}) } catch {}
      }
      toast.success(
        `Yangi buyurtma — ${o.category === 'soboy' ? `Soboy #${o.tableNumber}` : `Stol ${o.tableNumber}`}`,
        { icon: '🔔', duration: 4000 }
      )
    })
    return () => socket.disconnect()
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }
  const w = collapsed ? 80 : 280

  const logoSrc   = settings.brandLogo
  const isEmoji   = logoSrc && !logoSrc.startsWith('/')
  const brandName = settings.brandName || 'RestoPro'

  const SidebarContent = () => (
    <div style={{
      width: w, minHeight: '100vh',
      background: 'var(--sidebar-bg)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s ease', overflow: 'hidden',
    }}>
      {/* Logo / Brand */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '1.1rem 0' : '1.1rem 1rem',
        borderBottom: '1px solid var(--border)', minHeight: 76,
      }}>
        {!collapsed && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', overflow:'hidden', flex:1, minWidth:0 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: isEmoji ? 'linear-gradient(135deg,var(--brand),var(--brand-lt))' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.45rem', overflow: 'hidden',
              boxShadow: '0 4px 14px rgba(var(--brand-rgb),0.35)',
            }}>
              {isEmoji
                ? logoSrc
                : <img src={`${API_URL}${logoSrc}`} alt="logo" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              }
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.05rem', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {brandName}
              </div>
              <div style={{ fontSize:'0.68rem', color:'var(--brand)', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase' }}>Admin Panel</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,var(--brand),var(--brand-lt))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', boxShadow:'0 4px 14px rgba(var(--brand-rgb),0.35)' }}>
            {isEmoji ? logoSrc : '🍽'}
          </div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} className="hide-mobile"
            style={{ width:36, height:36, borderRadius:10, background:'var(--elevated)', border:'1px solid var(--border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-3)', flexShrink:0 }}>
            <ChevronLeft size={18}/>
          </button>
        )}
        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="hide-mobile"
            style={{ position:'absolute', left:62, top:24, width:28, height:28, borderRadius:8, background:'var(--card)', border:'1px solid var(--border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-3)', zIndex:10 }}>
            <ChevronRight size={14}/>
          </button>
        )}
      </div>

      {/* Nav — touch-friendly items (min 52px tall) */}
      <nav style={{ flex:1, padding:'0.75rem 0.55rem', display:'flex', flexDirection:'column', gap:4, overflowY:'auto' }}>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : '0.8rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '0.85rem 0' : '0.85rem 0.85rem',
              borderRadius: 14, textDecoration: 'none',
              color: isActive ? '#fff' : 'var(--text-2)',
              background: isActive ? 'linear-gradient(135deg,var(--brand),var(--brand-dk))' : 'transparent',
              fontWeight: isActive ? 700 : 500,
              fontSize: '0.98rem', fontFamily: 'DM Sans,sans-serif',
              transition: 'background 0.15s, color 0.15s', position: 'relative',
              minHeight: 52,
              boxShadow: isActive ? '0 4px 16px rgba(var(--brand-rgb),0.30)' : 'none',
            })}
          >
            {({ isActive }) => (<>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: isActive ? 'rgba(255,255,255,0.18)' : 'var(--elevated)',
                color: isActive ? '#fff' : 'var(--text-2)',
              }}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2}/>
              </span>
              {!collapsed && <span style={{ whiteSpace:'nowrap' }}>{label}</span>}
            </>)}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: theme toggle + user */}
      <div style={{ padding:'0.625rem 0.55rem', borderTop:'1px solid var(--border)' }}>
        <button onClick={toggle}
          style={{
            display:'flex', alignItems:'center', gap:'0.75rem',
            width:'100%', padding: collapsed ? '0.75rem 0' : '0.75rem 0.85rem',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius:12, background:'var(--elevated)', border:'none', cursor:'pointer',
            color:'var(--text-2)', fontSize:'0.92rem', fontFamily:'DM Sans,sans-serif', fontWeight:600,
            marginBottom:6, minHeight: 48,
          }}
        >
          <span style={{ width:32, height:32, borderRadius:9, background:'var(--brand-glow)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {isDark ? <Sun size={17} color="var(--brand)"/> : <Moon size={17} color="var(--brand)"/>}
          </span>
          {!collapsed && (isDark ? 'Yorug\' rejim' : 'Qorong\'u rejim')}
        </button>

        {/* User */}
        {!collapsed ? (
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.7rem 0.85rem', borderRadius:12, background:'var(--elevated)', marginBottom:6 }}>
              <div style={{ width:40, height:40, borderRadius:11, background:'linear-gradient(135deg,var(--brand),var(--brand-lt))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:'1rem', flexShrink:0 }}>
                {(user?.name||'A')[0].toUpperCase()}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:'0.9rem', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user?.name||'Admin'}</div>
                <div style={{ fontSize:'0.65rem', color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>{user?.role}</div>
              </div>
            </div>
            <button onClick={handleLogout} className="btn-danger" style={{ width:'100%', justifyContent:'flex-start', padding:'0.7rem 0.85rem' }}>
              <LogOut size={16}/> Chiqish
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <div style={{ width:40, height:40, borderRadius:11, background:'linear-gradient(135deg,var(--brand),var(--brand-lt))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:'#fff', fontSize:'0.95rem' }}>
              {(user?.name||'A')[0].toUpperCase()}
            </div>
            <button onClick={handleLogout} title="Chiqish"
              style={{ width:40, height:40, borderRadius:11, background:'rgba(239,68,68,0.10)', border:'1px solid rgba(239,68,68,0.22)', cursor:'pointer', color:'var(--danger)', display:'flex', alignItems:'center', justifyContent:'center' }}
            ><LogOut size={16}/></button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg)' }}>
      {/* Desktop sidebar */}
      <div className="hide-mobile" style={{ flexShrink:0, position:'sticky', top:0, height:'100vh', zIndex:30 }}>
        <SidebarContent/>
      </div>

      {/* Mobile toggle */}
      <button className="show-mobile-only" onClick={() => setMobileOpen(p => !p)}
        style={{ position:'fixed', top:14, left:14, zIndex:60, width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,var(--brand),var(--brand-lt))', border:'none', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 16px rgba(var(--brand-rgb),0.40)' }}
      >{mobileOpen ? <X size={22}/> : <Menu size={22}/>}</button>

      <AnimatePresence>
      {mobileOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex' }}>
          <motion.div
            initial={{opacity:0}}
            animate={{opacity:1}}
            exit={{opacity:0}}
            transition={{duration:0.25}}
            style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)' }} onClick={() => setMobileOpen(false)}/>
          <motion.div
            initial={{x:-300,opacity:0}}
            animate={{x:0,opacity:1}}
            exit={{x:-300,opacity:0}}
            transition={{type:'spring',stiffness:300,damping:28}}
            style={{ position:'relative', zIndex:1 }}><SidebarContent/></motion.div>
        </div>
      )}
      </AnimatePresence>

      <main style={{ flex:1, minWidth:0, overflow:'auto' }}>
        <Outlet/>
      </main>
    </div>
  )
}

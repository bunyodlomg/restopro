import React, { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, History, UtensilsCrossed, Package2,
  Grid3X3, Users, Wallet, Settings, LogOut, Sun, Moon, KeyRound, ShoppingBag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { API_URL } from '../config.js'
import { createSocket } from '../api/socket.js'
import { getNewOrderSoundUrl } from '../utils/sound.js'
import { BrandMark, initials } from '../components/ui.jsx'
import SyncBadge from '../components/shared/SyncBadge.jsx'

const NAV = [
  { to: '/admin',             label: 'Bosh',     Icon: LayoutDashboard, end: true },
  { to: '/admin/orders',      label: 'Buyurtma', Icon: ClipboardList },
  { to: '/waiter',            label: 'Kassa',    Icon: ShoppingBag },
  { to: '/admin/history',     label: 'Tarix',    Icon: History },
  { to: '/admin/products',    label: 'Taomlar',  Icon: UtensilsCrossed },
  { to: '/admin/ingredients', label: 'Ombor',    Icon: Package2 },
  { to: '/admin/tables',      label: 'Stollar',  Icon: Grid3X3 },
  { to: '/admin/users',       label: 'Xodimlar', Icon: Users },
  { to: '/admin/salaries',    label: 'Ish haqi', Icon: Wallet },
  { to: '/admin/settings',    label: 'Sozlama',  Icon: Settings },
]

function UserMenu() {
  const { user, logout } = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [])

  const item = (Icon, label, fn, danger) => (
    <button className={`btn btn-ghost btn-block ${danger ? 'btn-danger' : ''}`} style={{ justifyContent: 'flex-start' }}
      onClick={() => { setOpen(false); fn() }}>
      <Icon size={19}/> {label}
    </button>
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="rail-link" onClick={() => setOpen(o => !o)} aria-label="Profil">
        <span className="avatar" style={{ width: 40, height: 40 }}>{initials(user?.name)}</span>
      </button>
      {open && (
        <div className="popover user-pop">
          <div style={{ padding: '6px 10px 10px' }}>
            <div style={{ fontWeight: 700 }}>{user?.name}</div>
            <div className="label">{user?.role === 'admin' ? 'Administrator' : 'Ofitsant'}</div>
          </div>
          {item(isDark ? Sun : Moon, isDark ? "Yorug' rejim" : "Qorong'u rejim", toggle)}
          {item(KeyRound, "Parolni o'zgartirish", () => navigate('/change-password'))}
          {item(LogOut, 'Chiqish', () => { logout(); navigate('/login') }, true)}
        </div>
      )}
    </div>
  )
}

export default function AdminLayout() {
  // Yangi buyurtma — admin qaysi sahifada bo'lsa ham ovoz + bildirishnoma
  useEffect(() => {
    const socket = createSocket({ transports: ['websocket'], reconnection: true })
    socket.on('newOrder', o => {
      if (localStorage.getItem('rp_sound') === 'true') {
        try { new Audio(getNewOrderSoundUrl(API_URL)).play().catch(() => {}) } catch {}
      }
      toast(`Yangi buyurtma — ${o.category === 'soboy' ? `Soboy №${o.tableNumber}` : `Stol ${o.tableNumber}`}`, { duration: 4000 })
    })
    return () => socket.disconnect()
  }, [])

  return (
    <div className="shell">
      <nav className="rail">
        <div style={{ marginBottom: 8 }}><BrandMark size={46}/></div>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}>
            <Icon size={22} strokeWidth={1.9}/>{label}
          </NavLink>
        ))}
        <div className="rail-spacer"/>
        <div className="hide-mobile" style={{ padding: '6px 0' }}><SyncBadge compact/></div>
        <UserMenu/>
      </nav>
      <main className="shell-main"><Outlet/></main>
    </div>
  )
}

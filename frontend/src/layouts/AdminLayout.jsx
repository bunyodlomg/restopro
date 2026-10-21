import React, { useEffect, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, History, UtensilsCrossed, Package2,
  Grid3X3, Users, Wallet, Settings, ShoppingBag, CalendarClock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext.jsx'
import { API_URL } from '../config.js'
import { createSocket } from '../api/socket.js'
import { getNewOrderSoundUrl } from '../utils/sound.js'
import { BrandMark, initials } from '../components/ui.jsx'
import SyncBadge from '../components/shared/SyncBadge.jsx'
import ProfileModal from '../components/shared/ProfileModal.jsx'

const NAV = [
  { to: '/admin',             label: 'Bosh',     Icon: LayoutDashboard, end: true },
  { to: '/admin/orders',      label: 'Buyurtma', Icon: ClipboardList },
  { to: '/admin/kassa',       label: 'Ofitsant', Icon: ShoppingBag },
  { to: '/admin/reservations', label: 'Bron',    Icon: CalendarClock },
  { to: '/admin/history',     label: 'Tarix',    Icon: History },
  { to: '/admin/products',    label: 'Taomlar',  Icon: UtensilsCrossed },
  { to: '/admin/ingredients', label: 'Ombor',    Icon: Package2 },
  { to: '/admin/tables',      label: 'Stollar',  Icon: Grid3X3 },
  { to: '/admin/users',       label: 'Xodimlar', Icon: Users },
  { to: '/admin/salaries',    label: 'Ish haqi', Icon: Wallet },
  { to: '/admin/settings',    label: 'Sozlama',  Icon: Settings },
]

function UserMenu() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="rail-link" onClick={() => setOpen(true)} aria-label="Profil" title="Profil">
        <span className="avatar" style={{ width: 40, height: 40 }}>{initials(user?.name)}</span>
      </button>
      <ProfileModal open={open} onClose={() => setOpen(false)}/>
    </>
  )
}

export default function AdminLayout() {
  // Yangi buyurtma — admin qaysi sahifada bo'lsa ham ovoz + bildirishnoma
  useEffect(() => {
    const socket = createSocket({ transports: ['websocket'], reconnection: true })
    socket.on('newOrder', o => {
      // Ovoz standart yoqiq — faqat Buyurtmalar sahifasida o'chirilgan bo'lsa chalinmaydi
      if (localStorage.getItem('rp_sound') !== 'false') {
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
        <div className="rail-user"><UserMenu/></div>
      </nav>
      <main className="shell-main"><Outlet/></main>
    </div>
  )
}

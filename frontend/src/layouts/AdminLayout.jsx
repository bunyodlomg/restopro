import React, { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, History, UtensilsCrossed, Package2,
  Grid3X3, Users, Wallet, Settings, ShoppingBag, CalendarClock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext.jsx'
import { API_URL } from '../config.js'
import { createSocket } from '../api/socket.js'
import API from '../api/api.js'
import { getNewOrderSoundUrl } from '../utils/sound.js'
import { BrandMark, initials } from '../components/ui.jsx'
import SyncBadge from '../components/shared/SyncBadge.jsx'
import ProfileModal from '../components/shared/ProfileModal.jsx'
import { usePlace } from '../utils/sections.js'

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
  // Socket bir marta ulanadi — bo'lim nomlari o'zgarsa ham eng so'nggisi ishlatilsin
  const place = usePlace()
  const placeRef = useRef(place)
  placeRef.current = place
  // Yangi buyurtma — admin qaysi sahifada bo'lsa ham ovoz + bildirishnoma
  useEffect(() => {
    const socket = createSocket({ transports: ['websocket'], reconnection: true })
    socket.on('newOrder', o => {
      // Ovoz standart yoqiq — faqat Buyurtmalar sahifasida o'chirilgan bo'lsa chalinmaydi
      if (localStorage.getItem('rp_sound') !== 'false') {
        try { new Audio(getNewOrderSoundUrl(API_URL)).play().catch(() => {}) } catch {}
      }
      toast(`Yangi buyurtma — ${placeRef.current(o)}`, { duration: 4000 })
    })
    // Ombor: qoldiq minimumdan tushdi yoki tugadi (buyurtma yopilganda, hisobdan chiqarishda)
    socket.on('stockAlert', list => {
      for (const g of list || []) {
        const q = `${+(+g.quantity).toFixed(3)} ${g.unit}`
        toast(g.level === 'out' ? `Omborda tugadi: ${g.name} (${q})` : `Omborda kam qoldi: ${g.name} — ${q}`,
          { id: `stock-${g._id}`, icon: g.level === 'out' ? '⛔' : '⚠️', duration: 8000 })
      }
      loadLow()
    })
    socket.on('stockChanged', loadLow)
    socket.on('syncApplied', ({ colls } = {}) => { if (colls?.includes('ingredients')) loadLow() })
    loadLow()
    return () => socket.disconnect()
  }, [])

  // Menyudagi «Ombor» yonida kam qolgan / tugagan mahsulotlar soni
  const [lowCount, setLowCount] = useState(0)
  function loadLow() { API.get('/api/ingredients/low').then(r => setLowCount(r.data.length)).catch(() => {}) }

  return (
    <div className="shell">
      <nav className="rail">
        <div style={{ marginBottom: 8 }}><BrandMark size={46}/></div>
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `rail-link ${isActive ? 'active' : ''}`}>
            <Icon size={22} strokeWidth={1.9}/>{label}
            {to === '/admin/ingredients' && lowCount > 0 && <span className="rail-badge" title="Kam qolgan / tugagan">{lowCount}</span>}
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

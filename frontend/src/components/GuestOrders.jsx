import React, { useEffect, useState } from 'react'
import { Check, X, QrCode } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../api/api.js'
import { API_URL } from '../config.js'
import { createSocket } from '../api/socket.js'
import { getNewOrderSoundUrl } from '../utils/sound.js'
import { money, minutesSince, fmtDuration } from './ui.jsx'

// Mijozlar QR menyu orqali yuborgan, hali tasdiqlanmagan buyurtmalar.
// Xodim "Qabul qilish" bossa — stol buyurtmasiga qo'shiladi.
export default function GuestOrders() {
  const [list, setList] = useState([])
  const [busy, setBusy] = useState(null)

  const load = () => API.get('/api/guest-orders?status=new').then(r => setList(r.data)).catch(() => {})
  useEffect(() => {
    load()
    const s = createSocket()
    s.on('guestOrder', g => {
      setList(p => (p.some(x => x._id === g._id) ? p : [g, ...p]))
      try { new Audio(getNewOrderSoundUrl(API_URL)).play().catch(() => {}) } catch {}
      toast(`Mijoz buyurtmasi — Stol ${g.tableNumber}`, { duration: 5000 })
    })
    s.on('guestOrderHandled', ({ _id }) => setList(p => p.filter(x => x._id !== _id)))
    s.on('syncApplied', ({ colls }) => { if (colls.includes('guestorders')) load() })
    const t = setInterval(load, 60000)
    return () => { s.disconnect(); clearInterval(t) }
  }, [])

  const act = async (g, what) => {
    setBusy(g._id)
    try {
      await API.post(`/api/guest-orders/${g._id}/${what}`)
      setList(p => p.filter(x => x._id !== g._id))
      toast.success(what === 'accept' ? `Stol ${g.tableNumber} — buyurtmaga qo'shildi` : 'Rad etildi')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Xatolik')
      load()
    } finally { setBusy(null) }
  }

  if (!list.length) return null
  return (
    <div className="guest-strip">
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <QrCode size={18}/><b>Mijozlar buyurtmasi</b><span className="label">· tasdiqlang</span>
      </div>
      <div className="guest-grid">
        {list.map(g => {
          const sum = g.items.reduce((s, i) => s + i.price * i.quantity, 0)
          return (
            <div key={g._id} className="card guest-card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <b style={{ fontSize: 18 }}>Stol {g.tableNumber}</b>
                <span className="label">{fmtDuration(minutesSince(g.createdAt))} oldin</span>
              </div>
              <div className="mono" style={{ fontSize: 14, margin: '8px 0' }}>
                {g.items.map((i, k) => (
                  <div key={k} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <span className="truncate"><span className="muted">{i.quantity}×</span> {i.name}</span><span>{money(i.price * i.quantity)}</span>
                  </div>
                ))}
                {g.note && <div style={{ color: 'var(--hl-ink)' }}>— {g.note}</div>}
              </div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="label">Jami</span><b className="mono">{money(sum)}</b>
              </div>
              <div className="ocard-actions">
                <button className="btn btn-ghost btn-lg btn-icon" title="Rad etish" aria-label="Rad etish" onClick={() => act(g, 'reject')} disabled={busy === g._id}><X size={20}/></button>
                <button className="btn btn-primary btn-lg" onClick={() => act(g, 'accept')} disabled={busy === g._id}><Check size={20}/> Qabul qilish</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

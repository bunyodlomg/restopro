import React, { useEffect, useState } from 'react'
import { RefreshCw, Phone, CalendarClock, X } from 'lucide-react'
import API from '../api/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import AuthFrame from './auth/AuthFrame.jsx'

const fmt = s => (s ? new Date(s).toLocaleDateString('ru-RU') : '—')

const BLOCKED_TEXT = {
  suspended: ["Obuna to'xtatilgan", "Obuna sotuvchi tomonidan to'xtatildi. Barcha ma'lumotlaringiz saqlangan — to'lovdan keyin tizim avtomatik ochiladi."],
  expired:   ["Obuna muddati tugagan", "Oylik to'lov muddati va qo'shimcha muhlat o'tdi. Ma'lumotlaringiz saqlangan — to'lovdan keyin tizim avtomatik ochiladi."],
  stale:     ["Litsenziyani tekshirib bo'lmadi", "Tizim uzoq vaqt litsenziya serveri bilan bog'lanmadi. Internetga ulang va «Qayta tekshirish» tugmasini bosing."],
  missing:   ["Litsenziya faollashtirilmagan", "Litsenziya hali tekshirilmadi. Internetga ulanganini tekshiring va «Qayta tekshirish» tugmasini bosing."],
  nokey:     ["Litsenziya kaliti kiritilmagan", "Sotuvchidan olingan litsenziya kalitini sozlamalarga kiriting (kassada: tray belgisi → Sozlamalar)."],
}

function Blocked({ lic, onRetry, busy }) {
  const [title, text] = BLOCKED_TEXT[lic.state] || BLOCKED_TEXT.missing
  return (
    <AuthFrame>
      <span className="tag tag-soft" style={{ marginBottom: 14 }}>Tizim bloklangan</span>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', margin: '0 0 10px' }}>{title}</h1>
      <p className="muted" style={{ fontSize: 16, margin: '0 0 22px' }}>{text}</p>
      <div className="card card-pad col" style={{ gap: 10, marginBottom: 20 }}>
        {lic.customer && <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">Mijoz</span><b>{lic.customer}</b></div>}
        {lic.paidUntil && <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">To'langan sana</span><b className="mono">{fmt(lic.paidUntil)}</b></div>}
        {lic.contact && <div className="row" style={{ justifyContent: 'space-between' }}><span className="label">To'lov uchun</span><b className="mono">{lic.contact}</b></div>}
        {lic.lastError && <div className="hint">{lic.lastError}</div>}
      </div>
      <button className="btn btn-primary btn-xl btn-block" onClick={onRetry} disabled={busy}>
        {busy ? <span className="spinner-sm"/> : <RefreshCw size={20}/>} Qayta tekshirish
      </button>
    </AuthFrame>
  )
}

function Banner({ lic, onClose }) {
  const grace = lic.state === 'grace'
  return (
    <div className={`lic-banner ${grace ? 'red' : ''}`}>
      <CalendarClock size={19}/>
      <span>
        {grace
          ? `Obuna muddati o'tdi. ${lic.graceDaysLeft} kundan keyin tizim to'xtaydi.`
          : `Obuna ${lic.daysLeft} kundan keyin tugaydi (${fmt(lic.paidUntil)}).`}
        {lic.contact && <> To'lov uchun: <b className="mono">{lic.contact}</b></>}
      </span>
      {lic.contact && <a className="btn btn-sm hide-mobile" href={`tel:${lic.contact.replace(/[^\d+]/g, '')}`}><Phone size={16}/> Qo'ng'iroq</a>}
      <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Yopish" style={{ color: 'inherit', marginLeft: lic.contact ? 0 : 'auto' }}><X size={18}/></button>
    </div>
  )
}

// Butun ilovani o'raydi: bloklangan bo'lsa — to'lov ekrani, tugayotgan bo'lsa — adminlarga ogohlantirish
export default function LicenseGate({ children }) {
  const [lic, setLic] = useState(null)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)
  const { isAdmin } = useAuth()

  const load = () => API.get('/api/license/status').then(r => setLic(r.data)).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 5 * 60000)
    const onBlocked = e => e.detail && setLic(e.detail)
    window.addEventListener('rp-license', onBlocked)
    return () => { clearInterval(t); window.removeEventListener('rp-license', onBlocked) }
  }, [])

  const retry = async () => {
    setBusy(true)
    try {
      const { data } = await API.post('/api/license/refresh')
      setLic(data)
      if (!data.blocked) window.location.reload()
    } catch {}
    finally { setBusy(false) }
  }

  if (lic?.blocked) return <Blocked lic={lic} onRetry={retry} busy={busy}/>
  const warn = isAdmin && !hidden && (lic?.state === 'warning' || lic?.state === 'grace')
  return <>{warn && <Banner lic={lic} onClose={() => setHidden(true)}/>}{children}</>
}

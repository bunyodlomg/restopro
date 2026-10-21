import React from 'react'
import { Download, RefreshCw, RotateCcw } from 'lucide-react'
import { useAppUpdate } from '../UpdateBanner.jsx'

// Kassa / ofitsant ilovasi versiyasi va yangilanishi — Sozlamalar va Profil oynasida.
// Oddiy brauzerda (rpNative yo'q) hech narsa ko'rsatmaydi.
export default function AppUpdateCard({ style }) {
  const { st: upd, api } = useAppUpdate()
  if (!api) return null
  const status = upd?.status || 'idle'
  const TEXT = {
    checking: 'Tekshirilmoqda…',
    latest: "Eng so'nggi versiya o'rnatilgan",
    downloading: `Yangi versiya ${upd?.version || ''} yuklanmoqda — ${upd?.progress || 0}%`,
    ready: `Yangi versiya ${upd?.version} tayyor`,
    installing: "O'rnatilmoqda — dastur yopilib, qayta ochiladi…",
    error: "Tekshirib bo'lmadi",
    disabled: "Avtomatik yangilanish o'chiq",
    idle: '',
  }
  const busy = ['checking', 'downloading', 'installing', 'disabled'].includes(status)
  // Oddiy o'rnatish o'tmagan yoki xato — to'liq qayta o'rnatish taklif qilinadi
  const offerReinstall = api.reinstall && (upd?.lastFailed || status === 'error') && status !== 'installing'

  return (
    <div className="card card-pad col" style={{ gap: 12, ...style }}>
      <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <b>Dastur versiyasi <span className="mono">{upd?.current}</span></b>
          <div className="hint">{TEXT[status] || ''}</div>
        </div>
        {status === 'ready'
          ? <button className="btn btn-primary btn-lg" onClick={() => api.install()}><Download size={20}/> Hozir yangilash</button>
          : <button className="btn btn-soft btn-lg" disabled={busy} onClick={() => api.check()}><RefreshCw size={20}/> Tekshirish</button>}
      </div>
      {status === 'downloading' && (
        <div style={{ height: 8, borderRadius: 8, background: 'var(--rule)', overflow: 'hidden' }}>
          <div style={{ width: `${upd?.progress || 0}%`, height: '100%', background: 'var(--accent)', transition: 'width .3s' }}/>
        </div>
      )}
      {upd?.lastFailed && <div className="alert">Oldingi yangilanish ({upd.lastFailed}) o'rnatilmadi. «Qayta o'rnatish» oxirgi versiyani to'liq o'rnatadi.</div>}
      {status === 'error' && upd?.error && <div className="hint mono" style={{ wordBreak: 'break-word' }}>{upd.error.slice(0, 200)}</div>}
      {offerReinstall && (
        <button className="btn btn-dark btn-lg" onClick={() => api.reinstall()}>
          <RotateCcw size={20}/> Qayta o'rnatish (oxirgi versiya)
        </button>
      )}
    </div>
  )
}

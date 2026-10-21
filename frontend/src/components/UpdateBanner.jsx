import React, { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { createSocket } from '../api/socket.js'

// Kassa / ofitsant terminali ilovasida yangi versiya yuklab olinganda chiqadi.
// Oddiy brauzerda (rpNative yo'q) hech narsa ko'rsatmaydi.
export function useAppUpdate() {
  const api = window.rpNative?.update
  const [st, setSt] = useState(null)
  useEffect(() => {
    if (!api) return
    api.get().then(setSt).catch(() => {})
    return api.onChange(setSt)
  }, [])
  return { st, api }
}

export default function UpdateBanner() {
  const { st, api } = useAppUpdate()
  const { user, isAdmin } = useAuth()
  const [later, setLater] = useState(false)
  const [count, setCount] = useState(null)
  const terminal = !!window.rpNative?.terminal

  // Sotuvchi «ilovalarni hozir yangilash» buyrug'ini berdi — 3 soniya ichida tasodifiy vaqtda tekshiramiz
  // (hamma ekran bir paytda so'ramasin)
  useEffect(() => {
    if (!api || !user) return
    const s = createSocket()
    s.on('appUpdateCheck', () => setTimeout(() => api.check().catch(() => {}), Math.random() * 3000))
    return () => s.disconnect()
  }, [!!api, user?._id])

  // Ofitsant terminali: hech kim kirmagan (PIN ekrani) bo'lsa 30 soniyadan keyin o'zi yangilanadi
  useEffect(() => {
    if (!terminal || user || st?.status !== 'ready') { setCount(null); return }
    let n = 30
    setCount(n)
    const t = setInterval(() => { n -= 1; setCount(n); if (n <= 0) { clearInterval(t); api.install() } }, 1000)
    return () => clearInterval(t)
  }, [terminal, user?._id, st?.status])

  if (!api || st?.status !== 'ready' && st?.status !== 'installing') return null
  if (st.status === 'installing') return <div className="lic-banner"><span className="spinner-sm"/> Yangilanish o'rnatilmoqda — dastur qayta ochiladi…</div>
  if (later || (!terminal && !isAdmin && user)) return null

  return (
    <div className="lic-banner upd">
      <Download size={19}/>
      <span>
        Yangi versiya <b className="mono">{st.version}</b> tayyor.
        {count != null ? ` ${count} soniyadan keyin o'rnatiladi.` : terminal ? '' : ' Dastur 1 daqiqaga yopilib qayta ochiladi.'}
      </span>
      <button className="btn btn-sm btn-dark" onClick={() => api.install()}>Hozir yangilash</button>
      {count == null && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setLater(true)} aria-label="Keyinroq" title="Keyinroq (yopilganda o'rnatiladi)"><X size={18}/></button>}
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'

// Kassa (offline) rejimida internet holati. Cloud serverda sync o'chiq — ko'rinmaydi.
// Qora panellarda (topbar / rail) ishlatiladi.
export default function SyncBadge({ compact = false }) {
  const [st, setSt] = useState(null)

  useEffect(() => {
    let alive = true
    const load = () => API.get('/api/sync/status').then(({ data }) => alive && setSt(data)).catch(() => {})
    load()
    const timer = setInterval(load, 10000)
    const s = createSocket()
    s.on('syncStatus', data => alive && setSt(data))
    return () => { alive = false; clearInterval(timer); s.disconnect() }
  }, [])

  if (!st?.enabled) return null
  const last = st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '—'
  const title = st.online
    ? `Internet bor. Oxirgi sinxronlash: ${last}`
    : `Internet yo'q — tizim lokal ishlayapti. Ma'lumotlar ulanish tiklanganda yuboriladi. Oxirgi sinxronlash: ${last}`
  return (
    <span className={`sync ${st.online ? 'on' : 'off'}`} title={title}>
      <i/>{!compact && (st.online ? 'ONLINE' : 'OFFLINE')}{st.pending > 0 && ` · ${st.pending}`}
    </span>
  )
}

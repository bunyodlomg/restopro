import React, { useEffect, useState } from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'

// Kassa (offline) rejimida internet holati: Online / Offline + yuborilmagan o'zgarishlar.
// Cloud serverda sync o'chiq — badge ko'rinmaydi.
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

  const online  = st.online
  const color   = online ? '#22C55E' : '#F59E0B'
  const Icon    = online ? (st.pending > 0 ? RefreshCw : Cloud) : CloudOff
  const label   = online ? 'Online' : 'Offline'
  const last    = st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }) : '—'
  const title   = online
    ? `Internet bor. Oxirgi sinxronlash: ${last}`
    : `Internet yo'q — tizim lokal ishlayapti. Ma'lumotlar ulanish tiklanganda yuboriladi. Oxirgi sinxronlash: ${last}`

  return (
    <div title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: compact ? '0.3rem 0.55rem' : '0.35rem 0.7rem', borderRadius: 999,
      background: `${color}1A`, border: `1px solid ${color}55`,
      color, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      <Icon size={13}/>
      {!compact && label}
      {st.pending > 0 && <span style={{ opacity: 0.85 }}>· {st.pending}</span>}
    </div>
  )
}

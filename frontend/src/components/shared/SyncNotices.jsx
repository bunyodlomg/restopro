import React, { useEffect, useState } from 'react'
import { GitMerge } from 'lucide-react'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'

// Sync o'zi hal qilgan ziddiyatlar (ikki joyda bir xil login / stol raqami) — adminga xabar.
// Kassa va cloud'da bir xil: biri «Tushunarli» desa, ikkinchisida ham yo'qoladi.
export default function SyncNotices({ raised }) {
  const [list, setList] = useState([])

  useEffect(() => {
    let alive = true
    const load = () => API.get('/api/sync-notices').then(({ data }) => alive && setList(data)).catch(() => {})
    load()
    const s = createSocket()
    s.on('syncApplied', ({ colls = [] } = {}) => { if (colls.includes('syncnotices')) load() })
    return () => { alive = false; s.disconnect() }
  }, [])

  if (!list.length) return null
  const done = () => { setList([]); API.post('/api/sync-notices/read').catch(() => {}) }
  return (
    <div className="lic-banner upd" style={raised ? { transform: 'translate(-50%, -64px)' } : undefined}>
      <GitMerge size={19}/>
      <span>
        {list.length === 1 ? list[0].text : <>
          Sinxronlashda {list.length} ta yozuv avtomatik tuzatildi:
          {list.slice(0, 3).map(n => <div key={n._id} style={{ fontWeight: 500, fontSize: 13.5 }}>• {n.text}</div>)}
        </>}
      </span>
      <button className="btn btn-sm" onClick={done}>Tushunarli</button>
    </div>
  )
}

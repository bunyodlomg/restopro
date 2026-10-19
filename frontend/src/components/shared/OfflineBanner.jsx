import React, { useState } from 'react'
import { WifiOff, UploadCloud, RefreshCw } from 'lucide-react'
import { useOnline } from '../../hooks/useOnline.js'
import { useQueueCount } from '../../hooks/useQueueCount.js'
import { syncQueue } from '../../utils/syncEngine.js'

// Tarmoq holati va navbatdagi buyurtmalarni ko'rsatuvchi global banner.
// - Offline bo'lsa: qizg'ish ogohlantirish
// - Online, lekin navbatda buyurtma bo'lsa: yuborilmoqda + qo'lda sinxron tugmasi
export default function OfflineBanner() {
  const online = useOnline()
  const pending = useQueueCount()
  const [syncing, setSyncing] = useState(false)

  if (online && pending === 0) return null

  const handleSync = async () => {
    setSyncing(true)
    try { await syncQueue() } finally { setSyncing(false) }
  }

  const offline = !online
  const bg = offline ? '#B91C1C' : '#0F766E'

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: bg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '7px 14px',
        fontFamily: 'DM Sans, sans-serif', fontSize: '0.82rem', fontWeight: 600,
        boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
      }}
    >
      {offline ? (
        <>
          <WifiOff size={16} />
          <span>Internet yo'q — offline rejimdasiz.</span>
          {pending > 0 && (
            <span style={{ opacity: 0.9 }}>
              {pending} ta buyurtma navbatda kutmoqda.
            </span>
          )}
        </>
      ) : (
        <>
          <UploadCloud size={16} />
          <span>{pending} ta buyurtma yuborilmoqda…</span>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              border: 'none', borderRadius: 8, padding: '3px 10px',
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} className={syncing ? 'spin' : ''} />
            {syncing ? 'Yuborilmoqda' : 'Hozir yuborish'}
          </button>
        </>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import { Check, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { fileUrl } from '../ui.jsx'

const isImg = v => typeof v === 'string' && (v.startsWith('/') || v.startsWith('http'))

// Kassa va ofitsant ilovalari ikonkasi (ish stoli yorlig'i, vazifalar paneli, oyna).
// Darhol saqlanadi — hamma kassa va terminallar o'zi qo'llaydi.
export default function AppIconPicker() {
  const { settings, refresh } = useSettings()
  const [busy, setBusy] = useState(false)
  const value = settings.appIcon || ''
  const hasLogo = isImg(settings.brandLogo)

  const save = async (v, file) => {
    setBusy(true)
    try {
      const fd = new FormData()
      if (file) fd.append('appIcon', file)
      else fd.append('appIcon', v)
      await API.put('/api/settings', fd)
      await refresh()
      toast.success(window.rpNative?.setIcon ? "Ikonka o'zgardi" : "Saqlandi — kassa va terminallarda ikonka o'zgaradi")
    } catch (err) { toast.error(err.response?.data?.message || "Saqlab bo'lmadi") }
    finally { setBusy(false) }
  }
  const pick = e => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast.error("Rasm 2 MB dan kichik bo'lsin")
    save(null, file)
  }

  const custom = isImg(value) ? value : ''
  const opts = [
    { v: '', label: 'Standart', img: '/app-icon.png' },
    hasLogo && { v: 'logo', label: 'Restoran logotipi', img: fileUrl(settings.brandLogo) },
    custom && { v: custom, label: 'Yuklangan rasm', img: fileUrl(custom) },
  ].filter(Boolean)

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 12 }}>
        {opts.map(o => {
          const on = value === o.v
          return (
            <button key={o.label} type="button" disabled={busy} onClick={() => !on && save(o.v)} className="card col"
              style={{ padding: 12, gap: 8, alignItems: 'center', width: 128, boxShadow: on ? '0 0 0 3px var(--accent)' : '0 0 0 1px var(--rule)' }}>
              <img src={o.img} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.visibility = 'hidden' }}/>
              <span className="row" style={{ gap: 6, fontWeight: 600, fontSize: 13.5 }}>{on && <Check size={15} strokeWidth={3}/>}{o.label}</span>
            </button>
          )
        })}
        <label className="card col" style={{ padding: 12, gap: 8, alignItems: 'center', justifyContent: 'center', width: 128, cursor: 'pointer', boxShadow: '0 0 0 1px var(--rule)' }}>
          <Upload size={26}/>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{busy ? 'Yuklanmoqda…' : 'Rasm yuklash'}</span>
          <input type="file" accept="image/png,image/jpeg" onChange={pick} hidden disabled={busy}/>
        </label>
      </div>
      <span className="hint">
        Ish stoli yorlig'i, vazifalar paneli va oyna ikonkasi. Kvadrat PNG, kamida 256×256. Hamma kassa va ofitsant
        terminallarida o'zi almashadi.
      </span>
    </div>
  )
}

import React from 'react'
import { useLocation } from 'react-router-dom'
import { API_URL } from '../config.js'
import { useSettings } from '../context/SettingsContext.jsx'

// ── Formatlash ─────────────────────────────────────────────
export const money = n => (Math.round(Number(n) || 0)).toLocaleString('ru-RU').replace(/ /g, ' ')
export const initials = (name = '') => {
  const letters = String(name).replace(/[^A-Za-zА-Яа-яЁёЎўҚқҒғҲҳ' ]/g, '').trim()
  const parts = letters.split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].replace(/'/g, '').slice(0, 2).replace(/^./, c => c.toUpperCase())
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
export const fileUrl = p => (!p ? '' : p.startsWith('http') ? p : `${API_URL}${p}`)
export const minutesSince = d => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000))
export const orderTotal = o => !o ? 0
  : (o.items || []).reduce((s, i) => s + i.price * i.quantity, 0)
    + (o.extras || []).reduce((s, e) => s + (e.extraFee || 0), 0)
    + (o.serviceFee || 0)
export const itemCount = o => (o?.items || []).reduce((s, i) => s + i.quantity, 0)
export const fmtDuration = m => (m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m} daq`)

// Kassa (buyurtma olish) ekranlari qayerda: admin menyusi ichida yoki ofitsant panelida
export const usePosBase = () => (useLocation().pathname.startsWith('/admin') ? '/admin/kassa' : '/waiter')

const hhmm = d => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
export { hhmm }

// ── Brend belgisi: yuklangan logo yoki nomning bosh harfi ──
export function BrandMark({ size = 42, radius }) {
  const { settings } = useSettings()
  const logo = settings.brandLogo || ''
  const isImage = logo.startsWith('/') || logo.startsWith('http')
  const name = settings.brandName || 'RestoPro'
  return (
    <span className="logo-mark" style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.29), fontSize: Math.round(size * 0.45) }}>
      {isImage ? <img src={fileUrl(logo)} alt={name}/> : name.replace(/[^A-Za-z]/g, '')[0]?.toUpperCase() || 'R'}
    </span>
  )
}

export function Loading({ pad = 72 }) {
  return <div className="center-fill" style={{ padding: pad }}><div className="spinner"/></div>
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={30} strokeWidth={1.6}/></div>}
      {title && <div className="empty-title">{title}</div>}
      {text && <div className="empty-text">{text}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}

export function Field({ label, required, hint, children, style }) {
  return (
    <label className="field" style={style}>
      {label && <span className="label">{label}{required && <span className="req">*</span>}</span>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

export function Switch({ checked, onChange, label, hint }) {
  const sw = (
    <span className="switch">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)}/>
      <span/>
    </span>
  )
  if (!label) return sw
  return (
    <label className="row" style={{ justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}>
      <span>
        <span style={{ fontWeight: 600, display: 'block' }}>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </span>
      {sw}
    </label>
  )
}

// Segment: [{ k, l, n? , icon? }]
export function Seg({ items, value, onChange, style }) {
  return (
    <div className="seg" style={style}>
      {items.map(({ k, l, n, icon: Icon }) => (
        <button key={k} type="button" className={`seg-item ${value === k ? 'cur' : ''}`} onClick={() => onChange(k)}>
          {Icon && <Icon size={17}/>}{l}{n !== undefined && <sup>{n}</sup>}
        </button>
      ))}
    </div>
  )
}

export function PageHead({ title, sub, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="label page-sub">{sub}</div>}
      </div>
      {actions && <div className="row wrap" style={{ gap: 10 }}>{actions}</div>}
    </div>
  )
}

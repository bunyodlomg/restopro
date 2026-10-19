import React, { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, maxWidth = 520, footer }) {
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-soft btn-icon" onClick={onClose} aria-label="Yopish"><X size={20}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ModalField({ label, required, children, hint }) {
  return (
    <label className="field">
      <span className="label">{label}{required && <span className="req">*</span>}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

export function ModalActions({ onClose, onConfirm, confirmLabel = 'Saqlash', loading, danger }) {
  return (
    <div className="row" style={{ gap: 10, margin: '8px 0 14px' }}>
      <button type="button" onClick={onClose} className="btn btn-lg" style={{ flex: 1 }}>Bekor qilish</button>
      <button type="button" onClick={onConfirm} disabled={loading}
        className={`btn btn-lg ${danger ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1.4 }}>
        {loading ? <><span className="spinner-sm"/> Saqlanmoqda</> : confirmLabel}
      </button>
    </div>
  )
}

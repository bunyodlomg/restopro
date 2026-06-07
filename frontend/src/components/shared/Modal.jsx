import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function Modal({ open, onClose, title, children, maxWidth = 480 }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.target === e.currentTarget && onClose()}
          style={{ animation: 'none' }}
        >
          <motion.div
            className="modal-box"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 320, damping: 25 }}
            style={{ maxWidth, animation: 'none' }}
          >
            <div style={{ height:3, background:'linear-gradient(90deg,var(--brand),var(--brand-lt))', borderRadius:'var(--r-2xl) var(--r-2xl) 0 0' }}/>
            <div style={{ padding:'1.5rem' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
                <h3 style={{ fontFamily:'Sora,sans-serif', fontWeight:700, fontSize:'1.05rem', color:'var(--text)' }}>
                  {title}
                </h3>
                <motion.button onClick={onClose}
                  whileHover={{ scale: 1.1, backgroundColor: 'rgba(239,68,68,0.1)' }}
                  whileTap={{ scale: 0.9 }}
                  style={{ width:30, height:30, borderRadius:8, background:'var(--elevated)', border:'1px solid var(--border)', cursor:'pointer', color:'var(--text-3)', display:'flex', alignItems:'center', justifyContent:'center' }}
                ><X size={14}/></motion.button>
              </div>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ModalField({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom:'1rem' }}>
      <label style={{ display:'block', fontSize:'0.72rem', fontWeight:700, color:'var(--text-3)', marginBottom:6, letterSpacing:'0.06em', textTransform:'uppercase' }}>
        {label}{required && <span style={{ color:'#EF4444', marginLeft:2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize:'0.72rem', color:'var(--text-3)', marginTop:4 }}>{hint}</p>}
    </div>
  )
}

export function ModalActions({ onClose, onConfirm, confirmLabel='Saqlash', loading, danger }) {
  return (
    <div style={{ display:'flex', gap:8, marginTop:'1.25rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
      <button onClick={onClose} className="btn-ghost" style={{ flex:1, justifyContent:'center' }}>Bekor</button>
      <button onClick={onConfirm} disabled={loading}
        className={danger ? 'btn-danger' : 'btn-primary'}
        style={{ flex:1, justifyContent:'center', display:'flex', alignItems:'center', gap:6 }}>
        {loading ? <><span className="spinner-sm"/>&nbsp;Saqlanmoqda...</> : confirmLabel}
      </button>
    </div>
  )
}

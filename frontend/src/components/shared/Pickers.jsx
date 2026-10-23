import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, CalendarDays, Clock, Search } from 'lucide-react'
import DateRangeCalendar from './DateRangeCalendar.jsx'

// ── Brauzerning <select>, <input type=date/time> o'rniga dizaynga mos tanlagichlar ──
// Ochiladigan qism body'ga chiziladi (portal) — modal ichida ham kesilmaydi; ekran pastida yuqoriga ochiladi.

const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
export const fmtDay = iso => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${UZ_MONTHS[m - 1]} ${y}`
}

function Popover({ anchor, open, onClose, width, children }) {
  const ref = useRef()
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const place = () => {
      const r = anchor.current.getBoundingClientRect()
      const h = ref.current?.offsetHeight || 320
      const w = Math.max(width || r.width, r.width)
      const below = window.innerHeight - r.bottom
      const top = below < h + 12 && r.top > below ? r.top - h - 6 : r.bottom + 6
      const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
      setPos({ top, left, width: w })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, width])

  useEffect(() => {
    if (!open) return
    const down = e => { if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose() }
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key, true) }
  }, [open])

  if (!open) return null
  return createPortal(
    <div ref={ref} className="picker-pop" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width, visibility: pos ? 'visible' : 'hidden' }}>
      {children}
    </div>,
    document.body
  )
}

// options: [{ value, label, hint?, group?, disabled? }]
export function Select({ value, onChange, options, placeholder = 'Tanlang', disabled, style, className = '' }) {
  const anchor = useRef()
  const listRef = useRef()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(-1)
  const searchable = options.length > 8
  const cur = options.find(o => String(o.value) === String(value))

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? options.filter(o => `${o.label} ${o.hint || ''} ${o.group || ''}`.toLowerCase().includes(s)) : options
  }, [options, q])

  useEffect(() => {
    if (!open) return
    setQ('')
    setHi(Math.max(0, options.findIndex(o => String(o.value) === String(value))))
  }, [open])
  useEffect(() => { listRef.current?.querySelector('[data-hi="1"]')?.scrollIntoView({ block: 'nearest' }) }, [hi, open])

  const pick = o => { if (o.disabled) return; onChange(o.value); setOpen(false); anchor.current?.focus() }
  const onKey = e => {
    if (!open) { if (['Enter', ' ', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setOpen(true) } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(i => Math.min(shown.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[hi]) pick(shown[hi]) }
    else if (e.key === 'Tab') setOpen(false)
  }

  let lastGroup
  return (
    <>
      <button type="button" ref={anchor} className={`input picker-btn ${open ? 'open' : ''} ${className}`} style={style}
        disabled={disabled} onClick={() => setOpen(o => !o)} onKeyDown={onKey} aria-haspopup="listbox" aria-expanded={open}>
        <span className={`truncate ${cur ? '' : 'muted'}`}>{cur ? cur.label : placeholder}</span>
        <ChevronDown size={19} className="picker-chev"/>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)}>
        {searchable && (
          <div className="input-icon" style={{ padding: 6 }}>
            <Search size={18} style={{ left: 20 }}/>
            <input className="input" autoFocus value={q} placeholder="Qidirish…" onKeyDown={onKey}
              onChange={e => { setQ(e.target.value); setHi(0) }} style={{ minHeight: 42 }}/>
          </div>
        )}
        <div ref={listRef} className="picker-list" role="listbox">
          {shown.length === 0 && <div className="muted" style={{ padding: '12px 14px' }}>Topilmadi</div>}
          {shown.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? (lastGroup = o.group) : null
            return (
              <React.Fragment key={String(o.value)}>
                {head && <div className="picker-group">{head}</div>}
                <button type="button" role="option" aria-selected={String(o.value) === String(value)} data-hi={i === hi ? '1' : '0'}
                  className={`picker-opt ${i === hi ? 'hi' : ''} ${String(o.value) === String(value) ? 'sel' : ''}`}
                  disabled={o.disabled} onMouseEnter={() => setHi(i)} onClick={() => pick(o)}>
                  <span className="truncate">{o.label}{o.hint && <small>{o.hint}</small>}</span>
                  {String(o.value) === String(value) && <Check size={18}/>}
                </button>
              </React.Fragment>
            )
          })}
        </div>
      </Popover>
    </>
  )
}

// value: "YYYY-MM-DD"
export function DateInput({ value, onChange, placeholder = 'Sanani tanlang', style, min }) {
  const anchor = useRef()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" ref={anchor} className={`input picker-btn ${open ? 'open' : ''}`} style={style} onClick={() => setOpen(o => !o)}>
        <CalendarDays size={19} className="picker-ico"/>
        <span className={`truncate ${value ? '' : 'muted'}`} style={{ flex: 1 }}>{value ? fmtDay(value) : placeholder}</span>
        <ChevronDown size={19} className="picker-chev"/>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={324}>
        <div style={{ padding: 14 }}>
          <DateRangeCalendar single start={value} min={min} onChange={d => { onChange(d); setOpen(false) }}/>
        </div>
      </Popover>
    </>
  )
}

// value: "YYYY-MM"
const MONTHS_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
export function MonthInput({ value, onChange, style }) {
  const anchor = useRef()
  const [open, setOpen] = useState(false)
  const [y, m] = (value || '').split('-').map(Number)
  const [year, setYear] = useState(y || new Date().getFullYear())
  useEffect(() => { if (open) setYear(y || new Date().getFullYear()) }, [open])
  const label = y && m ? `${UZ_MONTHS[m - 1][0].toUpperCase()}${UZ_MONTHS[m - 1].slice(1)} ${y}` : 'Oyni tanlang'
  return (
    <>
      <button type="button" ref={anchor} className={`input picker-btn ${open ? 'open' : ''}`} style={style} onClick={() => setOpen(o => !o)}>
        <CalendarDays size={19} className="picker-ico"/>
        <span className={`truncate ${value ? '' : 'muted'}`} style={{ flex: 1 }}>{label}</span>
        <ChevronDown size={19} className="picker-chev"/>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={292}>
        <div style={{ padding: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" className="cal-nav" onClick={() => setYear(v => v - 1)}><ChevronDown size={16} style={{ transform: 'rotate(90deg)' }}/></button>
            <b style={{ fontSize: 16 }}>{year}</b>
            <button type="button" className="cal-nav" onClick={() => setYear(v => v + 1)}><ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
            {MONTHS_SHORT.map((n, i) => {
              const v = `${year}-${String(i + 1).padStart(2, '0')}`
              return (
                <button key={n} type="button" className={`picker-opt ${v === value ? 'sel' : ''}`}
                  style={{ justifyContent: 'center', ...(v === value ? { background: 'var(--sel)', color: 'var(--sel-ink)' } : {}) }}
                  onClick={() => { onChange(v); setOpen(false) }}>{n}</button>
              )
            })}
          </div>
        </div>
      </Popover>
    </>
  )
}

// value: "HH:MM" — 15 daqiqalik qadamlar + hozirgi qiymat
export function TimeInput({ value, onChange, step = 15, style }) {
  const slots = useMemo(() => {
    const s = []
    for (let m = 0; m < 1440; m += step) s.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
    if (value && !s.includes(value)) s.push(value)
    return s.sort()
  }, [step, value])
  const anchor = useRef()
  const listRef = useRef()
  const [open, setOpen] = useState(false)
  useEffect(() => { if (open) setTimeout(() => listRef.current?.querySelector('.sel')?.scrollIntoView({ block: 'center' }), 0) }, [open])
  return (
    <>
      <button type="button" ref={anchor} className={`input picker-btn mono ${open ? 'open' : ''}`} style={style} onClick={() => setOpen(o => !o)}>
        <Clock size={19} className="picker-ico"/>
        <span style={{ flex: 1 }} className={value ? '' : 'muted'}>{value || '--:--'}</span>
        <ChevronDown size={19} className="picker-chev"/>
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={220}>
        <div ref={listRef} className="picker-list picker-times">
          {slots.map(t => (
            <button key={t} type="button" className={`picker-opt mono ${t === value ? 'sel' : ''}`} onClick={() => { onChange(t); setOpen(false) }}>{t}</button>
          ))}
        </div>
      </Popover>
    </>
  )
}

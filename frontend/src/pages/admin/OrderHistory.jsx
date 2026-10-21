import React, { useState, useEffect, useRef } from 'react'
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, History, Calendar, Printer } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSections } from '../../utils/sections.js'
import API from '../../api/api.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import DateRangeCalendar from '../../components/shared/DateRangeCalendar.jsx'
import { OrderNum } from '../waiter/MyOrders.jsx'
import { printReceipt } from './Orders.jsx'
import { PageHead, Loading, Empty, money, orderTotal, itemCount } from '../../components/ui.jsx'

const LIMIT = 50
// Date → "YYYY-MM-DD" (lokal vaqt)
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// "15 May" — uz-UZ locale oy nomini to'g'ri bermaydi
const UZ_MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
const fmtDate = s => {
  if (!s) return '…'
  const dt = new Date(s + 'T00:00')
  return isNaN(dt) ? '…' : `${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]}`
}
const hhmm = d => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })

export default function OrderHistory() {
  const { label: sectionLabel } = useSections()
  const today = iso(new Date())
  const [orders, setOrders] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [exp, setExp] = useState(null)
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef()
  const { settings } = useSettings()

  useEffect(() => {
    const h = e => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false) }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [])

  const load = async (p = 1, s = start, e = end) => {
    setLoading(true)
    try {
      const { data } = await API.get(`/api/orders?status=closed&startDate=${s}&endDate=${e}&page=${p}&limit=${LIMIT}`)
      setOrders(data.orders || [])
      setTotal(data.total || 0)
      setPage(data.page || 1)
      setPages(data.pages || 1)
      setExp(null)
    } catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => { load(1) }, [])

  const applyRange = (s, e) => { setStart(s); setEnd(e); load(1, s, e); setShowPicker(false) }
  const applyCustom = () => { const e = end || start; setEnd(e); load(1, start, e); setShowPicker(false) }
  const presets = [
    { label: 'Bugun', get: () => { const t = iso(new Date()); return [t, t] } },
    { label: 'Kecha', get: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = iso(d); return [t, t] } },
    { label: '7 kun', get: () => { const d = new Date(); d.setDate(d.getDate() - 6); return [iso(d), iso(new Date())] } },
    { label: '30 kun', get: () => { const d = new Date(); d.setDate(d.getDate() - 29); return [iso(d), iso(new Date())] } },
  ]

  const s = q.trim().toLowerCase()
  const filtered = orders.filter(o => !s
    || o.tableNumber?.toString().includes(s)
    || o.category?.toLowerCase().includes(s)
    || o.waiterName?.toLowerCase().includes(s))
  const pageSum = orders.reduce((sum, o) => sum + orderTotal(o), 0)
  const range = start === end ? fmtDate(start) : `${fmtDate(start)} — ${fmtDate(end)}`

  return (
    <div className="page">
      <PageHead title="Buyurtmalar tarixi" sub={`${range} · ${total} ta yopilgan${pages === 1 ? ` · ${money(pageSum)} so'm` : ''}`}
        actions={<>
          <div className="input-icon" style={{ width: 240 }}>
            <Search size={19}/>
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Stol, ofitsant…"/>
          </div>
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button className="btn btn-lg" onClick={() => setShowPicker(p => !p)}>
              <Calendar size={20}/> {range}
            </button>
            {showPicker && (
              <div className="popover" style={{ width: 324 }}>
                <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
                  {presets.map(p => {
                    const [ps, pe] = p.get()
                    const active = ps === start && pe === end
                    return (
                      <button key={p.label} className={`btn btn-sm ${active ? 'btn-dark' : 'btn-soft'}`} onClick={() => applyRange(ps, pe)}>
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                <DateRangeCalendar start={start} end={end} onChange={(a, b) => { setStart(a); setEnd(b) }}/>
                <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={!start} onClick={applyCustom}>
                  Ko'rsatish
                </button>
              </div>
            )}
          </div>
        </>}/>

      {loading ? <Loading/> : orders.length === 0 ? (
        <Empty icon={History} title="Yopilgan buyurtma yo'q" text="Tanlangan sanalar oralig'ida yopilgan buyurtma topilmadi."/>
      ) : filtered.length === 0 ? (
        <Empty icon={Search} title="Topilmadi" text={`«${q}» bo'yicha buyurtma yo'q`}/>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {filtered.map(o => {
            const isExp = exp === o._id
            const when = o.closedAt || o.createdAt
            return (
              <div key={o._id} className="card" style={{ overflow: 'hidden' }}>
                <button className="row" onClick={() => setExp(isExp ? null : o._id)}
                  style={{ width: '100%', padding: '12px 18px', gap: 14, textAlign: 'left' }}>
                  <OrderNum order={o}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }} className="truncate">
                      {sectionLabel(o.category)}{o.waiterName ? ` · ${o.waiterName}` : ''}
                    </div>
                    <div className="label">{fmtDate(iso(new Date(when)))} · {hhmm(o.createdAt)}–{hhmm(when)} · {itemCount(o)} ta</div>
                  </div>
                  <div className="mono" style={{ fontWeight: 600, fontSize: 19, letterSpacing: '-.03em' }}>{money(orderTotal(o))}</div>
                  <span className="muted">{isExp ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</span>
                </button>
                {isExp && (
                  <div style={{ borderTop: '1.5px dashed var(--rule-2)', padding: '12px 18px 16px' }}>
                    <div className="mono" style={{ fontSize: 14, lineHeight: 1.6 }}>
                      {(o.items || []).map((it, j) => (
                        <div key={j} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                          <span className="truncate"><span className="muted">{it.quantity}×</span> {it.name}</span>
                          <span>{money(it.price * it.quantity)}</span>
                        </div>
                      ))}
                      {(o.returns || []).map((r, j) => (
                        <div key={'r' + j} className="row muted" style={{ justifyContent: 'space-between', gap: 10 }}>
                          <span className="truncate"><s>{r.quantity}× {r.name}</s> qaytarildi{r.reason ? ` — ${r.reason}` : ''}{r.by ? ` (${r.by})` : ''}</span>
                          <span>−{money(r.price * r.quantity)}</span>
                        </div>
                      ))}
                      {(o.extras || []).map((e, j) => (
                        <div key={'e' + j} className="row muted" style={{ justifyContent: 'space-between', gap: 10 }}>
                          <span className="truncate">+ {e.comment || "Qo'shimcha"}</span><span>{money(e.extraFee)}</span>
                        </div>
                      ))}
                      {o.serviceFee > 0 && (
                        <div className="row muted" style={{ justifyContent: 'space-between' }}><span>Xizmat haqi</span><span>{money(o.serviceFee)}</span></div>
                      )}
                    </div>
                    <button className="btn btn-soft btn-lg" style={{ marginTop: 12 }} onClick={() => printReceipt(o, settings)}>
                      <Printer size={20}/> Chekni qayta chiqarish
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 16, marginTop: 20 }}>
          <button className="btn btn-soft btn-lg" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
            <ChevronLeft size={20}/> Oldingi
          </button>
          <span className="mono">{page} / {pages}</span>
          <button className="btn btn-soft btn-lg" disabled={page >= pages || loading} onClick={() => load(page + 1)}>
            Keyingi <ChevronRight size={20}/>
          </button>
        </div>
      )}
    </div>
  )
}

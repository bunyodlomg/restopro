import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ArrowUpRight, ArrowDownRight, Package2, Grid3X3, UtensilsCrossed } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import DateRangeCalendar from '../../components/shared/DateRangeCalendar.jsx'
import { Seg, Loading, money, initials, orderTotal, minutesSince, fmtDuration } from '../../components/ui.jsx'
import { usePlace } from '../../utils/sections.js'

// Date → "YYYY-MM-DD" (lokal vaqt)
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const UZ_MONTHS = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek']
const fmtDate = s => {
  const dt = new Date(s + 'T00:00')
  return isNaN(dt) ? '…' : `${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]}`
}
const compact = n => {
  const a = Math.abs(n || 0)
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M'
  if (a >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(n || 0)
}

const PRESETS = [
  { k: 'today', l: 'Bugun', get: () => [iso(new Date()), iso(new Date())] },
  { k: 'week', l: '7 kun', get: () => [daysAgo(6), iso(new Date())] },
  { k: 'month', l: '30 kun', get: () => [daysAgo(29), iso(new Date())] },
  { k: 'cur', l: 'Bu oy', get: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)] } },
]

function Change({ v, suffix }) {
  if (typeof v !== 'number') return null
  const up = v >= 0
  return (
    <span className={up ? 'up' : 'down'} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {up ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}{v > 0 ? '+' : ''}{v}%{suffix}
    </span>
  )
}

function Kpi({ label, value, unit, change, foot, hero }) {
  return (
    <div className={`card kpi ${hero ? 'hero' : ''}`}>
      <div className="label">{label}</div>
      <div className="kpi-value">{value}{unit && <small>{unit}</small>}</div>
      <div className="kpi-foot"><Change v={change}/>{foot}</div>
    </div>
  )
}

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tip">
      <div className="label" style={{ marginBottom: 6 }}>{/^\d{4}-/.test(label) ? fmtDate(label) : label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="row" style={{ justifyContent: 'space-between', gap: 14 }}>
          <span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: p.color }}/>{p.name}</span>
          <b>{money(p.value)}</b>
        </div>
      ))}
    </div>
  )
}

function Card({ title, extra, children, className = '' }) {
  return (
    <div className={`card card-pad ${className}`}>
      <div className="card-head"><span className="card-title">{title}</span>{extra && <span className="label">{extra}</span>}</div>
      {children}
    </div>
  )
}

const Mini = ({ icon: Icon, text }) => (
  <div className="center-fill col muted" style={{ padding: '28px 0', gap: 8 }}><Icon size={26} strokeWidth={1.6}/>{text}</div>
)

export default function Dashboard() {
  const place = usePlace()
  const [stats, setStats] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [chart, setChart] = useState([])      // bitta kun tanlansa — grafik oxirgi 14 kunni ko'rsatadi
  const [low, setLow] = useState([])
  const [open, setOpen] = useState([])
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('today')
  const [range, setRange] = useState(PRESETS[0].get())
  const [draft, setDraft] = useState(range)
  const [picker, setPicker] = useState(false)
  const pickRef = useRef()
  const navigate = useNavigate()

  const load = async ([s, e] = range) => {
    setLoading(true)
    try {
      const single = s === e
      const [st, m, ch] = await Promise.all([
        API.get(`/api/orders/stats?startDate=${s}&endDate=${e}`),
        API.get(`/api/orders/monthly?year=${new Date().getFullYear()}`),
        single ? API.get(`/api/orders/stats?startDate=${daysAgo(13)}&endDate=${e}`) : null,
      ])
      setStats(st.data); setMonthly(m.data)
      setChart(single ? ch.data.daily || [] : st.data.daily || [])
    } catch { toast.error("Statistikani yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  const loadLive = () => {
    API.get('/api/ingredients/low').then(r => setLow(r.data)).catch(() => {})
    API.get('/api/orders?status=pending').then(r => setOpen(r.data)).catch(() => {})
  }

  useEffect(() => {
    load(); loadLive()
    const s = createSocket()
    for (const ev of ['newOrder', 'orderUpdated', 'orderClosed', 'stockChanged']) s.on(ev, loadLive)
    s.on('syncApplied', loadLive)
    const h = e => { if (pickRef.current && !pickRef.current.contains(e.target)) setPicker(false) }
    document.addEventListener('pointerdown', h)
    return () => { s.disconnect(); document.removeEventListener('pointerdown', h) }
  }, [])

  const choose = k => {
    const r = PRESETS.find(p => p.k === k).get()
    setPreset(k); setRange(r); load(r)
  }
  const applyCustom = () => {
    if (!draft[1]) return
    setPreset('custom'); setRange(draft); load(draft); setPicker(false)
  }

  const st = stats || {}
  const cmp = st.comparison || {}
  const avg = st.orderCount ? Math.round(st.totalIncome / st.orderCount) : 0
  const margin = st.totalIncome ? Math.round((st.netProfit / st.totalIncome) * 100) : 0
  const openSum = open.reduce((s, o) => s + orderTotal(o), 0)
  const products = st.products || []
  const maxTop = products[0]?.total || 1
  const [s0, e0] = range
  const title = preset === 'today' ? 'Bugun' : s0 === e0 ? fmtDate(s0) : `${fmtDate(s0)} — ${fmtDate(e0)}`
  const now = new Date()
  const dayName = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'][now.getDay()]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          <div className="label page-sub">{now.getDate()} {UZ_MONTHS[now.getMonth()]} · {dayName}</div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Seg value={preset} onChange={choose} items={PRESETS}/>
          <div ref={pickRef} style={{ position: 'relative' }}>
            <button className={`btn btn-lg ${preset === 'custom' ? 'btn-dark' : 'btn-soft'}`} onClick={() => { setDraft(range); setPicker(p => !p) }}>
              <CalendarDays size={20}/> Davr
            </button>
            {picker && (
              <div className="popover">
                <DateRangeCalendar start={draft[0]} end={draft[1]} onChange={(s, e) => setDraft([s, e])}/>
                <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 12 }} disabled={!draft[1]} onClick={applyCustom}>Ko'rsatish</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && !stats ? <Loading/> : <>
        <div className="kpis" style={{ opacity: loading ? .5 : 1 }}>
          <Kpi hero label="Tushum" value={money(st.totalIncome)} unit="so'm" change={cmp.income} foot="oldingi davrga"/>
          <Kpi label="Buyurtmalar" value={st.orderCount || 0} change={cmp.orders} foot={`${st.totalSold || 0} ta taom`}/>
          <Kpi label="O'rtacha chek" value={money(avg)} change={cmp.avgOrder}/>
          <Kpi label="Sof foyda" value={money(st.netProfit)} change={cmp.profit} foot={`marja ${margin}%`}/>
        </div>

        <div className="dash">
          <Card title={s0 === e0 ? 'Tushum va chiqim · 14 kun' : 'Tushum va chiqim'} extra={`chiqim ${compact(st.totalExpense)} · oylik ${compact(st.salaryExpense)} · xarid ${compact(st.purchaseExpense)}`}>
            {!chart.length ? <Mini icon={CalendarDays} text="Bu davrda ma'lumot yo'q"/> : (
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={chart} barGap={3} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--rule)" strokeDasharray="4 5"/>
                    <XAxis dataKey="date" tickFormatter={fmtDate} tickLine={false} axisLine={false}
                      tick={{ fill: 'var(--ink-3)', fontSize: 12, fontFamily: 'IBM Plex Mono' }} minTickGap={16}/>
                    <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48}
                      tick={{ fill: 'var(--ink-3)', fontSize: 12, fontFamily: 'IBM Plex Mono' }}/>
                    <Tooltip content={<ChartTip/>} cursor={{ fill: 'var(--thumb)' }}/>
                    <Bar dataKey="income" name="Tushum" fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={26}/>
                    <Bar dataKey="expense" name="Chiqim" fill="var(--ink-3)" fillOpacity={.35} radius={[5, 5, 0, 0]} maxBarSize={26}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card title="Eng ko'p sotilgan" extra={`${products.length} xil`}>
            {!products.length ? <Mini icon={UtensilsCrossed} text="Hali sotuv yo'q"/> : (
              <div className="lst">
                {products.slice(0, 7).map((p, i) => (
                  <div key={p.name} className="lst-row">
                    <span className="lst-rank">{i + 1}</span>
                    <span className="lst-th">{initials(p.name)}</span>
                    <span className="lst-name truncate">{p.name}
                      <small>{p.quantity} ta</small>
                      <span className="meter" style={{ marginTop: 6, display: 'block' }}><i style={{ width: `${(p.total / maxTop) * 100}%`, background: i ? 'var(--ink-3)' : 'var(--accent)' }}/></span>
                    </span>
                    <span className="lst-val">{money(p.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Ochiq stollar" extra={`${open.length} ta · ${money(openSum)}`}>
            {!open.length ? <Mini icon={Grid3X3} text="Hozir ochiq hisob yo'q"/> : (
              <div className="lst">
                {open.slice(0, 6).map(o => {
                  const m = minutesSince(o.createdAt)
                  return (
                    <button key={o._id} className="lst-row" style={{ textAlign: 'left' }} onClick={() => navigate('/admin/orders')}>
                      <span className="lst-th mono" style={{ background: 'var(--sel)', color: 'var(--sel-ink)' }}>{String(o.tableNumber ?? '').padStart(2, '0')}</span>
                      <span className="lst-name truncate">{place(o)}
                        <small>{o.waiterName} · <span className={m > 60 ? 'late' : ''}>{fmtDuration(m)}</span></small>
                      </span>
                      <span className="lst-val">{money(orderTotal(o))}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Chiqimlar" extra={st.totalIncome ? `tushumning ${Math.round((st.totalExpense || 0) / st.totalIncome * 100)}%` : ''}>
            <div className="row" style={{ alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <b className="mono" style={{ fontSize: 30, letterSpacing: '-.03em' }}>{money(st.totalExpense)}</b>
              <span className="muted">so'm</span>
              {cmp.expense !== undefined && cmp.expense !== 0 && (
                <span className={`chg ${cmp.expense > 0 ? 'down' : 'up'}`} style={{ marginLeft: 'auto' }}>
                  {cmp.expense > 0 ? <ArrowUpRight size={15}/> : <ArrowDownRight size={15}/>}{Math.abs(cmp.expense)}%
                </span>
              )}
            </div>
            {[
              { l: 'Ombor xaridlari', v: st.purchaseExpense, c: 'var(--accent)' },
              { l: 'Oyliklar', v: st.salaryExpense, c: 'var(--ink-3)' },
            ].map(r => (
              <div key={r.l} style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><span>{r.l}</span><b className="mono">{money(r.v)}</b></div>
                <span className="meter" style={{ marginTop: 6, display: 'block' }}><i style={{ width: `${st.totalExpense ? Math.max(2, (r.v || 0) / st.totalExpense * 100) : 0}%`, background: r.c }}/></span>
              </div>
            ))}
            <div className="exp-mini">
              <span>Taomlar tannarxi<small>retsept bo'yicha ombordan sarf{st.totalIncome && st.foodCost ? ` · tushumning ${Math.round(st.foodCost / st.totalIncome * 100)}%` : ''}</small></span>
              <b className="mono">{money(st.foodCost)}</b>
            </div>
            {st.wasteCost > 0 && <div className="exp-mini"><span>Hisobdan chiqarilgan<small>buzilgan, to'kilgan</small></span><b className="mono" style={{ color: 'var(--accent-ink)' }}>{money(st.wasteCost)}</b></div>}
            {(st.recentExpenses || []).length > 0 && (
              <div className="lst" style={{ marginTop: 10 }}>
                {st.recentExpenses.slice(0, 4).map((x, i) => (
                  <button key={i} className="lst-row" style={{ textAlign: 'left' }} onClick={() => navigate(x.kind === 'salary' ? '/admin/salaries' : '/admin/ingredients')}>
                    <span className="lst-th" style={x.kind === 'salary' ? undefined : { background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>{x.kind === 'salary' ? initials(x.title) : <Package2 size={18}/>}</span>
                    <span className="lst-name truncate">{x.title}<small>{x.note} · {fmtDate(String(x.at).slice(0, 10))}</small></span>
                    <span className="lst-val">−{money(x.amount)}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card title="Qarzlar" extra={st.debtCustomers ? `${st.debtCustomers} ta qarzdor` : ''}>
            <button className="row" style={{ alignItems: 'baseline', gap: 8, marginBottom: 12, textAlign: 'left' }} onClick={() => navigate('/admin/debts')}>
              <b className="mono" style={{ fontSize: 30, letterSpacing: '-.03em', color: st.debtTotal ? 'var(--accent-ink)' : undefined }}>{money(st.debtTotal)}</b>
              <span className="muted">so'm jami qarz</span>
            </button>
            <div className="exp-mini"><span>Davrda qarzga berildi</span><b className="mono">{money(st.debtGiven)}</b></div>
            <div className="exp-mini"><span>Davrda qaytarildi</span><b className="mono" style={{ color: st.debtPaid ? 'var(--ok-ink)' : undefined }}>{money(st.debtPaid)}</b></div>
          </Card>

          <Card title="Omborda kam qoldi" extra={low.length ? `${low.length} ta` : ''}>
            {!low.length ? <Mini icon={Package2} text="Hammasi yetarli"/> : (
              <div className="lst">
                {low.slice(0, 6).map(g => {
                  const pct = g.minQty ? Math.max(4, Math.min(100, (g.quantity / g.minQty) * 100)) : 4
                  return (
                    <button key={g._id} className="lst-row" style={{ textAlign: 'left' }} onClick={() => navigate('/admin/ingredients')}>
                      <span className="lst-name truncate">{g.name}
                        <span className="meter" style={{ marginTop: 6, display: 'block' }}><i style={{ width: `${pct}%`, background: pct < 50 ? 'var(--accent)' : 'var(--warn)' }}/></span>
                      </span>
                      <span className="lst-val">{+Number(g.quantity).toFixed(2)} {g.unit}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title={`${now.getFullYear()}-yil, oylar bo'yicha`} className="span-2">
            <div style={{ height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={monthly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--rule)" strokeDasharray="4 5"/>
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 12, fontFamily: 'IBM Plex Mono' }}/>
                  <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--ink-3)', fontSize: 12, fontFamily: 'IBM Plex Mono' }}/>
                  <Tooltip content={<ChartTip/>} cursor={{ fill: 'var(--thumb)' }}/>
                  <Bar dataKey="income" name="Tushum" fill="var(--sel)" radius={[5, 5, 0, 0]} maxBarSize={40}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </>}
    </div>
  )
}

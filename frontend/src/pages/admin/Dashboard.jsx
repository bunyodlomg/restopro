import React, { useState, useEffect, useRef } from 'react'
import {
  Calendar, Filter, ShoppingBag, DollarSign, Wallet, PiggyBank,
  Hash, Trophy, Sparkles, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { AnimatePresence, motion } from 'framer-motion'
import API from '../../api/api.js'
import DateRangeCalendar from '../../components/shared/DateRangeCalendar.jsx'

const INCOME_C  = '#22C55E'
const EXPENSE_C = '#EF4444'

// Date → "YYYY-MM-DD" (lokal vaqt)
const iso = d => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
const compact = n => {
  n = Math.abs(n || 0)
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(n)
}

// Sana → "15 May" (uz-UZ locale "M05" beradi — shuning uchun oy nomini qo'lda yozamiz)
const UZ_MONTHS = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek']
const fmtDate = s => {
  if (!s) return '…'
  const dt = new Date(s + 'T00:00')
  return isNaN(dt) ? '…' : `${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]}`
}

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const lbl = /^\d{4}-\d{2}-\d{2}$/.test(label)
    ? fmtDate(label)
    : label
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.7rem 0.95rem', boxShadow: 'var(--shadow-md)', minWidth: 150 }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: 6, fontWeight: 700 }}>{lbl}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ fontFamily: 'Sora,sans-serif', fontWeight: 700, color: p.color, fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', gap: 14 }}>
          <span>{p.name}</span>
          <span>{(p.value || 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

// Compact KPI tile
function Kpi({ tone, filled, icon, label, value, sub, foot, change, delay = 0 }) {
  const hasChange = typeof change === 'number'
  return (
    <motion.div
      className={`bento b-c4 bento--${tone} ${filled ? 'bento--filled' : 'bento--soft'}`}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 0.68, 0, 1.15] }}
    >
      {filled && <div className="bento-blob" style={{ top: -70, right: -50 }} />}
      <div className="bento-head" style={{ marginBottom: '0.5rem' }}>
        <div className="bento-label">{label}</div>
        <motion.div
          className="bento-icon"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: delay + 0.15, type: 'spring', stiffness: 260, damping: 14 }}
        >
          {icon}
        </motion.div>
      </div>
      <div className="bento-value" style={{ fontSize: 'clamp(1.3rem,2.1vw,1.85rem)' }}>
        {value}{sub && <span className="bento-value-sub">{sub}</span>}
      </div>
      {hasChange && (
        <motion.div
          className={`bento-trend ${change >= 0 ? 'bento-trend--up' : 'bento-trend--down'}`}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: delay + 0.3, duration: 0.3 }}
          style={{ marginTop: 6, alignSelf: 'flex-start' }}
        >
          {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {change > 0 ? '+' : ''}{change}%
        </motion.div>
      )}
      <div className="bento-foot">{foot}</div>
    </motion.div>
  )
}

function EmptyMini({ icon = '📭', text, height = 200 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, height, color: 'var(--text-3)', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', opacity: 0.7 }}>{icon}</div>
      <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{text}</p>
    </div>
  )
}

const LegendDot = ({ c, children }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-3)' }}>
    <span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />
    {children}
  </span>
)

// Kunlik ma'lumotni haftalarga guruhlash (Dushanba — Yakshanba)
function buildWeekly(daily) {
  const map = {}
  daily.forEach(d => {
    const dt = new Date(d.date + 'T00:00')
    const dow = (dt.getDay() + 6) % 7
    const monday = new Date(dt)
    monday.setDate(dt.getDate() - dow)
    const key = iso(monday)
    if (!map[key]) map[key] = { key, income: 0, expense: 0 }
    map[key].income += d.income || 0
    map[key].expense += d.expense || 0
  })
  return Object.values(map)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(w => ({
      ...w,
      profit: w.income - w.expense,
      label: fmtDate(w.key),
    }))
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalSold: 0, totalIncome: 0, totalExpense: 0, netProfit: 0,
    salaryExpense: 0, purchaseExpense: 0, products: [], daily: [], orderCount: 0,
  })
  const [monthly, setMonthly] = useState([])
  const [loading, setLoading] = useState(false)
  const [start, setStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return iso(d) })
  const [end, setEnd] = useState(() => iso(new Date()))
  const [showPicker, setShowPicker] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setShowPicker(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const loadStats = async (s = start, e = end) => {
    setLoading(true)
    try {
      const [st, m] = await Promise.all([
        API.get(`/api/orders/stats?startDate=${s}&endDate=${e}`),
        API.get(`/api/orders/monthly?year=${new Date().getFullYear()}`),
      ])
      setStats(st.data); setMonthly(m.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadStats() }, [])

  // Tezkor diapazonlar
  const applyRange = (s, e) => { setStart(s); setEnd(e); loadStats(s, e); setShowPicker(false) }
  const presets = [
    { label: 'Bugun', get: () => { const t = iso(new Date()); return [t, t] } },
    { label: '7 kun', get: () => { const d = new Date(); d.setDate(d.getDate() - 6); return [iso(d), iso(new Date())] } },
    { label: '30 kun', get: () => { const d = new Date(); d.setDate(d.getDate() - 29); return [iso(d), iso(new Date())] } },
    { label: 'Bu oy', get: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), iso(n)] } },
  ]

  const fmt = fmtDate
  const topProduct = stats.products?.[0]
  const avgOrder = stats.orderCount ? Math.round(stats.totalIncome / stats.orderCount) : 0
  const margin = stats.totalIncome ? Math.round((stats.netProfit / stats.totalIncome) * 100) : 0
  const profitable = stats.netProfit >= 0
  const weekly = buildWeekly(stats.daily || [])
  const peakDay = stats.daily?.length
    ? stats.daily.reduce((a, b) => (b.income > a.income ? b : a), stats.daily[0])
    : null

  const todayHour = new Date().getHours()
  const greeting = todayHour < 12 ? 'Xayrli tong' : todayHour < 18 ? 'Xayrli kun' : 'Xayrli oqshom'

  return (
    <div className="page-enter bento-page">
      {/* Greeting bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'Sora,sans-serif', fontWeight: 800, fontSize: 'clamp(1.5rem,2.6vw,2rem)', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {greeting} 👋
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: '0.95rem', marginTop: 2, fontWeight: 500 }}>
            Bugungi ko'rsatkichlaringizni ko'rib chiqing
          </p>
        </div>
        <div ref={ref} style={{ position: 'relative' }}>
          <button onClick={() => setShowPicker(p => !p)} className="btn-ghost">
            <Calendar size={18} /> {fmt(start)} — {fmt(end)}
          </button>
          <AnimatePresence>
            {showPicker && (
              <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.15 }}
                style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 18, padding: '1.1rem', boxShadow: 'var(--shadow-lg)' }}>
                {/* Tezkor tanlovlar */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.85rem' }}>
                  {presets.map(p => {
                    const [s, e] = p.get()
                    const active = s === start && e === end
                    return (
                      <button key={p.label} onClick={() => applyRange(s, e)}
                        style={{
                          padding: '0.4rem 0.7rem', borderRadius: 9, cursor: 'pointer',
                          fontSize: '0.76rem', fontWeight: 700, fontFamily: 'DM Sans,sans-serif',
                          background: active ? 'var(--brand-glow)' : 'var(--surface)',
                          border: `1.5px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                          color: active ? 'var(--brand)' : 'var(--text-2)',
                        }}>
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                <DateRangeCalendar start={start} end={end} onChange={(s, e) => { setStart(s); setEnd(e) }} />
                <button onClick={() => { loadStats(); setShowPicker(false) }} disabled={!end}
                  className="btn-primary" style={{ width: '100%', marginTop: '0.85rem' }}>
                  <Filter size={16} /> Filtrlash
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem', flexDirection: 'column', gap: '1rem' }}>
          <div className="spinner" />
          <span style={{ color: 'var(--text-3)' }}>Yuklanmoqda...</span>
        </div>
      ) : (
        <div className="bento-grid">

          {/* ── KPI strip ───────────────────────────── */}
          <Kpi
            tone="rose" filled icon={<DollarSign size={20} />}
            label="Umumiy daromad"
            value={(stats.totalIncome || 0).toLocaleString()} sub="so'm"
            change={stats.comparison?.income} delay={0}
            foot={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowUpRight size={13} /> {stats.orderCount || 0} ta buyurtma</span>}
          />
          <Kpi
            tone="coral" icon={<Wallet size={20} />}
            label="Umumiy chiqim"
            value={(stats.totalExpense || 0).toLocaleString()} sub="so'm"
            change={stats.comparison?.expense} delay={0.06}
            foot={`Oylik ${compact(stats.salaryExpense)} • Xarid ${compact(stats.purchaseExpense)}`}
          />
          <Kpi
            tone={profitable ? 'mint' : 'red'} filled icon={<PiggyBank size={20} />}
            label="Sof foyda"
            value={`${profitable ? '' : '−'}${Math.abs(stats.netProfit || 0).toLocaleString()}`} sub="so'm"
            change={stats.comparison?.profit} delay={0.12}
            foot={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {profitable ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {margin}% margin
              </span>
            }
          />
          <Kpi
            tone="amber" icon={<ShoppingBag size={20} />}
            label="Buyurtmalar"
            value={stats.orderCount || 0}
            change={stats.comparison?.orders} delay={0.18}
            foot="qabul qilingan"
          />
          <Kpi
            tone="sky" icon={<Hash size={20} />}
            label="Sotilgan taom"
            value={(stats.totalSold || 0).toLocaleString()} sub="dona"
            change={stats.comparison?.sold} delay={0.24}
            foot={`${stats.products?.length || 0} xil mahsulotdan`}
          />
          <Kpi
            tone="violet" icon={<Sparkles size={20} />}
            label="O'rtacha buyurtma"
            value={avgOrder.toLocaleString()} sub="so'm"
            change={stats.comparison?.avgOrder} delay={0.3}
            foot="bir buyurtma uchun"
          />

          {/* ── Daily revenue vs expense chart ──────── */}
          <div className="bento b-c8">
            <div className="bento-head" style={{ marginBottom: '0.25rem' }}>
              <div>
                <div className="bento-title" style={{ fontSize: '1.05rem', marginBottom: 2 }}>📈 Kunlik daromad va chiqim</div>
                <div className="bento-subtitle" style={{ marginBottom: 0 }}>
                  {peakDay
                    ? `Eng yuqori daromad: ${fmt(peakDay.date)} — ${(peakDay.income || 0).toLocaleString()} so'm`
                    : 'Tanlangan davrdagi kunlik dinamika'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <LegendDot c={INCOME_C}>Daromad</LegendDot>
                <LegendDot c={EXPENSE_C}>Chiqim</LegendDot>
              </div>
            </div>
            {stats.daily?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={stats.daily} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grad-inc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={INCOME_C} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={INCOME_C} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={EXPENSE_C} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={EXPENSE_C} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={d => new Date(d + 'T00:00').toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })}
                    tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} minTickGap={14} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="income" name="Daromad" stroke={INCOME_C} strokeWidth={3}
                    fill="url(#grad-inc)" dot={false} activeDot={{ r: 6 }} />
                  <Area type="monotone" dataKey="expense" name="Chiqim" stroke={EXPENSE_C} strokeWidth={2.5}
                    fill="url(#grad-exp)" dot={false} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyMini text="Bu davr uchun kunlik ma'lumot yo'q" height={250} />
            )}
          </div>

          {/* ── Top product highlight ───────────────── */}
          <div className="bento bento--filled bento--violet b-c4">
            <div className="bento-blob" style={{ bottom: -60, right: -40 }} />
            <div className="bento-head">
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trophy size={26} style={{ color: '#FCD34D' }} />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'rgba(255,255,255,0.22)', padding: '5px 12px', borderRadius: 100, color: '#fff' }}>TOP-1</span>
            </div>
            {topProduct ? (
              <div style={{ marginTop: 'auto' }}>
                <div className="bento-label" style={{ color: 'rgba(255,255,255,0.8)' }}>Eng ko'p sotilgan</div>
                <div style={{ fontFamily: 'Sora,sans-serif', fontWeight: 800, fontSize: '1.35rem', color: '#fff', lineHeight: 1.2, marginTop: 6 }}>
                  {topProduct.name}
                </div>
                <div style={{ display: 'flex', gap: '1.75rem', marginTop: 14 }}>
                  <div>
                    <div style={{ fontFamily: 'Sora,sans-serif', fontWeight: 800, fontSize: '1.5rem', color: '#fff' }}>{topProduct.quantity}</div>
                    <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.8)' }}>marta sotildi</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Sora,sans-serif', fontWeight: 800, fontSize: '1.5rem', color: '#fff' }}>{(topProduct.total || 0).toLocaleString()}</div>
                    <div style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.8)' }}>so'm daromad</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 'auto', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
                Hozircha sotuv ma'lumoti yo'q
              </div>
            )}
          </div>

          {/* ── Weekly income / expense ─────────────── */}
          <div className="bento b-c6">
            <div className="bento-head" style={{ marginBottom: '0.25rem' }}>
              <div>
                <div className="bento-title" style={{ fontSize: '1.05rem', marginBottom: 2 }}>🗓️ Haftalik daromad va chiqim</div>
                <div className="bento-subtitle" style={{ marginBottom: 0 }}>Hafta kesimida (Dush — Yak)</div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <LegendDot c={INCOME_C}>Daromad</LegendDot>
                <LegendDot c={EXPENSE_C}>Chiqim</LegendDot>
              </div>
            </div>
            {weekly.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={weekly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip content={<Tip />} cursor={{ fill: 'var(--brand-glow)' }} />
                  <Bar dataKey="income" name="Daromad" fill={INCOME_C} radius={[6, 6, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="expense" name="Chiqim" fill={EXPENSE_C} radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyMini icon="🗓️" text="Haftalik ma'lumot yo'q" height={230} />
            )}
          </div>

          {/* ── Monthly bar chart ───────────────────── */}
          <div className="bento b-c6">
            <div className="bento-head" style={{ marginBottom: '0.25rem' }}>
              <div>
                <div className="bento-title" style={{ fontSize: '1.05rem', marginBottom: 2 }}>📊 {new Date().getFullYear()} — oylik daromad</div>
                <div className="bento-subtitle" style={{ marginBottom: 0 }}>Yil kesimida tushum taqsimoti</div>
              </div>
            </div>
            {monthly?.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`}
                    tick={{ fill: 'var(--text-3)', fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<Tip />} cursor={{ fill: 'var(--brand-glow)' }} />
                  <Bar dataKey="income" name="Daromad" fill={INCOME_C} radius={[10, 10, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyMini icon="📊" text="Oylik ma'lumot hali yig'ilmagan" height={230} />
            )}
          </div>

          {/* ── Top products list ───────────────────── */}
          <div className="bento b-c12">
            <div className="bento-head" style={{ marginBottom: '1rem' }}>
              <div>
                <div className="bento-title" style={{ fontSize: '1.05rem', marginBottom: 2 }}>🏆 Top mahsulotlar</div>
                <div className="bento-subtitle" style={{ marginBottom: 0 }}>Davr bo'yicha eng ko'p sotilganlar</div>
              </div>
              <span className="badge badge-warning">{stats.products?.length || 0} ta</span>
            </div>
            {!stats.products?.length ? (
              <EmptyMini text="Bu davr uchun ma'lumot yo'q" height={120} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
                {stats.products.slice(0, 8).map((p, i) => {
                  const colors = ['#FB7185', '#FB923C', '#FBBF24', '#84CC16', '#34D399', '#38BDF8', '#818CF8', '#F472B6']
                  const color = colors[i % colors.length]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.7rem 0.85rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: '#fff', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-3)', marginTop: 2 }}>{p.quantity} marta sotildi</div>
                      </div>
                      <div style={{ fontFamily: 'Sora,sans-serif', fontWeight: 800, fontSize: '0.95rem', color, flexShrink: 0 }}>
                        {(p.total || 0).toLocaleString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

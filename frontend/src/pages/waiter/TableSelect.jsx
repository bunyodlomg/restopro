import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ShoppingBag, Grid3X3, CalendarClock } from 'lucide-react'
import GuestOrders from '../../components/GuestOrders.jsx'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import { useSections } from '../../utils/sections.js'
import { money, initials, minutesSince, fmtDuration, Seg, Loading, Empty, orderTotal, itemCount, usePosBase, hhmm } from '../../components/ui.jsx'


const pad = n => String(n).padStart(2, '0')

export default function TableSelect() {
  const { sections } = useSections()
  const CATS = [{ k: 'all', l: 'Barchasi' }, ...sections.map(s => ({ k: s.key, l: s.label }))]
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [cat, setCat] = useState(() => localStorage.getItem('rp_table_cat') || 'all')
  const [loading, setLoading] = useState(true)
  const [reservations, setReservations] = useState([])
  const [, tick] = useState(0)
  const navigate = useNavigate()
  const base = usePosBase()

  const load = async () => {
    try {
      const [t, o] = await Promise.all([API.get('/api/tables'), API.get('/api/orders?status=pending')])
      setTables(t.data.filter(x => x.category !== 'soboy'))
      setOrders(o.data)
      API.get('/api/reservations').then(r => setReservations(r.data)).catch(() => {})
    } catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const s = createSocket()
    s.on('tableUpdated', t => t && setTables(p => p.map(x => (x._id === t._id ? t : x))))
    s.on('tableCreated', t => setTables(p => [...p, t]))
    s.on('tableDeleted', id => setTables(p => p.filter(x => x._id !== id)))
    const reloadOrders = () => API.get('/api/orders?status=pending').then(r => setOrders(r.data)).catch(() => {})
    s.on('newOrder', reloadOrders)
    s.on('orderUpdated', reloadOrders)
    s.on('orderClosed', () => { reloadOrders(); API.get('/api/tables').then(r => setTables(r.data.filter(x => x.category !== 'soboy'))).catch(() => {}) })
    s.on('reservationsChanged', () => API.get('/api/reservations').then(r => setReservations(r.data)).catch(() => {}))
    s.on('syncApplied', ({ colls }) => { if (colls.some(c => ['tables', 'orders', 'reservations'].includes(c))) load() })
    const timer = setInterval(() => tick(n => n + 1), 30000)   // band vaqtini yangilash
    return () => { s.disconnect(); clearInterval(timer) }
  }, [])

  useEffect(() => { try { localStorage.setItem('rp_table_cat', cat) } catch {} }, [cat])

  const byTable = useMemo(() => {
    const m = {}
    for (const o of orders) if (o.tableId) m[o.tableId] = o
    return m
  }, [orders])

  // Bugungi eng yaqin faol bron (kelish vaqti o'tgan bo'lsa ham 2 soatgacha ko'rsatiladi)
  const resByTable = useMemo(() => {
    const m = {}
    const now = Date.now(), endOfDay = new Date().setHours(23, 59, 59, 999)
    for (const r of reservations) {
      const t = new Date(r.startAt).getTime()
      if (r.status !== 'booked' || t > endOfDay || t < now - 2 * 3600000) continue
      if (!m[r.tableId] || t < new Date(m[r.tableId].startAt).getTime()) m[r.tableId] = r
    }
    return m
  }, [reservations])

  // Saqlangan bo'lim o'chirilgan bo'lsa — birinchisiga
  useEffect(() => { if (!CATS.some(c => c.k === cat)) setCat(CATS[0].k) }, [sections])

  const all = cat === 'all'
  const list = tables.filter(t => all || t.category === cat).sort((a, b) => a.number - b.number)
  const counts = Object.fromEntries(CATS.map(c => [c.k, c.k === 'all' ? tables.length : tables.filter(t => t.category === c.k).length]))
  // «Barchasi»: bo'limlar ketma-ket, har biri o'z sarlavhasi bilan (raqamlar bo'limlarda takrorlanadi)
  const groups = all
    ? sections.map(s => ({ key: s.key, label: s.label, list: list.filter(t => t.category === s.key) })).filter(g => g.list.length)
    : [{ key: cat, label: '', list }]
  const busy = list.filter(t => t.status === 'busy')
  const openSum = busy.reduce((s, t) => s + orderTotal(byTable[t._id]), 0)

  const pick = t => navigate(`${base}/order/${t._id}`, { state: { table: t } })
  const soboy = () => navigate(`${base}/soboy`, { state: { table: { _id: 'soboy', number: 0, category: 'soboy' } } })

  return (
    <div className="page">
      <div className="page-head">
        <Seg value={cat} onChange={setCat} items={CATS.map(c => ({ k: c.k, l: c.l, n: counts[c.k] }))}/>
        <div className="hstats hide-mobile" style={{ marginLeft: 'auto' }}>
          <Stat n={list.length - busy.length} l="Bo'sh" dot="var(--ok)"/>
          <Stat n={busy.length} l="Band" dot="var(--accent)"/>
          <Stat n={money(openSum)} unit="so'm" l="Ochiq hisob"/>
        </div>
        <button className="btn btn-primary btn-lg" onClick={soboy}><ShoppingBag size={20}/> Soboy buyurtma</button>
      </div>

      <GuestOrders/>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={Grid3X3} title="Bu bo'limda stol yo'q" text="Stollarni admin panelidagi «Stollar» bo'limidan qo'shish mumkin."/>
      ) : groups.map(g => (
        <section key={g.key} style={{ marginBottom: all ? 26 : 0 }}>
          {all && (
            <div className="tgroup-head">
              <b>{g.label}</b>
              <span className="label">{g.list.filter(t => t.status !== 'busy').length} bo'sh · {g.list.filter(t => t.status === 'busy').length} band</span>
            </div>
          )}
        <div className="tgrid">
          {g.list.map(t => {
            const o = byTable[t._id]
            const res = resByTable[t._id]
            if (t.status !== 'busy' && res) return (
              <button key={t._id} className="tcard res" onClick={() => pick(t)}>
                <span className="tcard-st"><i className="dot"/>Bron · {hhmm(res.startAt)}</span>
                <span className="tcard-n">{pad(t.number)}</span>
                <span className="tcard-foot"><CalendarClock size={16}/><span className="truncate">{res.name} · {res.guests} kishi</span></span>
              </button>
            )
            if (t.status !== 'busy') return (
              <button key={t._id} className="tcard" onClick={() => pick(t)}>
                <span className="tcard-st"><i className="dot"/>Bo'sh</span>
                <span className="tcard-n">{pad(t.number)}</span>
                <span className="tcard-foot"><Users size={16}/>{t.description || 'Yangi buyurtma'}</span>
              </button>
            )
            const mins = o ? minutesSince(o.createdAt) : 0
            return (
              <button key={t._id} className="tcard busy" onClick={() => pick(t)}>
                <span className="tcard-st"><i className="dot"/>Band{res ? ` · bron ${hhmm(res.startAt)}` : ''}</span>
                <span className="tcard-n">{pad(t.number)}</span>
                <span className="tcard-sum">{o ? money(orderTotal(o)) : '—'}</span>
                <span className="tcard-meta">
                  <span className={mins > 60 ? 'late' : ''}>{o ? `${fmtDuration(mins)} · ${itemCount(o)} ta` : ''}</span>
                  {o?.waiterName && <span className="tcard-who" title={o.waiterName}>{initials(o.waiterName)}</span>}
                </span>
              </button>
            )
          })}
        </div>
        </section>
      ))}
    </div>
  )
}

function Stat({ n, l, unit, dot }) {
  return (
    <div className="hstat">
      <span className="label">{dot && <i className="dot" style={{ background: dot }}/>}{l}</span>
      <b>{n}{unit && <small>{unit}</small>}</b>
    </div>
  )
}


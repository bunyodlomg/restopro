import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ShoppingBag, Grid3X3 } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import { money, initials, minutesSince, fmtDuration, Seg, Loading, Empty, orderTotal, itemCount } from '../../components/ui.jsx'

const CATS = [
  { k: 'zal',    l: 'Zal' },
  { k: 'xona',   l: 'Xona' },
  { k: "ko'cha", l: "Ko'cha" },
]

const pad = n => String(n).padStart(2, '0')

export default function TableSelect() {
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [cat, setCat] = useState(() => localStorage.getItem('rp_table_cat') || 'zal')
  const [loading, setLoading] = useState(true)
  const [, tick] = useState(0)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [t, o] = await Promise.all([API.get('/api/tables'), API.get('/api/orders?status=pending')])
      setTables(t.data.filter(x => x.category !== 'soboy'))
      setOrders(o.data)
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
    s.on('syncApplied', ({ colls }) => { if (colls.includes('tables') || colls.includes('orders')) load() })
    const timer = setInterval(() => tick(n => n + 1), 30000)   // band vaqtini yangilash
    return () => { s.disconnect(); clearInterval(timer) }
  }, [])

  useEffect(() => { try { localStorage.setItem('rp_table_cat', cat) } catch {} }, [cat])

  const byTable = useMemo(() => {
    const m = {}
    for (const o of orders) if (o.tableId) m[o.tableId] = o
    return m
  }, [orders])

  const list = tables.filter(t => t.category === cat).sort((a, b) => a.number - b.number)
  const counts = Object.fromEntries(CATS.map(c => [c.k, tables.filter(t => t.category === c.k).length]))
  const busy = list.filter(t => t.status === 'busy')
  const openSum = busy.reduce((s, t) => s + orderTotal(byTable[t._id]), 0)

  const pick = t => navigate(`/waiter/order/${t._id}`, { state: { table: t } })
  const soboy = () => navigate('/waiter/soboy', { state: { table: { _id: 'soboy', number: 0, category: 'soboy' } } })

  return (
    <div className="page">
      <div className="page-head">
        <Seg value={cat} onChange={setCat} items={CATS.map(c => ({ k: c.k, l: c.l, n: counts[c.k] }))}/>
        <div className="row hide-mobile" style={{ gap: 28, marginLeft: 'auto' }}>
          <Stat n={list.length - busy.length} l="Bo'sh"/>
          <Stat n={busy.length} l="Band"/>
          <Stat n={money(openSum)} l="Ochiq hisob"/>
        </div>
        <button className="btn btn-primary btn-lg" onClick={soboy}><ShoppingBag size={20}/> Soboy buyurtma</button>
      </div>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={Grid3X3} title="Bu bo'limda stol yo'q" text="Stollarni admin panelidagi «Stollar» bo'limidan qo'shish mumkin."/>
      ) : (
        <div className="tgrid">
          {list.map(t => {
            const o = byTable[t._id]
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
                <span className="tcard-st"><i className="dot"/>Band</span>
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
      )}
    </div>
  )
}

function Stat({ n, l }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div className="mono" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.03em' }}>{n}</div>
      <div className="label">{l}</div>
    </div>
  )
}


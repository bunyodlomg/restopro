import React, { useState, useEffect, useRef } from 'react'
import { ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { API_URL } from '../../config.js'
import { createSocket } from '../../api/socket.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { getNewOrderSoundUrl } from '../../utils/sound.js'
import { Seg, Loading, Empty, PageHead, money, orderTotal, itemCount, minutesSince, fmtDuration } from '../../components/ui.jsx'
import { useSections } from '../../utils/sections.js'

const PAGE_SIZE = 50
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const hhmm = d => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })

export function OrderNum({ order }) {
  const soboy = order.category === 'soboy'
  const { label } = useSections()
  return (
    <div className="ocard-num" style={soboy ? { background: 'var(--accent)', color: '#fff' } : undefined}>
      <small className="truncate" style={{ maxWidth: '100%' }} title={soboy ? 'Soboy' : `${label(order.category)} · Stol ${order.tableNumber}`}>{soboy ? 'SOBOY' : label(order.category) || 'STOL'}</small><b>{order.tableNumber ?? '—'}</b>
    </div>
  )
}

export default function MyOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [page, setPage] = useState(1)
  const { user } = useAuth()
  const audioRef = useRef(null)

  useEffect(() => {
    audioRef.current = new Audio(getNewOrderSoundUrl(API_URL))
    const today = todayStr()
    // Faqat bugungi buyurtmalar — server sana bo'yicha filtrlaydi
    const load = () => API.get(`/api/orders?startDate=${today}&endDate=${today}`)
      .then(({ data }) => setOrders(Array.isArray(data) ? data : data.orders || []))
      .catch(() => toast.error("Yuklab bo'lmadi"))
      .finally(() => setLoading(false))
    load()

    const s = createSocket()
    s.on('syncApplied', ({ colls }) => { if (colls.includes('orders')) load() })
    s.on('newOrder', o => setOrders(p => (p.some(x => x._id === o._id) ? p : [o, ...p])))
    s.on('orderUpdated', o => setOrders(p => p.map(x => (x._id === o._id ? o : x))))
    s.on('orderClosed', id => setOrders(p => p.map(x => (x._id === id ? { ...x, status: 'closed' } : x))))
    // Admin buyurtmani yopganda ofitsantga ovoz
    s.on('orderClosedSound', () => {
      audioRef.current?.play().catch(() => {})
      toast.success('Buyurtma yopildi')
    })
    return () => s.disconnect()
  }, [user?._id])

  const mine = orders.filter(o => o.waiterId === user?._id || o.waiterName === user?.name)
  const by = { pending: mine.filter(o => o.status === 'pending'), closed: mine.filter(o => o.status === 'closed'), all: mine }
  const list = by[tab]
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const cur = Math.min(page, pageCount)
  const visible = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE)
  const daySum = by.closed.reduce((s, o) => s + orderTotal(o), 0)

  return (
    <div className="page">
      <PageHead title="Mening buyurtmalarim" sub={`Bugun · ${mine.length} ta buyurtma · yopilgan: ${money(daySum)} so'm`}
        actions={<Seg value={tab} onChange={k => { setTab(k); setPage(1) }}
          items={[{ k: 'pending', l: 'Faol', n: by.pending.length }, { k: 'closed', l: 'Yopilgan', n: by.closed.length }, { k: 'all', l: 'Barchasi', n: mine.length }]}/>}/>

      {loading ? <Loading/> : visible.length === 0 ? (
        <Empty icon={ClipboardList} title={tab === 'pending' ? "Faol buyurtma yo'q" : "Bugun buyurtma yo'q"} text="Yangi buyurtma uchun «Stollar» bo'limidan stol tanlang."/>
      ) : <>
        <div className="ogrid">
          {visible.map(o => {
            const mins = minutesSince(o.createdAt)
            return (
              <div key={o._id} className="card ocard">
                <div className="ocard-head">
                  <OrderNum order={o}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{itemCount(o)} ta taom</div>
                    <div className="label">{hhmm(o.createdAt)}{o.status === 'pending' && <span className={mins > 60 ? 'late' : ''}> · {fmtDuration(mins)}</span>}</div>
                  </div>
                  {o.status === 'pending' ? <span className="tag tag-yel">Ochiq</span>
                    : o.status === 'closed' ? <span className="tag tag-ok">Yopilgan</span>
                    : <span className="tag tag-soft">Bekor</span>}
                </div>
                <div className="ocard-items">
                  {(o.items || []).map((it, i) => (
                    <div key={i} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                      <span className="truncate"><span className="muted">{it.quantity}×</span> {it.name}</span>
                      <span>{money(it.price * it.quantity)}</span>
                    </div>
                  ))}
                  {o.note && <div style={{ color: 'var(--hl-ink)', marginTop: 4 }}>— {o.note}</div>}
                </div>
                <div className="ocard-foot">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="label">Jami</span>
                    <b className="mono" style={{ fontSize: 22, letterSpacing: '-.03em' }}>{money(orderTotal(o))}</b>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {pageCount > 1 && (
          <div className="row" style={{ justifyContent: 'center', gap: 16, marginTop: 20 }}>
            <button className="btn btn-soft btn-icon" disabled={cur <= 1} onClick={() => setPage(cur - 1)}><ChevronLeft size={20}/></button>
            <span className="mono">{cur} / {pageCount}</span>
            <button className="btn btn-soft btn-icon" disabled={cur >= pageCount} onClick={() => setPage(cur + 1)}><ChevronRight size={20}/></button>
          </div>
        )}
      </>}
    </div>
  )
}

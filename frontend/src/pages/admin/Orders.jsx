import React, { useState, useEffect } from 'react'
import { Bell, BellOff, Check, Printer, X, ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { printReceipt as printOrder } from '../../utils/receipt.js'
import Modal from '../../components/shared/Modal.jsx'
import { OrderNum } from '../waiter/MyOrders.jsx'
import GuestOrders from '../../components/GuestOrders.jsx'
import { Seg, Loading, Empty, PageHead, money, orderTotal, itemCount, minutesSince, fmtDuration } from '../../components/ui.jsx'

const CATS = [
  { k: 'all', l: 'Barchasi' },
  { k: 'zal', l: 'Zal' },
  { k: 'xona', l: 'Xona' },
  { k: "ko'cha", l: "Ko'cha" },
  { k: 'soboy', l: 'Soboy' },
]

export async function printReceipt(order, settings) {
  const id = toast.loading('Chek chiqarilmoqda…')
  const r = await printOrder(order, settings)
  if (!r.ok) toast.error(r.error || 'Chek chiqmadi', { id, duration: 6000 })
  else if (r.queued) toast.success('Chek kassaga yuborildi', { id })
  else toast.success('Chek chiqdi', { id })
}

function OrderCard({ order, settings, onClose, onCancel, busy }) {
  const mins = minutesSince(order.createdAt)
  const extras = order.extras || []
  return (
    <div className="card ocard">
      <div className="ocard-head">
        <OrderNum order={order}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }} className="truncate">{order.waiterName || '—'}</div>
          <div className="label truncate">
            {new Date(order.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
            {' · '}<span className={mins > 60 ? 'late' : ''}>{fmtDuration(mins)}</span>
            {' · '}{itemCount(order)} ta
          </div>
        </div>
        <button className="btn btn-soft btn-icon" title="Chek chiqarish" onClick={() => printReceipt(order, settings)}><Printer size={20}/></button>
      </div>

      <div className="ocard-items">
        {(order.items || []).map((it, i) => (
          <div key={i} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <span className="truncate"><span className="muted">{it.quantity}×</span> {it.name}</span>
            <span>{money(it.price * it.quantity)}</span>
          </div>
        ))}
        {extras.map((e, i) => (
          <div key={'e' + i} className="row muted" style={{ justifyContent: 'space-between', gap: 10 }}>
            <span className="truncate">+ {e.comment || "Qo'shimcha"}</span><span>{money(e.extraFee)}</span>
          </div>
        ))}
        {order.serviceFee > 0 && (
          <div className="row muted" style={{ justifyContent: 'space-between' }}><span>Xizmat haqi</span><span>{money(order.serviceFee)}</span></div>
        )}
        {order.note && <div style={{ color: 'var(--hl-ink)', marginTop: 4 }}>— {order.note}</div>}
      </div>

      <div className="ocard-foot">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label">Jami</span>
          <b className="mono" style={{ fontSize: 26, letterSpacing: '-.04em' }}>{money(orderTotal(order))}</b>
        </div>
        <div className="ocard-actions">
          <button className="btn btn-ghost btn-lg btn-icon" title="Bekor qilish" aria-label="Bekor qilish" onClick={() => onCancel(order)} disabled={busy}><X size={22}/></button>
          <button className="btn btn-ok btn-lg" onClick={() => onClose(order)} disabled={busy}>
            <Check size={20}/> To'landi
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [sound, setSound] = useState(() => localStorage.getItem('rp_sound') === 'true')
  const { settings } = useSettings()

  useEffect(() => {
    const load = () => API.get('/api/orders?status=pending')
      .then(({ data }) => setOrders(data))
      .catch(() => toast.error("Yuklab bo'lmadi"))
      .finally(() => setLoading(false))
    load()
    const s = createSocket({ transports: ['websocket'], reconnection: true })
    s.on('syncApplied', ({ colls }) => { if (colls.includes('orders')) load() })
    s.on('newOrder', o => setOrders(p => (p.some(x => x._id === o._id) ? p : [o, ...p])))
    s.on('orderUpdated', o => setOrders(p => p.map(x => (x._id === o._id ? o : x))))
    s.on('orderClosed', id => setOrders(p => p.filter(x => x._id !== id)))
    return () => s.disconnect()
  }, [])

  const close = async o => {
    setBusyId(o._id)
    try {
      await API.put(`/api/orders/${o._id}/close`)
      setOrders(p => p.filter(x => x._id !== o._id))
      toast.success(`${o.category === 'soboy' ? 'Soboy' : 'Stol'} ${o.tableNumber} — yopildi`)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
    finally { setBusyId(null) }
  }
  const cancel = async () => {
    const o = cancelling
    setBusyId(o._id)
    try {
      await API.delete(`/api/orders/${o._id}`)
      setOrders(p => p.filter(x => x._id !== o._id))
      toast.success('Buyurtma bekor qilindi')
      setCancelling(null)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
    finally { setBusyId(null) }
  }
  const toggleSound = () => { const v = !sound; setSound(v); localStorage.setItem('rp_sound', String(v)) }

  const list = cat === 'all' ? orders : orders.filter(o => o.category === cat)
  const total = orders.reduce((s, o) => s + orderTotal(o), 0)
  const count = k => (k === 'all' ? orders.length : orders.filter(o => o.category === k).length)

  return (
    <div className="page">
      <PageHead title="Faol buyurtmalar" sub={`${orders.length} ta ochiq · ${money(total)} so'm`}
        actions={<button className={`btn btn-lg ${sound ? 'btn-on' : 'btn-soft'}`} onClick={toggleSound}>
          {sound ? <Bell size={20}/> : <BellOff size={20}/>}{sound ? 'Ovoz yoqilgan' : "Ovoz o'chiq"}
        </button>}/>

      <GuestOrders/>

      <Seg value={cat} onChange={setCat} items={CATS.map(c => ({ ...c, n: count(c.k) }))} style={{ marginBottom: 18 }}/>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={ClipboardList} title="Ochiq buyurtma yo'q" text="Ofitsant buyurtma yuborganda shu yerda darhol paydo bo'ladi."/>
      ) : (
        <div className="ogrid">
          {list.map(o => (
            <OrderCard key={o._id} order={o} settings={settings} busy={busyId === o._id} onClose={close} onCancel={setCancelling}/>
          ))}
        </div>
      )}

      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Buyurtmani bekor qilish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setCancelling(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={cancel} disabled={busyId === cancelling?._id}>Ha, bekor qilish</button>
        </>}>
        {cancelling && <p style={{ margin: 0, fontSize: 16 }}>
          {cancelling.category === 'soboy' ? 'Soboy' : 'Stol'} {cancelling.tableNumber} — {money(orderTotal(cancelling))} so'm.
          Buyurtma bekor qilinadi va stol bo'shatiladi.
        </p>}
      </Modal>
    </div>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import { Bell, BellOff, Check, Printer, X, ClipboardList, Undo2, Minus, Plus, HandCoins } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSections, usePlace } from '../../utils/sections.js'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { printReceipt as printOrder } from '../../utils/receipt.js'
import Modal from '../../components/shared/Modal.jsx'
import { OrderNum } from '../waiter/MyOrders.jsx'
import GuestOrders from '../../components/GuestOrders.jsx'
import DebtCloseModal from './DebtCloseModal.jsx'
import { Seg, Loading, Empty, PageHead, money, orderTotal, itemCount, minutesSince, fmtDuration } from '../../components/ui.jsx'


export async function printReceipt(order, settings) {
  const id = toast.loading('Chek chiqarilmoqda…')
  const r = await printOrder(order, settings)
  if (!r.ok) toast.error(r.error || 'Chek chiqmadi', { id, duration: 6000 })
  else if (r.queued) toast.success('Chek kassaga yuborildi', { id })
  else toast.success('Chek chiqdi', { id })
}

const FRESH_MS = 10000   // yangi / qo'shimcha buyurtma shuncha vaqt rangli animatsiya bilan ajralib turadi

function OrderCard({ order, settings, onClose, onCancel, onReturn, onDebt, busy, fresh }) {
  const mins = minutesSince(order.createdAt)
  const extras = order.extras || []
  return (
    <div className={`card ocard ${fresh ? `fresh fresh-${fresh}` : ''}`}>
      <div className="ocard-head">
        <OrderNum order={order}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }} className="truncate">{order.waiterName || '—'}</span>
            {fresh && <span className="fresh-tag">{fresh === 'new' ? 'Yangi' : "Qo'shimcha"}</span>}
          </div>
          <div className="label truncate">
            {new Date(order.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
            {' · '}<span className={mins > 60 ? 'late' : ''}>{fmtDuration(mins)}</span>
            {' · '}{itemCount(order)} ta
          </div>
        </div>
        <button className="btn btn-soft btn-icon" title="Qaytarilgan taom (masalan ortib qolgan non)" onClick={() => onReturn(order)} disabled={busy}><Undo2 size={20}/></button>
        <button className="btn btn-soft btn-icon" title="Chek chiqarish" onClick={() => printReceipt(order, settings)}><Printer size={20}/></button>
      </div>

      <div className="ocard-items">
        {(order.items || []).map((it, i) => (
          <div key={i} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
            <span className="truncate"><span className="muted">{it.quantity}×</span> {it.name}</span>
            <span>{money(it.price * it.quantity)}</span>
          </div>
        ))}
        {(order.returns || []).map((r, i) => (
          <div key={'r' + i} className="row muted" style={{ justifyContent: 'space-between', gap: 10 }} title={[r.reason, r.by].filter(Boolean).join(' · ')}>
            <span className="truncate"><s>{r.quantity}× {r.name}</s> qaytarildi</span><span>−{money(r.price * r.quantity)}</span>
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
          <button className="btn btn-soft btn-lg" title="Mijoz keyin to'laydi — qarzga yozish" onClick={() => onDebt(order)} disabled={busy}>
            <HandCoins size={20}/> Qarzga
          </button>
          <button className="btn btn-ok btn-lg" onClick={() => onClose(order)} disabled={busy}>
            <Check size={20}/> To'landi
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Orders() {
  const place = usePlace()
  const { sections } = useSections()
  const CATS = [{ k: 'all', l: 'Barchasi' }, ...sections.map(x => ({ k: x.key, l: x.label })), { k: 'soboy', l: 'Soboy' }]
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  const [busyId, setBusyId] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [returning, setReturning] = useState(null)
  const [debtOf, setDebtOf] = useState(null)   // qarzga yopilayotgan buyurtma
  const [sound, setSound] = useState(() => localStorage.getItem('rp_sound') !== 'false')
  const { settings } = useSettings()

  // Yangi kelgan buyurtma ('new') va ochiq stolga qo'shilgan taom ('added') — 10 soniya ajralib turadi.
  // Cloud'dagi ofitsantdan sync orqali kelganlar uchun socket «newOrder» yo'q — ro'yxat solishtiriladi.
  const [fresh, setFresh] = useState({})
  const seen = useRef(null)   // { orderId: taomlar soni } — birinchi yuklashdagilar yangi hisoblanmaydi
  const markFresh = (id, kind) => {
    setFresh(f => ({ ...f, [id]: f[id] === 'new' ? 'new' : kind }))
    setTimeout(() => setFresh(f => { const n = { ...f }; delete n[id]; return n }), FRESH_MS)
  }
  const track = list => {
    const prev = seen.current
    seen.current = Object.fromEntries(list.map(o => [o._id, itemCount(o)]))
    if (!prev) return
    for (const o of list) {
      if (!(o._id in prev)) markFresh(o._id, 'new')
      else if (itemCount(o) > prev[o._id]) markFresh(o._id, 'added')
    }
  }

  useEffect(() => {
    const load = () => API.get('/api/orders?status=pending')
      .then(({ data }) => { track(data); setOrders(data) })
      .catch(() => toast.error("Yuklab bo'lmadi"))
      .finally(() => setLoading(false))
    load()
    const s = createSocket({ transports: ['websocket'], reconnection: true })
    s.on('syncApplied', ({ colls }) => { if (colls.includes('orders')) load() })
    s.on('newOrder', o => setOrders(p => { if (p.some(x => x._id === o._id)) return p; const next = [o, ...p]; track(next); return next }))
    s.on('orderUpdated', o => setOrders(p => { const next = p.map(x => (x._id === o._id ? o : x)); track(next); return next }))
    s.on('orderClosed', id => setOrders(p => p.filter(x => x._id !== id)))
    return () => s.disconnect()
  }, [])

  const close = async o => {
    setBusyId(o._id)
    try {
      await API.put(`/api/orders/${o._id}/close`)
      setOrders(p => p.filter(x => x._id !== o._id))
      toast.success(`${place(o)} — yopildi`)
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
            <OrderCard key={o._id} order={o} settings={settings} busy={busyId === o._id} fresh={fresh[o._id]} onClose={close} onCancel={setCancelling} onReturn={setReturning} onDebt={setDebtOf}/>
          ))}
        </div>
      )}

      {debtOf && <DebtCloseModal order={debtOf} onClose={() => setDebtOf(null)} onDone={o => { setDebtOf(null); setOrders(p => p.filter(x => x._id !== o._id)) }}/>}
      <ReturnModal order={returning} onClose={() => setReturning(null)}
        onDone={o => { setOrders(p => p.map(x => (x._id === o._id ? o : x))); setReturning(null) }}/>

      <Modal open={!!cancelling} onClose={() => setCancelling(null)} title="Buyurtmani bekor qilish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setCancelling(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={cancel} disabled={busyId === cancelling?._id}>Ha, bekor qilish</button>
        </>}>
        {cancelling && <p style={{ margin: 0, fontSize: 16 }}>
          {place(cancelling)} — {money(orderTotal(cancelling))} so'm.
          Buyurtma bekor qilinadi va stol bo'shatiladi.
        </p>}
      </Modal>
    </div>
  )
}

// Mijoz stolidan qaytarilgan taomlar: har taomdan nechta qaytgani tanlanadi (masalan 4 nondan 1 tasi).
// Hisob kamayadi, qaytarilgan dona ombordan ayirilmaydi, buyurtmada «qaytarildi» deb ko'rinadi.
const REASONS = ['Ortib qoldi', 'Mijoz voz kechdi', 'Xato kiritilgan', 'Sifati yoqmadi']
function ReturnModal({ order, onClose, onDone }) {
  const place = usePlace()
  const [qty, setQty] = useState({})
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setQty({}); setReason('') }, [order?._id])

  const items = order?.items || []
  const step = (it, d) => setQty(q => ({ ...q, [it._id]: Math.max(0, Math.min(it.quantity, (q[it._id] || 0) + d)) }))
  const count = Object.values(qty).reduce((s, n) => s + n, 0)
  const sum = items.reduce((s, it) => s + (qty[it._id] || 0) * it.price, 0)

  const submit = async () => {
    setSaving(true)
    try {
      const { data } = await API.post(`/api/orders/${order._id}/return`, {
        items: Object.entries(qty).filter(([, n]) => n > 0).map(([itemId, quantity]) => ({ itemId, quantity })), reason,
      })
      toast.success(`${count} ta taom qaytarildi — hisobdan ${money(sum)} so'm ayirildi`)
      onDone(data)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={!!order} onClose={onClose} title={`Qaytarish — ${place(order)}`} maxWidth={560}
      footer={<>
        <button className="btn btn-ghost btn-lg" onClick={onClose}>Bekor qilish</button>
        <button className="btn btn-primary btn-lg" onClick={submit} disabled={!count || saving}>
          {saving ? <><span className="spinner-sm"/> Saqlanmoqda</> : count ? `${count} ta qaytarish · −${money(sum)}` : 'Taomni tanlang'}
        </button>
      </>}>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 14.5 }}>Mijozga berilmagan yoki qaytarilgan taomlar hisobdan ayiriladi.</p>
      <div className="col" style={{ gap: 6 }}>
        {items.map(it => {
          const n = qty[it._id] || 0
          return (
            <div key={it._id} className="row" style={{ gap: 10, padding: '8px 10px', borderRadius: 12, background: n ? 'var(--hl, var(--thumb))' : 'var(--thumb)' }}>
              <span style={{ flex: 1, minWidth: 0 }} className="truncate"><span className="muted">{it.quantity}×</span> <b>{it.name}</b></span>
              <span className="muted mono" style={{ fontSize: 13 }}>{money(it.price)}</span>
              <button className="btn btn-soft btn-icon" onClick={() => step(it, -1)} disabled={!n} aria-label="Kamaytirish"><Minus size={18}/></button>
              <b className="mono" style={{ minWidth: 28, textAlign: 'center', fontSize: 18 }}>{n}</b>
              <button className="btn btn-soft btn-icon" onClick={() => step(it, 1)} disabled={n >= it.quantity} aria-label="Ko'paytirish"><Plus size={18}/></button>
            </div>
          )
        })}
      </div>
      <div className="label" style={{ margin: '14px 0 8px' }}>Sabab (ixtiyoriy)</div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
        {REASONS.map(r => <button key={r} className={`btn btn-sm ${reason === r ? 'btn-dark' : 'btn-soft'}`} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}
      </div>
      <input className="input" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Yoki o'zingiz yozing" style={{ marginBottom: 14 }}/>
    </Modal>
  )
}

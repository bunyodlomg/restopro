import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Minus, Wifi, QrCode, Check, X, RefreshCw, ShoppingBag, Clock, ReceiptText } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { money, initials, fileUrl } from '../../components/ui.jsx'
import FoodImage from '../../components/shared/FoodImage.jsx'

// Mijoz telefonida ochiladigan menyu (stoldagi QR kod orqali). Tizimga kirish shart emas.
const ALL = 'Barchasi'

const ERRORS = {
  NOT_ON_WIFI: [Wifi, "Restoran Wi-Fi'iga ulaning", "Buyurtma berish uchun telefoningizni restoran Wi-Fi tarmog'iga ulang, so'ng «Qayta urinish» tugmasini bosing."],
  QR_OFF:      [QrCode, 'QR menyu hozir ishlamayapti', 'Buyurtma uchun ofitsantni chaqiring.'],
  BAD_QR:      [QrCode, 'QR kod eskirgan', 'Bu QR kod endi ishlamaydi. Ofitsantdan yordam so\'rang.'],
}

// Rasm shakliga qarab joylashadi (components/shared/FoodImage.jsx)
const Photo = ({ src, name }) => <FoodImage src={src ? fileUrl(src) : ''} name={name}/>

// Stolning ochiq hisobi: qabul qilingan barcha taomlar (oldingi buyurtmalar ham) va jami
function Bill({ bill }) {
  if (!bill) return null
  const row = (l, r, k, muted) => (
    <div key={k} className={`row ${muted ? 'muted' : ''}`} style={{ justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
      <span className="truncate">{l}</span><span>{r}</span>
    </div>
  )
  return (
    <div className="card card-pad mono" style={{ fontSize: 14.5 }}>
      {!bill.items.length && !bill.waiting.length && <div className="muted">Hali taom yo'q</div>}
      {bill.items.map((i, k) => row(<><span className="muted">{i.quantity}×</span> {i.name}</>, money(i.price * i.quantity), 'i' + k))}
      {bill.extras.map((e, k) => row(`+ ${e.name}`, money(e.price), 'e' + k, true))}
      {bill.serviceFee > 0 && row('Xizmat haqi', money(bill.serviceFee), 'fee', true)}
      <div className="row" style={{ justifyContent: 'space-between', borderTop: '1.5px dashed var(--rule-2)', marginTop: 10, paddingTop: 10 }}>
        <span className="label">Jami hisob</span><b style={{ fontSize: 20 }}>{money(bill.total)}</b>
      </div>
      {bill.waiting.length > 0 && <>
        <div className="label" style={{ marginTop: 14, marginBottom: 4 }}>Tasdiqlanishi kutilmoqda</div>
        {bill.waiting.map((i, k) => row(<><span>{i.quantity}×</span> {i.name}</>, money(i.price * i.quantity), 'w' + k, true))}
      </>}
    </div>
  )
}

export default function GuestMenu({ token }) {
  const [data, setData] = useState(null)
  const tableName = data ? `${data.table.label ? data.table.label + ' · ' : ''}Stol ${data.table.number}` : ''
  const [error, setError] = useState(null)
  const [cat, setCat] = useState(ALL)
  const [cart, setCart] = useState({})
  const [note, setNote] = useState('')
  const [sheet, setSheet] = useState(false)
  const [sending, setSending] = useState(false)
  const [bill, setBill] = useState(null)
  const [billOpen, setBillOpen] = useState(false)
  const storeKey = `rp_guest_${token}`
  const [sent, setSent] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storeKey) || 'null') } catch { return null } })

  const load = () => {
    setError(null)
    API.get(`/api/guest/t/${encodeURIComponent(token)}`)
      .then(r => { setData(r.data); setBill(r.data.bill || null); document.title = `${r.data.brand.name} — menyu` })
      .catch(err => setError(err.response?.data || { message: 'Serverga ulanib bo\'lmadi' }))
  }
  useEffect(() => { load() }, [token])

  // Stol hisobi: ofitsant qo'shgan taomlar ham, yopilganda bo'shaydi
  const loadBill = () => API.get(`/api/guest/t/${encodeURIComponent(token)}/bill`).then(r => setBill(r.data)).catch(() => {})
  useEffect(() => {
    if (!data) return
    const t = setInterval(loadBill, 10000)
    return () => clearInterval(t)
  }, [data, token])

  // Yuborilgan buyurtma holatini kuzatish
  useEffect(() => {
    if (!sent || sent.status !== 'new') return
    const t = setInterval(async () => {
      try {
        const { data: g } = await API.get(`/api/guest/t/${encodeURIComponent(token)}/orders/${sent._id}`)
        if (g.status !== 'new') {
          const next = { ...sent, status: g.status }
          setSent(next); sessionStorage.setItem(storeKey, JSON.stringify(next))
          loadBill()
        }
      } catch {}
    }, 4000)
    return () => clearInterval(t)
  }, [sent])

  const products = data?.products || []
  const cats = useMemo(() => [ALL, ...new Set(products.map(p => p.category))], [products])
  const shown = cat === ALL ? products : products.filter(p => p.category === cat)
  const byId = useMemo(() => Object.fromEntries(products.map(p => [p._id, p])), [products])
  const lines = Object.entries(cart).filter(([id, n]) => n > 0 && byId[id]).map(([id, n]) => ({ p: byId[id], n }))
  const count = lines.reduce((s, l) => s + l.n, 0)
  const sum = lines.reduce((s, l) => s + l.p.price * l.n, 0)
  const fee = Math.round(sum * (data?.serviceFeePercent || 0) / 100)

  const add = id => setCart(c => ({ ...c, [id]: Math.min(20, (c[id] || 0) + 1) }))
  const dec = id => setCart(c => { const n = (c[id] || 0) - 1; const x = { ...c }; if (n > 0) x[id] = n; else delete x[id]; return x })

  const submit = async () => {
    setSending(true)
    try {
      const { data: g } = await API.post(`/api/guest/t/${encodeURIComponent(token)}/orders`, {
        items: lines.map(l => ({ productId: l.p._id, quantity: l.n })), note,
      })
      const s = { _id: g._id, status: g.status, lines: lines.map(l => ({ name: l.p.name, n: l.n, price: l.p.price })), sum }
      setSent(s); sessionStorage.setItem(storeKey, JSON.stringify(s))
      setCart({}); setNote(''); setSheet(false)
      loadBill()
    } catch (err) {
      const d = err.response?.data
      if (d?.code && ERRORS[d.code]) setError(d)
      else toast.error(d?.message || 'Yuborib bo\'lmadi')
    } finally { setSending(false) }
  }
  const newOrder = () => { setSent(null); sessionStorage.removeItem(storeKey) }

  if (error) {
    const [Icon, title, text] = ERRORS[error.code] || [QrCode, 'Menyuni ochib bo\'lmadi', error.message]
    return (
      <div className="g-center">
        <div className="empty-icon"><Icon size={30} strokeWidth={1.6}/></div>
        <h1 className="g-h1">{title}</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 320 }}>{text}</p>
        <button className="btn btn-dark btn-lg" style={{ marginTop: 14 }} onClick={load}><RefreshCw size={19}/> Qayta urinish</button>
      </div>
    )
  }
  if (!data) return <div className="g-center"><div className="spinner"/></div>

  const logo = data.brand.logo
  const head = (
    <header className="g-head">
      <span className="logo-mark" style={{ width: 40, height: 40, borderRadius: 12, fontSize: 18 }}>
        {logo && (logo.startsWith('/') || logo.startsWith('http')) ? <img src={fileUrl(logo)} alt=""/> : (data.brand.name.replace(/[^A-Za-z]/g, '')[0] || 'R').toUpperCase()}
      </span>
      <b className="truncate" style={{ flex: 1 }}>{data.brand.name}</b>
      <span className="g-table"><small>{data.table.label ? `${data.table.label.toUpperCase()} · STOL` : 'STOL'}</small>{String(data.table.number).padStart(2, '0')}</span>
    </header>
  )

  // Buyurtma yuborilgandan keyingi holat
  if (sent) {
    const st = {
      new:      [Clock, 'Buyurtmangiz yuborildi', 'Ofitsant tasdiqlashini kuting — odatda bir necha daqiqa.'],
      accepted: [Check, 'Qabul qilindi', 'Buyurtmangiz oshxonaga yuborildi. Yoqimli ishtaha!'],
      rejected: [X, 'Qabul qilinmadi', 'Batafsil ma\'lumot uchun ofitsantga murojaat qiling.'],
    }[sent.status] || []
    const [Icon, title, text] = st
    return (
      <div className="g-page">
        {head}
        <div className="g-center" style={{ minHeight: 'auto', paddingTop: 48 }}>
          <div className={`g-status ${sent.status}`}>{sent.status === 'new' ? <span className="spinner"/> : <Icon size={34}/>}</div>
          <h1 className="g-h1">{title}</h1>
          <p className="muted" style={{ margin: 0, maxWidth: 320 }}>{text}</p>
        </div>
        <div className="label" style={{ margin: '24px 16px 8px' }}>Shu buyurtma</div>
        <div className="card card-pad mono" style={{ margin: '0 16px', fontSize: 14.5 }}>
          {sent.lines.map((l, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', gap: 8, padding: '3px 0' }}>
              <span className="truncate"><span className="muted">{l.n}×</span> {l.name}</span><span>{money(l.price * l.n)}</span>
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between', borderTop: '1.5px dashed var(--rule-2)', marginTop: 10, paddingTop: 10 }}>
            <span className="label">Jami</span><b style={{ fontSize: 20 }}>{money(sent.sum)}</b>
          </div>
        </div>
        {bill?.open && <>
          <div className="label" style={{ margin: '20px 16px 8px' }}>Stol hisobi (barcha buyurtmalar)</div>
          <div style={{ margin: '0 16px 20px' }}><Bill bill={bill}/></div>
        </>}
        {sent.status !== 'new' && (
          <div style={{ padding: '0 16px', marginTop: bill?.open ? 0 : 20 }}>
            <button className="btn btn-primary btn-xl btn-block" onClick={newOrder}><Plus size={20}/> Yana buyurtma berish</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="g-page">
      {head}
      <div className="g-tabs tabs">
        {cats.map(c => <button key={c} className={`tab ${cat === c ? 'cur' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="menu-grid g-grid">
        {shown.map(p => {
          const n = cart[p._id] || 0
          return (
            <div key={p._id} className={`pcard ${n ? 'cur' : ''}`}>
              <div className="pcard-ph" onClick={() => add(p._id)}>
                <Photo src={p.image} name={p.name}/>
                {n > 0 && <span className="pcard-badge">{n}</span>}
              </div>
              <div className="pcard-body">
                <span className="pcard-name">{p.name}</span>
                <span className="pcard-foot">
                  <span className="pcard-price">{money(p.price)}</span>
                  <span className="row" style={{ gap: 6 }}>
                    {n > 0 && <button className="pcard-btn" onClick={() => dec(p._id)} aria-label="Kamaytirish"><Minus size={20}/></button>}
                    <button className="pcard-btn" onClick={() => add(p._id)} aria-label="Qo'shish"><Plus size={20}/></button>
                  </span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {bill?.open && !count && !sheet && !billOpen && (
        <button className="g-cart" style={{ background: 'var(--sel)', color: 'var(--sel-ink)', boxShadow: '0 18px 30px -12px rgba(0,0,0,.45)' }} onClick={() => setBillOpen(true)}>
          <ReceiptText size={24}/>
          <span style={{ flex: 1, textAlign: 'left' }}><b style={{ display: 'block' }}>Stol hisobi</b><span className="mono" style={{ fontSize: 13, opacity: .7 }}>{bill.items.reduce((s, i) => s + i.quantity, 0)} ta taom</span></span>
          <b className="mono">{money(bill.total)}</b>
        </button>
      )}

      {billOpen && (
        <div className="g-sheet-bg" onClick={e => e.target === e.currentTarget && setBillOpen(false)}>
          <div className="g-sheet rise">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <b style={{ fontSize: 20 }}>{tableName} hisobi</b>
              <button className="btn btn-ghost btn-icon" onClick={() => setBillOpen(false)} aria-label="Yopish"><X size={22}/></button>
            </div>
            <div style={{ overflowY: 'auto' }}><Bill bill={bill}/></div>
            <p className="muted" style={{ fontSize: 13, margin: '10px 2px 0' }}>To'lov uchun ofitsantni chaqiring. Hisob yopilguncha shu yerda ko'rinadi.</p>
          </div>
        </div>
      )}

      {count > 0 && !sheet && (
        <button className="g-cart" onClick={() => setSheet(true)}>
          <span className="pcard-badge" style={{ position: 'static', boxShadow: 'none' }}>{count}</span>
          <span style={{ flex: 1, textAlign: 'left' }}><b style={{ display: 'block' }}>Buyurtmani ko'rish</b><span className="mono" style={{ fontSize: 13, opacity: .7 }}>{money(sum)} so'm</span></span>
          <ShoppingBag size={22}/>
        </button>
      )}

      {sheet && (
        <div className="g-sheet-bg" onClick={e => e.target === e.currentTarget && setSheet(false)}>
          <div className="g-sheet rise">
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <b style={{ fontSize: 20 }}>Buyurtmangiz</b>
              <button className="btn btn-ghost btn-icon" onClick={() => setSheet(false)} aria-label="Yopish"><X size={22}/></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {lines.map(({ p, n }) => (
                <div key={p._id} className="g-line">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="mono muted" style={{ fontSize: 13 }}>{money(p.price)} × {n}</div>
                  </div>
                  <div className="r-steps" style={{ margin: 0 }}>
                    <button onClick={() => dec(p._id)} aria-label="Kamaytirish"><Minus size={18}/></button>
                    <button onClick={() => add(p._id)} aria-label="Ko'paytirish"><Plus size={18}/></button>
                  </div>
                  <b className="mono" style={{ width: 84, textAlign: 'right' }}>{money(p.price * n)}</b>
                </div>
              ))}
              <input className="input" style={{ marginTop: 12 }} value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Izoh: achchiq bo'lmasin, piyozsiz…"/>
            </div>
            <div style={{ borderTop: '1.5px dashed var(--rule-2)', marginTop: 12, paddingTop: 12 }}>
              {fee > 0 && <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>Xizmat haqi {data.serviceFeePercent}%</span><span className="mono">{money(fee)}</span></div>}
              <div className="row" style={{ justifyContent: 'space-between', margin: '4px 0 14px' }}>
                <span className="label">Jami</span><b className="mono" style={{ fontSize: 26, letterSpacing: '-.04em' }}>{money(sum + fee)}</b>
              </div>
              <button className="send-btn" onClick={submit} disabled={sending || !count}>
                <span><b>{sending ? 'Yuborilmoqda…' : 'Buyurtma berish'}</b><small>{tableName} · ofitsant tasdiqlaydi</small></span>
                {sending ? <span className="spinner-sm"/> : <Check size={26}/>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

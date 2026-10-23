import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Plus, Minus, Trash2, Send, X, MessageSquareText, Eraser, UtensilsCrossed, ArrowRightLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSections } from '../../utils/sections.js'
import API from '../../api/api.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { createSocket } from '../../api/socket.js'
import { isTerminal, lockSoon } from '../../utils/terminal.js'
import SyncBadge from '../../components/shared/SyncBadge.jsx'
import MoveTableModal from './MoveTableModal.jsx'
import FoodImage from '../../components/shared/FoodImage.jsx'
import { enqueueOrder, genClientId } from '../../utils/offlineQueue.js'
import { BrandMark, usePosBase, money, initials, fileUrl, minutesSince, fmtDuration, Loading, Empty } from '../../components/ui.jsx'

const ALL = 'Barchasi'

// Rasm shakliga qarab joylashadi (components/shared/FoodImage.jsx)
const Photo = ({ src, name }) => <FoodImage src={src ? fileUrl(src) : ''} name={name}/>

export default function OrderCreate() {
  const { label: sectionLabel } = useSections()
  const { tableId } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const base = usePosBase()
  const { user } = useAuth()
  const { settings } = useSettings()
  const isSoboy = !tableId || tableId === 'soboy'

  const [table, setTable] = useState(state?.table || null)
  const [products, setProducts] = useState([])
  const [cat, setCat] = useState(ALL)
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState({})          // { productId: qty }
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [current, setCurrent] = useState(null)  // stolning ochiq buyurtmasi
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const searchRef = useRef()

  const loadCurrent = async () => {
    if (isSoboy) return
    try {
      const { data } = await API.get('/api/orders?status=pending')
      setCurrent(data.find(o => String(o.tableId) === tableId) || null)
    } catch {}
  }

  useEffect(() => {
    const jobs = [API.get('/api/products').then(r => setProducts(r.data))]
    if (!isSoboy) {
      jobs.push(loadCurrent())
      if (!state?.table) jobs.push(API.get('/api/tables').then(r => setTable(r.data.find(t => t._id === tableId) || null)))
    }
    Promise.all(jobs).catch(() => toast.error("Menyuni yuklab bo'lmadi")).finally(() => setLoading(false))

    const s = createSocket()
    s.on('orderUpdated', o => {
      if (String(o.tableId) === tableId) setCurrent(o)
      else setCurrent(c => (c && c._id === o._id ? null : c))   // boshqa stolga ko'chirildi
    })
    s.on('orderClosed', id => setCurrent(c => (c && c._id === id ? null : c)))
    s.on('syncApplied', ({ colls }) => {
      if (colls.includes('products')) API.get('/api/products').then(r => setProducts(r.data)).catch(() => {})
      if (colls.includes('orders')) loadCurrent()
    })
    return () => s.disconnect()
  }, [tableId])

  useEffect(() => { if (searching) searchRef.current?.focus() }, [searching])

  const cats = useMemo(() => {
    const m = {}
    for (const p of products) m[p.category] = (m[p.category] || 0) + 1
    return [[ALL, products.length], ...Object.entries(m)]
  }, [products])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return products.filter(p => (s ? p.name.toLowerCase().includes(s) : cat === ALL || p.category === cat))
  }, [products, cat, q])

  const byId = useMemo(() => Object.fromEntries(products.map(p => [p._id, p])), [products])
  const lines = Object.entries(cart).filter(([id, n]) => n > 0 && byId[id]).map(([id, n]) => ({ p: byId[id], n }))
  const newCount = lines.reduce((s, l) => s + l.n, 0)
  const newSum = lines.reduce((s, l) => s + l.p.price * l.n, 0)

  const sentItems = current?.items || []
  const sentSum = sentItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const extrasSum = (current?.extras || []).reduce((s, e) => s + (e.extraFee || 0), 0)
  const feePct = !isSoboy && settings.serviceFeeEnabled ? Number(settings.serviceFeePercent) || 0 : 0
  const fee = Math.round((sentSum + newSum) * feePct / 100)
  const total = sentSum + newSum + extrasSum + fee

  const add = id => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }))
  const dec = id => setCart(c => {
    const n = (c[id] || 0) - 1
    const next = { ...c }
    if (n > 0) next[id] = n; else delete next[id]
    return next
  })
  const drop = id => setCart(c => { const next = { ...c }; delete next[id]; return next })

  const leave = () => {
    if (newCount && !confirm("Yuborilmagan taomlar bor. Chiqib ketilsinmi?")) return
    navigate(base)
  }

  const submit = async () => {
    if (!lines.length || sending) return
    setSending(true)

    // Idempotency uchun clientId — takror yuborilsa ham server bitta buyurtma yaratadi
    const payload = {
      clientId: genClientId(),
      tableId: isSoboy ? null : tableId,
      tableNumber: table?.number,
      category: isSoboy ? 'soboy' : table?.category || 'zal',
      waiterName: user?.name,
      note: note.trim(),
      items: lines.map(l => ({ productId: l.p._id, quantity: l.n })),
    }

    const done = () => {
      // Monoblok (terminal) rejimida buyurtmadan keyin bir necha soniyada PIN ekrani (vaqti — kassa sozlamasi)
      if (isTerminal()) lockSoon()
      navigate(base)
    }
    const saveOffline = async (msg) => {
      try {
        await enqueueOrder(payload)
        toast.success(msg, { icon: '📴', duration: 4000 })
        done()
      } catch {
        toast.error('Saqlab bo\'lmadi')
        setSending(false)
      }
    }

    // Internet yo'q — to'g'ridan-to'g'ri navbatga saqlaymiz
    if (!navigator.onLine) return saveOffline('Offline: buyurtma navbatga saqlandi, ulanish tiklanganda yuboriladi')

    try {
      await API.post('/api/orders', payload)
      toast.success(isSoboy ? 'Soboy buyurtma yuborildi' : `${sectionLabel(table?.category)} · Stol ${table?.number} — oshxonaga yuborildi`)
      done()
    } catch (err) {
      // So'rov serverga yetmadi — offline navbatga
      if (!err.response) return saveOffline('Internet uzildi — buyurtma navbatga saqlandi')
      toast.error(err.response?.data?.message || 'Yuborib bo\'lmadi')
      setSending(false)
    }
  }

  const title = isSoboy ? 'Soboy' : `Stol ${table?.number ?? ''}`
  const sub = [
    isSoboy ? 'Olib ketish' : sectionLabel(table?.category),
    current && fmtDuration(minutesSince(current.createdAt)),
    user?.name?.split(' ')[0],
  ].filter(Boolean).join(' · ')

  const receipt = (
    <>
      <div className="receipt">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span className="r-title">{title}</span>
            <span className="label">{sub}</span>
          </div>
          <div className="mono muted" style={{ textAlign: 'right', fontSize: 12.5 }}>
            {new Date(current?.createdAt || Date.now()).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {sentItems.length > 0 && <>
          <hr/><div className="label" style={{ marginBottom: 4 }}>Oshxonada</div>
          {sentItems.map((i, k) => (
            <div key={k} className="r-line">
              <span className="q">{i.quantity}×</span><span className="n truncate">{i.name}</span><span>{money(i.price * i.quantity)}</span>
            </div>
          ))}
        </>}

        <hr/>
        <div className="label" style={{ marginBottom: 6 }}>{sentItems.length ? "Qo'shimcha" : 'Yangi buyurtma'}</div>
        {lines.length === 0 ? (
          <div className="muted" style={{ padding: '18px 0', textAlign: 'center', fontFamily: 'var(--font)', fontSize: 15 }}>
            Taom tanlang — chap tomondagi kartani bosing
          </div>
        ) : lines.map(({ p, n }) => (
          <div key={p._id} className="r-new">
            <div className="r-line">
              <span className="q">{n}×</span><span className="n truncate">{p.name}</span><span>{money(p.price * n)}</span>
              <div className="r-steps">
                <button onClick={() => dec(p._id)} aria-label="Kamaytirish"><Minus size={18}/></button>
                <button onClick={() => add(p._id)} aria-label="Ko'paytirish"><Plus size={18}/></button>
                <button onClick={() => drop(p._id)} aria-label="O'chirish" style={{ marginLeft: 'auto' }}><Trash2 size={17}/></button>
              </div>
            </div>
          </div>
        ))}

        {(noteOpen || note) && (
          <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Oshpazga izoh: achchiq bo'lmasin, piyozsiz…" style={{ marginTop: 12, fontFamily: 'var(--font)' }}/>
        )}

        <hr/>
        {extrasSum > 0 && <div className="r-row"><span>Qo'shimcha to'lov</span><span>{money(extrasSum)}</span></div>}
        {feePct > 0 && <div className="r-row"><span>Xizmat haqi {feePct}%</span><span>{money(fee)}</span></div>}
        <div className="r-total"><span className="label">Jami</span><b>{money(total)}</b></div>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <button className="btn btn-soft btn-lg" style={{ flex: 1 }} onClick={() => setNoteOpen(o => !o)}>
          <MessageSquareText size={20}/> Izoh
        </button>
        <button className="btn btn-soft btn-lg" style={{ flex: 1 }} disabled={!newCount} onClick={() => { setCart({}); setNote('') }}>
          <Eraser size={20}/> Tozalash
        </button>
      </div>
      <button className="send-btn" disabled={!newCount || sending} onClick={submit}>
        <span>
          <b>{sending ? 'Yuborilmoqda…' : 'Oshxonaga yuborish'}</b>
          <small>{newCount ? `${newCount} ta yangi taom · ${money(newSum)}` : "Savat bo'sh"}</small>
        </span>
        {sending ? <span className="spinner-sm"/> : <Send size={28} strokeWidth={2}/>}
      </button>
    </>
  )

  return (
    <div className="pos">
      <section className="pos-main">
        <header className="topbar">
          <button className="bar-btn" onClick={leave} aria-label="Orqaga"><ArrowLeft size={24}/></button>
          <div className="brand hide-mobile"><BrandMark size={42}/><div><b>{settings.brandName}</b><small>Ofitsant</small></div></div>
          <div className="vr hide-mobile"/>
          <div className="brand"><div><b style={{ fontSize: 19 }}>{title}</b><small>{sub}</small></div></div>
          <div className="right">
            {current && !isSoboy && (
              <button className="btn btn-soft btn-lg" onClick={() => setMoveOpen(true)} title="Mehmonlarni boshqa stolga ko'chirish">
                <ArrowRightLeft size={20}/><span className="hide-mobile">Ko'chirish</span>
              </button>
            )}
            <SyncBadge/>
          </div>
        </header>

        <div className="pos-tabs">
          {searching ? (
            <div className="input-icon" style={{ flex: 1 }}>
              <Search size={20}/>
              <input ref={searchRef} className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Taom nomini yozing…"/>
            </div>
          ) : (
            <div className="tabs">
              {cats.map(([c, n]) => (
                <button key={c} className={`tab ${cat === c ? 'cur' : ''}`} onClick={() => setCat(c)}>{c}<sup>{n}</sup></button>
              ))}
            </div>
          )}
          <button className="tab" onClick={() => { setSearching(s => !s); setQ('') }} aria-label="Qidirish">
            {searching ? <X size={20}/> : <><Search size={19}/><span className="hide-mobile">Qidirish</span></>}
          </button>
        </div>

        <div className="pos-scroll">
          {loading ? <Loading/> : shown.length === 0 ? (
            <Empty icon={UtensilsCrossed} title={q ? 'Hech narsa topilmadi' : "Menyu bo'sh"}
              text={q ? `«${q}» bo'yicha taom yo'q` : "Taomlarni admin panelidagi «Taomlar» bo'limida qo'shing."}/>
          ) : <>
            <div className="menu-head">
              <h2>{q ? 'Qidiruv' : cat}</h2>
              <span className="label">{shown.length} ta taom</span>
            </div>
            <div className="menu-grid">
              {shown.map(p => {
                const n = cart[p._id] || 0
                return (
                  <button key={p._id} className={`pcard ${n ? 'cur' : ''}`} onClick={() => add(p._id)}>
                    <div className="pcard-ph">
                      <Photo src={p.image} name={p.name}/>
                      {n > 0 && <span className="pcard-badge">{n}</span>}
                    </div>
                    <div className="pcard-body">
                      <span className="pcard-name">{p.name}</span>
                      <span className="pcard-desc">{p.category}</span>
                      <span className="pcard-foot">
                        <span className="pcard-price">{money(p.price)}</span>
                        <span className="pcard-btn" onClick={n ? e => { e.stopPropagation(); dec(p._id) } : undefined}>
                          {n ? <Minus size={22} strokeWidth={2}/> : <Plus size={22} strokeWidth={2}/>}
                        </span>
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </>}
        </div>
      </section>

      <aside className="side as-panel">{receipt}</aside>

      <MoveTableModal open={moveOpen} order={current} onClose={() => setMoveOpen(false)}
        onMoved={(order, t) => {
          setMoveOpen(false); setTable(t); setCurrent(order)
          navigate(`${base}/order/${t._id}`, { replace: true, state: { table: t } })
        }}/>

      {/* Telefon: pastki savat paneli va chek oynasi */}
      {(newCount > 0 || sentItems.length > 0) && !sheet && (
        <button className="cart-bar" onClick={() => setSheet(true)}>
          <span className="pcard-badge" style={{ position: 'static', boxShadow: 'none' }}>{newCount || sentItems.length}</span>
          <span style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ display: 'block', fontSize: 16 }}>Chekni ko'rish</b>
            <span className="mono" style={{ fontSize: 13, opacity: .7 }}>{money(total)} so'm</span>
          </span>
          <span className="btn btn-primary" style={{ pointerEvents: 'none' }}>Davom</span>
        </button>
      )}
      {sheet && (
        <div className="sheet" onClick={e => e.target === e.currentTarget && setSheet(false)}>
          <div className="side rise">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b style={{ fontSize: 18 }}>Chek</b>
              <button className="btn btn-ghost btn-icon" onClick={() => setSheet(false)} aria-label="Yopish"><X size={22}/></button>
            </div>
            {receipt}
          </div>
        </div>
      )}
    </div>
  )
}

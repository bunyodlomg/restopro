import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Plus, Minus, Trash2, ArrowLeft,
  CheckCircle, X, Printer, ChefHat, Wallet, CreditCard, Pause
} from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { API_URL } from '../../config.js'
import { useAuth } from '../../context/AuthContext.jsx'

function ProductImg({ src, name }) {
  const [err, setErr] = useState(false)
  if (!src || err) return (
    <div className="pos-img-fallback">
      <span>🍽️</span>
    </div>
  )
  return (
    <img src={src.startsWith('http') ? src : `${API_URL}${src}`} alt={name}
      className="pos-img"
      onError={() => setErr(true)}/>
  )
}

const CAT_COLORS = {
  'Barchasi':    'var(--brand)',
  '1-Taomlar':   '#3B82F6',
  '2-Taomlar':   '#8B5CF6',
  'Kaboblar':    '#EF4444',
  'Salatlar':    '#22C55E',
  'Ichimliklar': '#06B6D4',
  'Desertlar':   '#EC4899',
  "Qo'shimcha":  '#F59E0B',
}
const FALLBACK_PALETTE = ['#3B82F6','#8B5CF6','#EF4444','#22C55E','#06B6D4','#EC4899','#F59E0B','#14B8A6','#F43F5E','#A855F7']
const colorFor = (cat, idx) => CAT_COLORS[cat] || FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]

export default function OrderCreate() {
  const { tableId } = useParams()
  const { state }   = useLocation()
  const navigate    = useNavigate()
  const { user }    = useAuth()
  const table       = state?.table
  const isSoboy     = tableId === 'soboy' || table?.category === 'soboy'

  const [products, setProducts] = useState([])
  const [cats,     setCats]     = useState(['Barchasi'])
  const [cat,      setCat]      = useState('Barchasi')
  const [q,        setQ]        = useState('')
  const [cart,     setCart]     = useState({})
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [orderNo]               = useState(() => Math.floor(100000 + Math.random()*900000))
  const searchRef               = useRef(null)

  useEffect(() => {
    Promise.all([API.get('/api/products'), API.get('/api/products/categories')])
      .then(([p, c]) => {
        setProducts(p.data)
        setCats(['Barchasi', ...(c.data || [])])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [tableId])

  const filtered = useMemo(() => products.filter(p =>
    (cat === 'Barchasi' || p.category === cat) &&
    (p.name?.toLowerCase().includes(q.toLowerCase()))
  ), [products, cat, q])

  const addToCart = prod => setCart(prev => ({
    ...prev,
    [prod._id]: { product: prod, qty: (prev[prod._id]?.qty || 0) + 1 }
  }))
  const removeFromCart = id => setCart(prev => {
    const e = prev[id]
    if (!e || e.qty <= 1) { const n = {...prev}; delete n[id]; return n }
    return { ...prev, [id]: { ...e, qty: e.qty - 1 } }
  })
  const clearItem = id => setCart(prev => { const n={...prev}; delete n[id]; return n })

  const cartItems = Object.values(cart).filter(i => i.qty > 0)
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0)
  const cartTotal = cartItems.reduce((s, i) => s + i.product.price * i.qty, 0)

  const submit = async () => {
    if (!cartItems.length) return toast.error('Taom tanlang!')
    setSending(true)
    try {
      await API.post('/api/orders', {
        tableId:     isSoboy ? null : tableId,
        tableNumber: table?.number,
        category:    table?.category || 'zal',
        waiterName:  user?.name,
        items:       cartItems.map(i => ({
          productId: i.product._id,
          name:      i.product.name,
          price:     i.product.price,
          quantity:  i.qty,
        })),
      })
      toast.success('Buyurtma yuborildi! 🎉')
      navigate('/waiter')
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
    finally { setSending(false) }
  }

  const hold = () => {
    if (!cartItems.length) return toast('Savat bo\'sh', { icon: 'ℹ️' })
    toast.success('Buyurtma kutish ro\'yxatiga qo\'shildi')
  }
  const cancel = () => {
    if (!cartItems.length) return navigate('/waiter')
    if (confirm('Buyurtmani bekor qilishni xohlaysizmi?')) setCart({})
  }

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100%', minHeight:400 }}>
      <div className="spinner"/>
    </div>
  )

  const tableTitle = isSoboy
    ? '🍱 Soboy buyurtma'
    : `${table?.category === 'xona' ? '🚪' : table?.category === "ko'cha" ? '🌳' : '🪑'} Stol ${table?.number}`

  const renderOrderPanel = (embedded = false) => (
    <div className={`pos-order-panel ${embedded ? 'pos-order-panel--embedded' : ''}`}>
      <div className="pos-order-head">
        <div>
          <div className="pos-order-num">Buyurtma #{orderNo}</div>
          <div className="pos-order-sub">{tableTitle}{user?.name ? ` • ${user.name}` : ''}</div>
        </div>
        <div className="pos-order-actions">
          <button className="pos-pill pos-pill--hold" onClick={hold}><Pause size={14}/>Kutish</button>
          <button className="pos-pill pos-pill--cancel" onClick={cancel}><X size={14}/>Bekor</button>
        </div>
      </div>

      <div className="pos-order-items">
        {cartItems.length === 0 ? (
          <div className="pos-empty">
            <div style={{ fontSize:'3rem', marginBottom:8 }}>🛒</div>
            <p>Savat bo'sh</p>
            <small>Mahsulot tanlang</small>
          </div>
        ) : cartItems.map(({ product, qty }) => (
          <div key={product._id} className="pos-line">
            <div className="pos-line-main">
              <div className="pos-line-name">{product.name}</div>
              <div className="pos-line-meta">{Number(product.price).toLocaleString()} so'm</div>
            </div>
            <div className="pos-line-qty">
              <button className="pos-qty pos-qty--minus" onClick={() => removeFromCart(product._id)}><Minus size={14}/></button>
              <span>{qty}</span>
              <button className="pos-qty pos-qty--plus" onClick={() => addToCart(product)}><Plus size={14}/></button>
            </div>
            <div className="pos-line-price">{(product.price * qty).toLocaleString()}</div>
            <button className="pos-line-del" onClick={() => clearItem(product._id)} title="O'chirish">
              <Trash2 size={13}/>
            </button>
          </div>
        ))}
      </div>

      <div className="pos-order-foot">
        <div className="pos-totals">
          <div className="pos-total-row">
            <span>Mahsulotlar</span>
            <span>{cartCount} ta</span>
          </div>
          <div className="pos-total-row">
            <span>Oraliq jami</span>
            <span>{cartTotal.toLocaleString()} so'm</span>
          </div>
          <div className="pos-total-row pos-total-row--grand">
            <span>JAMI</span>
            <span>{cartTotal.toLocaleString()} so'm</span>
          </div>
        </div>

        <div className="pos-quick-actions">
          <button className="pos-quick" disabled={!cartItems.length} onClick={() => toast('Chop berish — tez kunda', { icon:'🖨️' })}>
            <Printer size={18}/><span>Chek</span>
          </button>
          <button className="pos-quick" disabled={!cartItems.length} onClick={submit}>
            <ChefHat size={18}/><span>Oshxona</span>
          </button>
          <button className="pos-quick" disabled={!cartItems.length} onClick={() => toast('Kassa — tez kunda', { icon:'💰' })}>
            <Wallet size={18}/><span>Kassa</span>
          </button>
          <button className="pos-quick" disabled={!cartItems.length} onClick={() => toast('Karta to\'lov — tez kunda', { icon:'💳' })}>
            <CreditCard size={18}/><span>Karta</span>
          </button>
        </div>

        <button className="pos-pay" disabled={sending || !cartItems.length} onClick={submit}>
          {sending
            ? <><span className="spinner-sm"/> Yuborilmoqda...</>
            : <><CheckCircle size={20}/> To'lov · {cartTotal.toLocaleString()} so'm</>
          }
        </button>
      </div>
    </div>
  )

  return (
    <div className="pos-root">
      {/* TOP BAR */}
      <div className="pos-topbar">
        <button onClick={() => navigate('/waiter')} className="pos-back">
          <ArrowLeft size={16}/> Orqaga
        </button>

        <div className="pos-table-info">
          <div className="pos-table-title">{tableTitle}</div>
          <div className="pos-table-sub">{isSoboy ? 'Olib ketish' : table?.category}</div>
        </div>

        <div className="pos-search">
          <Search size={16} className="pos-search-ic"/>
          <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Taom qidirish..." className="pos-search-input"/>
          {q && <button className="pos-search-clear" onClick={() => setQ('')}><X size={14}/></button>}
        </div>

        <button className="pos-cart-fab show-mobile-only" onClick={() => setShowCart(true)}>
          <ShoppingCart size={18}/>
          {cartCount > 0 && <span className="pos-cart-fab-badge">{cartCount}</span>}
        </button>
      </div>

      {/* CATEGORIES */}
      <div className="pos-cats no-scrollbar">
        {cats.map((c, i) => {
          const active = cat === c
          const color  = colorFor(c, i)
          return (
            <button key={c} onClick={() => setCat(c)}
              className={`pos-cat ${active ? 'pos-cat--active' : ''}`}
              style={{
                '--cat-color': color,
                background: active ? color : 'var(--wai-card)',
                borderColor: active ? color : 'var(--wai-border)',
                color: active ? '#fff' : 'var(--wai-text2)',
                boxShadow: active ? `0 4px 14px ${color}55` : 'none',
              }}>
              {c}
            </button>
          )
        })}
      </div>

      {/* MAIN */}
      <div className="pos-main">
        <div className="pos-products">
          {filtered.length === 0 ? (
            <div className="pos-empty pos-empty--center">
              <div style={{ fontSize:'3rem' }}>🔍</div>
              <p>Topilmadi</p>
              <button onClick={() => { setQ(''); setCat('Barchasi') }} className="pos-pill pos-pill--ghost">
                Barchasini ko'rsatish
              </button>
            </div>
          ) : (
            <div className="pos-grid">
              {filtered.map((prod, i) => {
                const inCart = cart[prod._id]
                const qty    = inCart?.qty || 0
                const color  = colorFor(prod.category, i)
                return (
                  <button key={prod._id} onClick={() => addToCart(prod)}
                    className={`pos-tile ${qty > 0 ? 'pos-tile--active' : ''}`}
                    style={{ '--tile-color': color }}>
                    {prod.image
                      ? <div className="pos-tile-img"><ProductImg src={prod.image} name={prod.name}/></div>
                      : <div className="pos-tile-color" style={{ background: `linear-gradient(135deg, ${color}, ${color}CC)` }}/>
                    }
                    {qty > 0 && <div className="pos-tile-badge">{qty}</div>}
                    <div className="pos-tile-body">
                      <div className="pos-tile-name">{prod.name}</div>
                      <div className="pos-tile-price">{Number(prod.price).toLocaleString()} so'm</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <aside className="pos-side hide-mobile">
          {renderOrderPanel()}
        </aside>
      </div>

      {/* Mobile drawer */}
      {showCart && (
        <div className="modal-overlay show-mobile-only" onClick={e => e.target === e.currentTarget && setShowCart(false)}>
          <div className="pos-drawer">
            <div className="pos-drawer-head">
              <h3>🛒 Savatcha ({cartCount} ta)</h3>
              <button onClick={() => setShowCart(false)} className="pos-icon-btn"><X size={16}/></button>
            </div>
            {renderOrderPanel(true)}
          </div>
        </div>
      )}

      {/* Mobile sticky pay bar */}
      {cartCount > 0 && !showCart && (
        <div className="pos-mobile-bar show-mobile-only">
          <button onClick={() => setShowCart(true)} className="pos-mobile-bar-btn">
            <span>
              <ShoppingCart size={18}/>
              <span className="pos-mobile-bar-count">{cartCount}</span>
              Savatcha
            </span>
            <span>{cartTotal.toLocaleString()} so'm →</span>
          </button>
        </div>
      )}
    </div>
  )
}

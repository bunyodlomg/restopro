import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { io } from 'socket.io-client'
import { Bell, BellOff, CheckCircle, XCircle, Clock, Printer, Percent } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { API_URL } from '../../config.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { buildReceiptHTML } from '../../utils/receipt.js'

const CAT = {
  zal:    { label:'Zal',    emoji:'🪑', color:'#3B82F6' },
  xona:   { label:'Xona',   emoji:'🚪', color:'#8B5CF6' },
  "ko'cha":{ label:"Ko'cha",emoji:'🌳', color:'#22C55E' },
  soboy:  { label:'Soboy',  emoji:'🍱', color:'#F59E0B' },
}

function printReceipt(order, settings) {
  // Chek dizayni Sozlamalardagi `settings.receipt` orqali boshqariladi
  const html = buildReceiptHTML(order, settings)
  const w = window.open('', '_blank', 'width=340,height=640')
  if (!w) { toast.error('Printer oynasi blok qilindi. Brauzer ruxsatini tekshiring.', { duration:5000 }); return }
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => {
    try { w.print(); setTimeout(() => w.close(), 1000) }
    catch (e) { toast.error('Print qilinmadi: ' + e.message, { duration:5000 }) }
  }, 300)
}

function OrderCard({ order, onClose, onDelete, settings }) {
  const cat = CAT[order.category] || { label: order.category, emoji:'📋', color:'#888' }
  const items = order.items || []
  const extras = order.extras || []
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0)
                 + extras.reduce((s, e) => s + (e.extraFee || 0), 0)
  const fee = order.serviceFee || 0
  const total = subtotal + fee
  const time = new Date(order.createdAt).toLocaleTimeString('uz-UZ', { hour:'2-digit', minute:'2-digit' })

  return (
    <div className="bento animate-slide-up" style={{ '--b-tone': cat.color, padding:0, overflow:'hidden' }}>
      {/* Colored header bar */}
      <div style={{
        background: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)`,
        padding:'0.95rem 1.1rem', color:'#fff',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.7rem', minWidth:0 }}>
          <div style={{
            width:42, height:42, borderRadius:13, flexShrink:0,
            background:'rgba(255,255,255,0.22)', display:'flex',
            alignItems:'center', justifyContent:'center', fontSize:'1.3rem',
          }}>{cat.emoji}</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.05rem' }}>
              {order.category === 'soboy' ? `Soboy #${order.tableNumber}` : `Stol ${order.tableNumber}`}
            </div>
            <div style={{ fontSize:'0.75rem', opacity:0.9, marginTop:2 }}>
              {order.waiterName && `👤 ${order.waiterName} · `}{time}
            </div>
          </div>
        </div>
        <span style={{
          background:'rgba(255,255,255,0.22)', padding:'4px 10px', borderRadius:100,
          fontSize:'0.72rem', fontWeight:800, display:'flex', alignItems:'center', gap:4,
        }}><Clock size={12}/> KUTILMOQDA</span>
      </div>

      {/* Items */}
      <div style={{ padding:'1rem 1.1rem', display:'flex', flexDirection:'column', gap:8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.6rem' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', minWidth:0 }}>
              <span style={{
                display:'flex', alignItems:'center', justifyContent:'center',
                width:28, height:28, borderRadius:9, flexShrink:0,
                background: `${cat.color}1e`, color: cat.color,
                fontSize:'0.78rem', fontWeight:800,
              }}>{item.quantity}</span>
              <span style={{ fontSize:'0.95rem', color:'var(--text)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {item.name}
              </span>
            </div>
            <span style={{ fontSize:'0.85rem', color:'var(--text-3)', fontWeight:600, flexShrink:0 }}>
              {(item.price * item.quantity).toLocaleString()}
            </span>
          </div>
        ))}
        {extras.length > 0 && (
          <div style={{ paddingTop:8, marginTop:4, borderTop:'1px dashed var(--border)' }}>
            {extras.map((ex, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', color:'var(--text-3)', padding:'2px 0' }}>
                <span>+ {ex.comment || "Qo'shimcha"}</span>
                <span>{(ex.extraFee || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        {fee > 0 && order.category !== 'soboy' && (
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', padding:'8px 0 0', borderTop:'1px solid var(--border)', marginTop:4 }}>
            <span style={{ color:'var(--text-3)', display:'flex', alignItems:'center', gap:4 }}>
              <Percent size={12}/> Xizmat haqi
            </span>
            <span style={{ color:'var(--accent)', fontWeight:700 }}>{fee.toLocaleString()} so'm</span>
          </div>
        )}
      </div>

      {/* Footer total + actions */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0.9rem 1.1rem', borderTop:'1px solid var(--border)',
        background:'var(--surface)',
      }}>
        <div>
          <div style={{ fontSize:'0.72rem', color:'var(--text-3)', fontWeight:600, marginBottom:2 }}>JAMI</div>
          <div style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.35rem', color: cat.color }}>
            {total.toLocaleString()} <span style={{ fontSize:'0.7rem', color:'var(--text-3)', fontWeight:600 }}>so'm</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={() => printReceipt(order, settings)} title="Chek chiqarish"
            style={{ width:42, height:42, borderRadius:12, cursor:'pointer',
              background:'rgba(59,130,246,0.10)', border:'1px solid rgba(59,130,246,0.25)', color:'#3B82F6',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Printer size={16}/>
          </button>
          <button onClick={() => onDelete(order._id)} className="btn-danger btn-sm" style={{ padding:'0 0.85rem' }}>
            <XCircle size={15}/> Bekor
          </button>
          <button onClick={() => onClose(order._id)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'0 1.1rem', borderRadius:12,
              cursor:'pointer', background:'linear-gradient(135deg,#16a34a,#22c55e)', border:'none',
              color:'#fff', fontSize:'0.88rem', fontWeight:800, fontFamily:'DM Sans,sans-serif',
              boxShadow:'0 4px 14px rgba(34,197,94,0.32)', minHeight:42 }}>
            <CheckCircle size={16}/> Tayyor
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('all')
  const [sound, setSound] = useState(() => localStorage.getItem('rp_sound') === 'true')
  const { settings } = useSettings()

  useEffect(() => {
    API.get('/api/orders')
      .then(({ data }) => setOrders(data.filter(o => o.status === 'pending')))
      .catch(console.error)
      .finally(() => setLoading(false))
    const socket = io(API_URL, { transports:['websocket'], reconnection:true })
    socket.on('newOrder',     o  => setOrders(p => [...p, o]))
    socket.on('orderUpdated', o  => setOrders(p => p.map(x => x._id === o._id ? o : x)))
    socket.on('orderClosed',  id => setOrders(p => p.filter(x => x._id !== id)))
    return () => socket.disconnect()
  }, [])

  const closeOrder = async id => {
    try { await API.put(`/api/orders/${id}/close`); setOrders(p => p.filter(x => x._id !== id)); toast.success('Buyurtma yopildi') }
    catch { toast.error('Xatolik') }
  }
  const deleteOrder = async id => {
    if (!confirm('Bekor qilasizmi?')) return
    try { await API.delete(`/api/orders/${id}`); setOrders(p => p.filter(x => x._id !== id)); toast.success('Bekor qilindi') }
    catch { toast.error('Xatolik') }
  }
  const toggleSound = () => { const v = !sound; setSound(v); localStorage.setItem('rp_sound', String(v)) }
  const cats = ['all', ...Object.keys(CAT)]
  const filtered = catFilter === 'all' ? orders : orders.filter(o => o.category === catFilter)
  const count = k => k === 'all' ? orders.length : orders.filter(o => o.category === k).length

  const totalRevenue = orders.reduce((sum, o) => {
    const itemsTot = (o.items || []).reduce((s, i) => s + i.price * i.quantity, 0)
    return sum + itemsTot + (o.serviceFee || 0)
  }, 0)

  return (
    <div className="page-enter bento-page">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'clamp(1.6rem,3vw,2.2rem)', color:'var(--text)', letterSpacing:'-0.02em' }}>
            🔔 Faol buyurtmalar
          </h1>
          <p style={{ color:'var(--text-3)', fontSize:'1rem', marginTop:4, fontWeight:500 }}>
            {orders.length} ta buyurtma kutilmoqda · {totalRevenue.toLocaleString()} so'm
          </p>
        </div>
        <button onClick={toggleSound} className="btn-ghost"
          style={sound ? { background:'var(--brand-glow)', borderColor:'var(--brand)', color:'var(--brand)' } : {}}>
          {sound ? <Bell size={18}/> : <BellOff size={18}/>}
          {sound ? 'Ovoz yoqiq' : "Ovoz o'chiq"}
        </button>
      </div>

      {/* Category pills */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:'1.5rem' }}>
        {cats.map(k => {
          const cfg = CAT[k] || { label:'Barchasi', emoji:'📋', color:'#F43F5E' }
          const active = catFilter === k
          const cnt = count(k)
          return (
            <button key={k} onClick={() => setCatFilter(k)}
              style={{
                display:'inline-flex', alignItems:'center', gap:8,
                padding:'0.65rem 1.1rem', borderRadius:100,
                background: active
                  ? `linear-gradient(135deg, ${cfg.color}, ${cfg.color}dd)`
                  : 'var(--card)',
                border: `1.5px solid ${active ? cfg.color : 'var(--border)'}`,
                color: active ? '#fff' : 'var(--text-2)',
                fontWeight: 700, fontSize: '0.9rem', cursor:'pointer',
                fontFamily:'DM Sans,sans-serif', minHeight:44,
                boxShadow: active ? `0 6px 18px ${cfg.color}40` : 'none',
              }}>
              <span style={{ fontSize:'1.05rem' }}>{cfg.emoji}</span>
              {k === 'all' ? 'Barchasi' : cfg.label}
              {cnt > 0 && (
                <span style={{
                  minWidth:24, padding:'2px 8px', borderRadius:10,
                  fontSize:'0.72rem', fontWeight:800,
                  background: active ? 'rgba(255,255,255,0.25)' : 'var(--elevated)',
                  color: active ? '#fff' : 'var(--text-3)',
                  textAlign:'center',
                }}>{cnt}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'5rem', gap:'1rem' }}>
          <div className="spinner"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bento bento--mint bento--soft" style={{ textAlign:'center', padding:'4rem 2rem' }}>
          <div style={{ fontSize:'4rem', marginBottom:12 }}>🍽️</div>
          <p style={{ fontWeight:800, fontSize:'1.15rem', color:'var(--text)', marginBottom:6 }}>Buyurtma yo'q</p>
          <p style={{ fontSize:'0.95rem', color:'var(--text-3)' }}>Hozircha hech qaysi stol band emas</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:'1.1rem' }}>
          <AnimatePresence>
            {filtered.map((o, i) => (
              <motion.div key={o._id}
                initial={{ opacity: 0, scale: 0.95, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: -20 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                layout
              >
                <OrderCard order={o} onClose={closeOrder} onDelete={deleteOrder} settings={settings}/>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

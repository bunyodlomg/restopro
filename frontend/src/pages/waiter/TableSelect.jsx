import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { ChevronRight, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { API_URL } from '../../config.js'

const CATS = [
  { k:'zal',    l:'Zal',    e:'🪑', color:'#3B82F6', bg:'rgba(59,130,246,0.1)' },
  { k:'xona',   l:'Xona',   e:'🚪', color:'#8B5CF6', bg:'rgba(139,92,246,0.1)' },
  { k:"ko'cha", l:"Ko'cha", e:'🌳', color:'#22C55E', bg:'rgba(34,197,94,0.1)'  },
  { k:'soboy',  l:'Soboy',  e:'🍱', color:'#F59E0B', bg:'rgba(245,158,11,0.1)' },
]

export default function TableSelect() {
  const [tables,  setTables]  = useState([])
  const [cat,     setCat]     = useState('zal')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const load = async () => {
    if (cat === 'soboy') return
    setLoading(true)
    try {
      const { data } = await API.get(`/api/tables?category=${cat}`)
      setTables(data)
    } catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    if (cat === 'soboy') return
    const s = io(API_URL)
    s.on('tableUpdated', t  => setTables(p => p.map(x  => x._id === t._id ? t : x)))
    s.on('tableCreated', t  => { if (t.category === cat) setTables(p => [...p, t]) })
    s.on('tableDeleted', id => setTables(p => p.filter(x => x._id !== id)))
    return () => s.disconnect()
  }, [cat])

  const pick = (t) => navigate(`/waiter/order/${t._id}`, { state: { table: t } })

  const activeCat = CATS.find(c => c.k === cat)
  const empty = tables.filter(t => t.status !== 'busy').length
  const busy  = tables.filter(t => t.status === 'busy').length

  return (
    <div className="tbl-page">

      {/* Desktop header */}
      <div className="wai-page-head hide-mobile" style={{marginBottom:'1.25rem'}}>
        <h1 style={{fontFamily:'Sora,sans-serif',fontWeight:800,fontSize:'1.5rem',color:'var(--wai-text)',letterSpacing:'-0.02em'}}>Stollar</h1>
        <p style={{color:'var(--wai-text3)',fontSize:'0.9rem',fontWeight:500,marginTop:4}}>
          {activeCat?.e} {activeCat?.l} — {tables.length} ta stol
        </p>
      </div>

      {/* Category tabs */}
      <div className="tbl-cats">
        {CATS.map(({ k, l, e, color, bg }) => {
          const active = cat === k
          return (
            <button key={k} onClick={() => setCat(k)}
              className="tbl-cat"
              style={{
                background: active ? bg : 'var(--wai-card)',
                border: `2px solid ${active ? color : 'var(--wai-border)'}`,
                boxShadow: active ? `0 4px 14px ${color}30` : 'var(--shadow-sm)',
              }}>
              <span className="tbl-cat-emoji" style={{ fontSize:'1.85rem', lineHeight:1 }}>{e}</span>
              <span className="tbl-cat-label" style={{ fontSize:'0.78rem', fontWeight: active ? 700 : 500, color: active ? color : 'var(--wai-text3)' }}>{l}</span>
            </button>
          )
        })}
      </div>

      {/* Soboy special */}
      {cat === 'soboy' ? (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center',
          padding:'2.5rem 1rem', gap:'1.25rem',
          background:'var(--wai-card)', borderRadius:20, border:'1px solid var(--wai-border)',
          maxWidth: 520, margin: '0 auto',
        }}>
          <div style={{ fontSize:'4.5rem' }}>🍱</div>
          <div style={{ textAlign:'center' }}>
            <h3 style={{ fontFamily:'Sora,sans-serif', fontWeight:700, fontSize:'1.15rem', color:'var(--wai-text)', marginBottom:6 }}>
              Soboy buyurtma
            </h3>
            <p style={{ fontSize:'0.9rem', color:'var(--wai-text3)', lineHeight:1.6, maxWidth:280 }}>
              Olib ketish buyurtmalari uchun.<br/>Har bir buyurtma avtomatik raqam oladi.
            </p>
          </div>
          <button onClick={() => navigate('/waiter/order/soboy', { state: { table:{ _id:'soboy', number:0, category:'soboy' } } })}
            style={{
              display:'flex', alignItems:'center', gap:'0.5rem',
              padding:'1rem 2.25rem', borderRadius:16,
              background:'linear-gradient(135deg,#F59E0B,#FBBF24)',
              border:'none', color:'#fff', fontWeight:700, fontSize:'1.05rem',
              fontFamily:'DM Sans,sans-serif', cursor:'pointer',
              boxShadow:'0 4px 16px rgba(245,158,11,0.35)',
            }}>
            <Package size={20}/> Soboy buyurtma boshlash
            <ChevronRight size={18}/>
          </button>
        </div>
      ) : (
        <>
          {/* Stats row */}
          {tables.length > 0 && (
            <div className="tbl-stats">
              {[
                { label:"Bo'sh", count:empty, color:'#22C55E', bg:'rgba(34,197,94,0.08)' },
                { label:'Band',  count:busy,  color:'#F59E0B', bg:'rgba(245,158,11,0.08)' },
                { label:'Jami',  count:tables.length, color:'var(--wai-text3)', bg:'var(--wai-card)' },
              ].map(s => (
                <div key={s.label} style={{ flex:1, padding:'0.75rem 0.5rem', borderRadius:12, background:s.bg, border:'1px solid var(--wai-border)', textAlign:'center' }}>
                  <div style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.35rem', color:s.color }}>{s.count}</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--wai-text3)', fontWeight:500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:'3rem' }}>
              <div className="spinner"/>
            </div>
          ) : tables.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--wai-text3)' }}>
              <p style={{ fontSize:'3rem', marginBottom:'0.75rem' }}>{activeCat?.e}</p>
              <p style={{ fontWeight:600 }}>Bu kategoriyada stol yo'q</p>
            </div>
          ) : (
            <div className="tbl-grid">
              {tables.map(t => {
                const isBusy = t.status === 'busy'
                const catData = CATS.find(c => c.k === t.category)
                return (
                  <button key={t._id} onClick={() => pick(t)}
                    className="tbl-card"
                    style={{
                      background: isBusy
                        ? 'linear-gradient(135deg,#F59E0B,#D97706)'
                        : 'linear-gradient(135deg,#22C55E,#16A34A)',
                      boxShadow: isBusy
                        ? '0 4px 14px rgba(245,158,11,0.3)'
                        : '0 4px 14px rgba(34,197,94,0.3)',
                    }}
                  >
                    {isBusy && (
                      <span style={{ position:'absolute', top:10, right:10, width:10, height:10, borderRadius:'50%', background:'#FF6B6B' }}>
                        <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'#FF6B6B', animation:'ping 1.5s ease-in-out infinite' }}/>
                      </span>
                    )}
                    <span className="tbl-card-emoji" style={{ fontSize:'1.85rem' }}>{catData?.e}</span>
                    <span className="tbl-card-num" style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.4rem', color:'#fff' }}>
                      {t.number}
                    </span>
                    <span style={{ fontSize:'0.7rem', fontWeight:700, color:'rgba(255,255,255,0.9)', background:'rgba(0,0,0,0.2)', padding:'0.25rem 0.6rem', borderRadius:10 }}>
                      {isBusy ? 'Band' : "Bo'sh"}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  PlusCircle, Edit2, Trash2, Image as ImageIcon, Search, X,
  Package, LayoutGrid
} from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { API_URL } from '../../config.js'
import Modal, { ModalField, ModalActions } from '../../components/shared/Modal.jsx'

const UNITS = ['kg','g','l','ml','dona','litr','paket']

/* Category → color/emoji */
const CAT_COLORS = {
  'Barchasi':    { color:'#F43F5E', emoji:'🍽️' },
  '1-Taomlar':   { color:'#3B82F6', emoji:'🍲' },
  '2-Taomlar':   { color:'#8B5CF6', emoji:'🍛' },
  'Kaboblar':    { color:'#EF4444', emoji:'🍢' },
  'Salatlar':    { color:'#22C55E', emoji:'🥗' },
  'Ichimliklar': { color:'#06B6D4', emoji:'🥤' },
  'Desertlar':   { color:'#EC4899', emoji:'🍰' },
  "Qo'shimcha":  { color:'#F59E0B', emoji:'➕' },
}
const FALLBACK = ['#FB7185','#FB923C','#FBBF24','#84CC16','#34D399','#38BDF8','#818CF8','#A78BFA','#F472B6','#F87171']
const FALLBACK_EMOJI = ['🍽️','🥘','🍲','🥗','🍚','🍢','🥙','🍞','🥖','🥟']
const colorFor = (cat, i = 0) => CAT_COLORS[cat] || { color: FALLBACK[i % FALLBACK.length], emoji: FALLBACK_EMOJI[i % FALLBACK_EMOJI.length] }

export default function Products() {
  const [products,    setProducts]    = useState([])
  const [ingredients, setIngredients] = useState([])
  const [categories,  setCategories]  = useState([])
  const [loading,     setLoading]     = useState(true)
  const [q,           setQ]           = useState('')
  const [catFilter,   setCatFilter]   = useState('Barchasi')
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editing,     setEditing]     = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [imagePreview,setImagePreview]= useState('')
  const [imageFile,   setImageFile]   = useState(null)
  const [form,        setForm]        = useState({ name:'', price:'', category:'', ingredients:[] })

  const load = async () => {
    try {
      const [p, c, ing] = await Promise.all([
        API.get('/api/products?active=false'),
        API.get('/api/products/categories'),
        API.get('/api/ingredients'),
      ])
      setProducts(p.data); setCategories(c.data); setIngredients(ing.data)
    } catch { toast.error('Yuklab bo\'lmadi') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const catsAll = ['Barchasi', ...categories]
  const catCounts = useMemo(() => {
    const c = { Barchasi: products.length }
    products.forEach(p => { c[p.category] = (c[p.category] || 0) + 1 })
    return c
  }, [products])

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(q.toLowerCase()) &&
    (catFilter === 'Barchasi' || p.category === catFilter)
  )

  const openAdd = () => {
    setEditing(null)
    setForm({ name:'', price:'', category: catFilter !== 'Barchasi' ? catFilter : (categories[0] || ''), ingredients:[] })
    setImagePreview(''); setImageFile(null); setModalOpen(true)
  }
  const openEdit = p => {
    setEditing(p)
    setForm({
      name: p.name, price: p.price, category: p.category,
      ingredients: p.ingredients?.map(i => ({
        ingredient: i.ingredient?._id || i.ingredient,
        quantity:   i.quantity,
        recipeUnit: i.recipeUnit || '',
      })) || [],
    })
    setImagePreview(p.image ? (p.image.startsWith('http') ? p.image : `${API_URL}${p.image}`) : '')
    setImageFile(null); setModalOpen(true)
  }

  const handleImg = e => { const f = e.target.files[0]; if (!f) return; setImageFile(f); setImagePreview(URL.createObjectURL(f)) }
  const addRow    = () => setForm(f => ({ ...f, ingredients: [...f.ingredients, { ingredient:'', quantity:'', recipeUnit:'' }] }))
  const removeRow = i => setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }))
  const updateRow = (i, k, v) => setForm(f => ({ ...f, ingredients: f.ingredients.map((r, idx) => idx === i ? { ...r, [k]: v } : r) }))

  const save = async () => {
    if (!form.name || !form.price) return toast.error('Nomi va narxi majburiy')
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name',     form.name)
      fd.append('price',    form.price)
      fd.append('category', form.category || 'Asosiy')
      fd.append('ingredients', JSON.stringify(form.ingredients.filter(r => r.ingredient && r.quantity)))
      if (imageFile) fd.append('image', imageFile)
      if (editing) {
        const { data } = await API.put(`/api/products/${editing._id}`, fd)
        setProducts(p => p.map(x => x._id === editing._id ? data : x)); toast.success('Saqlandi')
      } else {
        const { data } = await API.post('/api/products', fd)
        setProducts(p => [data, ...p]); toast.success("Qo'shildi!")
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
    finally { setSaving(false) }
  }

  const del = async id => {
    if (!confirm("O'chirasizmi?")) return
    try { await API.delete(`/api/products/${id}`); setProducts(p => p.filter(x => x._id !== id)); toast.success("O'chirildi") }
    catch { toast.error('Xatolik') }
  }

  const getIngUnit = id => ingredients.find(i => i._id === id)?.unit || 'kg'

  return (
    <div className="page-enter bento-page">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'clamp(1.6rem,3vw,2.2rem)', color:'var(--text)', letterSpacing:'-0.02em' }}>
            🍽️ Taomlar
          </h1>
          <p style={{ color:'var(--text-3)', fontSize:'1rem', marginTop:4, fontWeight:500 }}>
            {products.length} ta mahsulot · {categories.length} ta kategoriya
          </p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <div style={{ position:'relative', maxWidth:280 }}>
            <Search size={18} style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)', pointerEvents:'none' }}/>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Qidirish..." className="rp-input" style={{ paddingLeft:42, width:240 }}/>
          </div>
          <button className="btn-primary" onClick={openAdd}>
            <PlusCircle size={20}/> Qo'shish
          </button>
        </div>
      </div>

      {/* Category chips (colorful pills) */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:'1.5rem' }}>
        {catsAll.map((c, i) => {
          const { color } = colorFor(c, i)
          const active = catFilter === c
          return (
            <button key={c} onClick={() => setCatFilter(c)}
              style={{
                display:'inline-flex', alignItems:'center', gap:8,
                padding:'0.65rem 1.1rem', borderRadius:100,
                background: active
                  ? `linear-gradient(135deg, ${color}, ${color}dd)`
                  : 'var(--card)',
                border: `1.5px solid ${active ? color : 'var(--border)'}`,
                color: active ? '#fff' : 'var(--text-2)',
                fontWeight: 700, fontSize: '0.9rem',
                fontFamily: 'DM Sans,sans-serif', cursor: 'pointer',
                boxShadow: active ? `0 6px 18px ${color}40` : 'none',
                transition: 'all 0.15s', minHeight: 44,
              }}>
              {c}
              <span style={{
                fontSize:'0.72rem', fontWeight:800,
                background: active ? 'rgba(255,255,255,0.25)' : 'var(--elevated)',
                color: active ? '#fff' : 'var(--text-3)',
                padding:'2px 8px', borderRadius:10, minWidth:24, textAlign:'center',
              }}>{catCounts[c] || 0}</span>
            </button>
          )
        })}
      </div>

      {/* Products grid */}
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'5rem' }}><div className="spinner"/></div>
      ) : filtered.length === 0 ? (
        <div className="bento bento--rose bento--soft" style={{ textAlign:'center', padding:'4rem 2rem' }}>
          <div style={{ fontSize:'3.5rem', marginBottom:12 }}>🍽️</div>
          <p style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text)', marginBottom:6 }}>Mahsulot topilmadi</p>
          <p style={{ fontSize:'0.95rem', color:'var(--text-3)', marginBottom:'1.5rem' }}>Yangi mahsulot qo'shing</p>
          <button className="btn-primary" onClick={openAdd}><PlusCircle size={18}/> Qo'shish</button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'1rem' }}>
          {filtered.map((p, i) => {
            const { color, emoji } = colorFor(p.category, i)
            const imgUrl = p.image ? (p.image.startsWith('http') ? p.image : `${API_URL}${p.image}`) : null
            return (
              <motion.div key={p._id} className="bento bento--clickable" onClick={() => openEdit(p)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                style={{ padding:0, overflow:'hidden', cursor:'pointer' }}>
                {/* Image / color header */}
                <div style={{
                  height: 130, position: 'relative', overflow: 'hidden',
                  background: imgUrl ? 'var(--elevated)' : `linear-gradient(135deg, ${color}, ${color}aa)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {imgUrl
                    ? <img src={imgUrl} alt={p.name} style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0 }}/>
                    : <span style={{ fontSize:'3.2rem' }}>{emoji}</span>
                  }
                  {/* Action overlay */}
                  <div style={{ position:'absolute', top:10, right:10, display:'flex', gap:6 }}>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(p) }}
                      style={{ width:36, height:36, borderRadius:11, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)', border:'none', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
                      title="Tahrirlash"><Edit2 size={15}/></button>
                    <button onClick={(e) => { e.stopPropagation(); del(p._id) }}
                      style={{ width:36, height:36, borderRadius:11, background:'rgba(239,68,68,0.85)', backdropFilter:'blur(6px)', border:'none', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
                      title="O'chirish"><Trash2 size={15}/></button>
                  </div>
                  {/* Category badge */}
                  <span style={{
                    position:'absolute', top:10, left:10,
                    background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)',
                    color:'#fff', fontSize:'0.7rem', fontWeight:800,
                    padding:'4px 10px', borderRadius:100, textTransform:'uppercase', letterSpacing:'0.04em',
                  }}>{p.category}</span>
                </div>

                {/* Info */}
                <div style={{ padding:'1rem 1.1rem 1.1rem' }}>
                  <div style={{ fontWeight:800, fontSize:'1rem', color:'var(--text)', marginBottom:4, lineHeight:1.25,
                    display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden', minHeight:'2.5em' }}>
                    {p.name}
                  </div>
                  <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginTop:6 }}>
                    <div style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.2rem', color }}>
                      {Number(p.price).toLocaleString()}
                      <span style={{ fontSize:'0.7rem', color:'var(--text-3)', marginLeft:4, fontWeight:600 }}>so'm</span>
                    </div>
                    {p.ingredients?.length > 0 && (
                      <span style={{ fontSize:'0.72rem', color:'var(--text-3)', fontWeight:600, background:'var(--elevated)', padding:'3px 8px', borderRadius:8 }}>
                        🥕 {p.ingredients.length}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ─── Add/Edit Modal ─── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Taomni tahrirlash' : 'Yangi taom'} maxWidth={540}>
        <ModalField label="Rasm">
          <label style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, height:120, borderRadius:14, cursor:'pointer', border:'2px dashed var(--border)', background:'var(--surface)', overflow:'hidden', position:'relative' }}>
            {imagePreview
              ? <img src={imagePreview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0 }}/>
              : <><ImageIcon size={26} style={{ color:'var(--text-3)' }}/><span style={{ fontSize:'0.85rem', color:'var(--text-3)', fontWeight:500 }}>Rasm tanlang (max 5MB)</span></>
            }
            <input type="file" accept="image/*" onChange={handleImg} style={{ display:'none' }}/>
          </label>
        </ModalField>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <ModalField label="Taom nomi" required>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Dum lag'mon" className="rp-input"/>
          </ModalField>
          <ModalField label="Narxi (so'm)" required>
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="25000" className="rp-input"/>
          </ModalField>
        </div>

        <ModalField label="Kategoriya">
          <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            placeholder="Masalan: Asosiy" className="rp-input" list="cats-list"/>
          <datalist id="cats-list">{categories.map(c => <option key={c} value={c}/>)}</datalist>
        </ModalField>

        <div style={{ marginBottom:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <label style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-3)', letterSpacing:'0.06em', textTransform:'uppercase' }}>
              Ingredientlar (ixtiyoriy)
            </label>
            <button onClick={addRow} className="btn-ghost btn-sm">
              <PlusCircle size={14}/> Qo'shish
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {form.ingredients.map((row, i) => {
              const ingUnit = getIngUnit(row.ingredient)
              return (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr auto', gap:6, alignItems:'center' }}>
                  <select value={row.ingredient} onChange={e => updateRow(i, 'ingredient', e.target.value)} className="rp-input" style={{ fontSize:'0.85rem', minHeight:42 }}>
                    <option value="">Ingredient</option>
                    {ingredients.map(ing => <option key={ing._id} value={ing._id}>{ing.name} ({ing.unit})</option>)}
                  </select>
                  <input type="number" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)}
                    placeholder="Miqdor" className="rp-input" style={{ fontSize:'0.85rem', minHeight:42 }}/>
                  <select value={row.recipeUnit || ingUnit} onChange={e => updateRow(i, 'recipeUnit', e.target.value)}
                    className="rp-input" style={{ fontSize:'0.85rem', minHeight:42 }}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <button onClick={() => removeRow(i)} className="btn-danger btn-sm" style={{ width:42, minHeight:42, padding:0 }}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              )
            })}
            {form.ingredients.length > 0 && (
              <p style={{ fontSize:'0.74rem', color:'var(--text-3)', marginTop:4 }}>
                💡 Misol: Omborda <strong>kg</strong> da saqlangan un taomda <strong>g</strong> da ishlatilsa — avtomatik konvertatsiya
              </p>
            )}
          </div>
        </div>

        <ModalActions onClose={() => setModalOpen(false)} onConfirm={save} loading={saving} confirmLabel="Saqlash"/>
      </Modal>
    </div>
  )
}

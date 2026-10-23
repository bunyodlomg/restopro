import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, ImagePlus, Search, UtensilsCrossed, X, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal from '../../components/shared/Modal.jsx'
import { Field, Switch, Loading, Empty, PageHead, money, initials, fileUrl } from '../../components/ui.jsx'
import CategoriesModal from './CategoriesModal.jsx'
import { Select } from '../../components/shared/Pickers.jsx'

// Retseptda ingredient birligiga mos birliklargina (server/utils/units.js bilan bir xil): kg ↔ g, l ↔ ml
const UNIT_FAMILY = { kg: ['kg', 'g'], g: ['g', 'kg'], l: ['l', 'ml'], litr: ['l', 'ml'], ml: ['ml', 'l'], dona: ['dona'], paket: ['paket'] }
const unitChoices = u => UNIT_FAMILY[u] || [u || 'kg']
const ALL = 'Barchasi'
const NEW_CAT = '__new'   // select'dagi "+ Yangi bo'lim" varianti

function Thumb({ src, name }) {
  const [err, setErr] = useState(false)
  if (!src || err) return <span className="pcard-ini">{initials(name)}</span>
  return <img src={src} alt="" loading="lazy" onError={() => setErr(true)}/>
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [catFilter, setCatFilter] = useState(ALL)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [form, setForm] = useState({ name: '', price: '', category: '', ingredients: [], isActive: true })
  const [catsOpen, setCatsOpen] = useState(false)
  const [newCat, setNewCat] = useState('')

  const load = async () => {
    try {
      const [p, c, ing] = await Promise.all([
        API.get('/api/products?active=false'),
        API.get('/api/categories'),
        API.get('/api/ingredients'),
      ])
      setProducts(p.data); setCategories(c.data); setIngredients(ing.data)
    } catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const loadCategories = async () => { const { data } = await API.get('/api/categories'); setCategories(data) }

  // Bo'lim nomlari: ro'yxatdagilar + ro'yxatga hali tushmagan eski nomlar (taomlarda qolgan)
  const catNames = useMemo(
    () => [...new Set([...categories.map(c => c.name), ...products.map(p => p.category).filter(Boolean)])],
    [categories, products])

  const catCounts = useMemo(() => {
    const c = { [ALL]: products.length }
    products.forEach(p => { c[p.category] = (c[p.category] || 0) + 1 })
    return c
  }, [products])

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(q.toLowerCase()) &&
    (catFilter === ALL || p.category === catFilter)
  )

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', price: '', category: catFilter !== ALL ? catFilter : (categories[0]?.name || ''), ingredients: [], isActive: true })
    setNewCat('')
    setImagePreview(''); setImageFile(null); setModalOpen(true)
  }
  const openEdit = p => {
    setEditing(p)
    setForm({
      name: p.name, price: p.price, category: p.category, isActive: p.isActive !== false,
      ingredients: p.ingredients?.map(i => ({
        ingredient: i.ingredient?._id || i.ingredient,
        quantity: i.quantity,
        recipeUnit: i.recipeUnit || '',
      })) || [],
    })
    setImagePreview(p.image ? fileUrl(p.image) : '')
    setNewCat('')
    setImageFile(null); setModalOpen(true)
  }

  const handleImg = e => { const f = e.target.files[0]; if (!f) return; setImageFile(f); setImagePreview(URL.createObjectURL(f)) }
  const addRow = () => setForm(f => ({ ...f, ingredients: [...f.ingredients, { ingredient: '', quantity: '', recipeUnit: '' }] }))
  const removeRow = i => setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, idx) => idx !== i) }))
  const updateRow = (i, k, v) => setForm(f => ({ ...f, ingredients: f.ingredients.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)) }))

  const save = async () => {
    if (!form.name || !form.price) return toast.error('Nomi va narxi majburiy')
    if (!form.category || form.category === NEW_CAT) return toast.error("Bo'limni tanlang")
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('price', form.price)
      fd.append('category', form.category)
      if (editing) fd.append('isActive', String(form.isActive))
      fd.append('ingredients', JSON.stringify(form.ingredients.filter(r => r.ingredient && r.quantity)))
      if (imageFile) fd.append('image', imageFile)
      if (editing) {
        const { data } = await API.put(`/api/products/${editing._id}`, fd)
        setProducts(p => p.map(x => (x._id === editing._id ? data : x))); toast.success('Saqlandi')
      } else {
        const { data } = await API.post('/api/products', fd)
        setProducts(p => [data, ...p]); toast.success("Qo'shildi")
      }
      setModalOpen(false)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
    finally { setSaving(false) }
  }

  const del = async () => {
    const id = deleting._id
    try {
      await API.delete(`/api/products/${id}`)
      setProducts(p => p.filter(x => x._id !== id)); toast.success("O'chirildi"); setDeleting(null)
    } catch { toast.error('Xatolik') }
  }

  const getIngUnit = id => ingredients.find(i => i._id === id)?.unit || 'kg'
  const catsAll = [ALL, ...catNames]

  // Taom oynasidan chiqmasdan yangi bo'lim qo'shish
  const addCategory = async () => {
    try {
      const { data } = await API.post('/api/categories', { name: newCat })
      await loadCategories()
      setForm(f => ({ ...f, category: data.name })); setNewCat('')
      toast.success("Bo'lim qo'shildi")
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
  }

  return (
    <div className="page">
      <PageHead title="Taomlar" sub={`${products.length} ta taom · ${catNames.length} ta bo'lim`}
        actions={<>
          <div className="input-icon" style={{ width: 260 }}>
            <Search size={20}/>
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Taom qidirish"/>
          </div>
          <button className="btn btn-soft btn-lg" onClick={() => setCatsOpen(true)}><FolderOpen size={20}/> Bo'limlar</button>
          <button className="btn btn-primary btn-lg" onClick={openAdd}><Plus size={20}/> Yangi taom</button>
        </>}/>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {catsAll.map(c => (
          <button key={c} className={`tab ${catFilter === c ? 'cur' : ''}`} onClick={() => setCatFilter(c)}>
            {c}<sup>{catCounts[c] || 0}</sup>
          </button>
        ))}
      </div>

      {loading ? <Loading/> : filtered.length === 0 ? (
        <Empty icon={UtensilsCrossed} title="Taom topilmadi" text="Yangi taom qo'shing — kassada darhol ko'rinadi."
          action={<button className="btn btn-primary btn-lg" onClick={openAdd}><Plus size={20}/> Yangi taom</button>}/>
      ) : (
        <div className="menu-grid">
          {filtered.map(p => (
            <div key={p._id} className="pcard" style={{ cursor: 'pointer', opacity: p.isActive === false ? .5 : 1 }} onClick={() => openEdit(p)}>
              <div className="pcard-ph">
                <Thumb src={p.image ? fileUrl(p.image) : ''} name={p.name}/>
                <span className="tag">{p.category}</span>
              </div>
              <div className="pcard-body">
                <span className="pcard-name">{p.name}</span>
                <span className="pcard-desc">{p.ingredients?.length ? `${p.ingredients.length} ta ingredient` : 'Retsept kiritilmagan'}</span>
                <span className="pcard-foot">
                  <span className="pcard-price">{money(p.price)}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="pcard-btn" title="Tahrirlash" onClick={e => { e.stopPropagation(); openEdit(p) }}><Pencil size={19}/></button>
                    <button className="pcard-btn" title="O'chirish" style={{ color: 'var(--accent-ink)' }} onClick={e => { e.stopPropagation(); setDeleting(p) }}><Trash2 size={19}/></button>
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Taomni tahrirlash' : 'Yangi taom'} maxWidth={600}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setModalOpen(false)}>Bekor qilish</button>
          <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? <><span className="spinner-sm"/> Saqlanmoqda</> : 'Saqlash'}
          </button>
        </>}>
        <Field label="Rasm" hint="JPG yoki PNG, 5 MB gacha">
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, height: 150, borderRadius: 16, cursor: 'pointer', background: 'var(--thumb)', boxShadow: 'inset 0 0 0 2px var(--rule-2)', overflow: 'hidden', position: 'relative', color: 'var(--ink-3)' }}>
            {imagePreview
              ? <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}/>
              : <><ImagePlus size={30} strokeWidth={1.7}/><span style={{ fontWeight: 600 }}>Rasm tanlash</span></>}
            <input type="file" accept="image/*" onChange={handleImg} style={{ display: 'none' }}/>
          </span>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Taom nomi" required>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Dum lag'mon"/>
          </Field>
          <Field label="Narxi (so'm)" required>
            <input className="input mono" type="number" inputMode="numeric" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="25000"/>
          </Field>
        </div>

        <Field label="Bo'lim" required>
          <Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="Bo'limni tanlang"
            options={[
              ...[...new Set([...categories.map(c => c.name), ...(form.category && form.category !== NEW_CAT ? [form.category] : [])])].map(c => ({ value: c, label: c })),
              { value: NEW_CAT, label: "+ Yangi bo'lim…" },
            ]}/>
        </Field>
        {form.category === NEW_CAT && (
          <div className="row" style={{ gap: 8, marginTop: -4, marginBottom: 12 }}>
            <input className="input" style={{ flex: 1 }} value={newCat} onChange={e => setNewCat(e.target.value)} maxLength={40} autoFocus
              placeholder="Yangi bo'lim nomi, masalan: Ichimliklar" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory() } }}/>
            <button type="button" className="btn btn-primary" disabled={!newCat.trim()} onClick={addCategory}><Plus size={18}/> Qo'shish</button>
          </div>
        )}
        {editing && <Switch checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))}
          label="Sotuvda" hint="O'chirilsa, taom ofitsant menyusida ko'rinmaydi (masalan, tugab qolganda)"/>}

        <div className="row" style={{ justifyContent: 'space-between', margin: '6px 0 10px' }}>
          <span className="label">Retsept — ingredientlar (ixtiyoriy)</span>
          <button type="button" className="btn btn-soft btn-sm" onClick={addRow}><Plus size={16}/> Qator</button>
        </div>
        <div className="col" style={{ gap: 8 }}>
          {form.ingredients.map((row, i) => {
            const ingUnit = getIngUnit(row.ingredient)
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) 92px 48px', gap: 8, alignItems: 'center' }}>
                <Select value={row.ingredient} placeholder="Ingredient" onChange={v => updateRow(i, 'ingredient', v)}
                  options={ingredients.map(ing => ({ value: ing._id, label: ing.name, hint: `omborda ${+(+ing.quantity).toFixed(3)} ${ing.unit}` }))}/>
                <input className="input mono" type="number" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)} placeholder="Miqdor"/>
                <Select value={unitChoices(ingUnit).includes(row.recipeUnit) ? row.recipeUnit : unitChoices(ingUnit)[0]}
                  onChange={v => updateRow(i, 'recipeUnit', v)} options={unitChoices(ingUnit).map(u => ({ value: u, label: u }))}/>
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeRow(i)} aria-label="Qatorni o'chirish"><X size={20}/></button>
              </div>
            )
          })}
          {form.ingredients.length > 0 && (
            <span className="hint">Omborda kg da saqlangan mahsulot retseptda g da yozilsa — avtomatik hisoblanadi.</span>
          )}
        </div>
      </Modal>

      <CategoriesModal open={catsOpen} onClose={() => setCatsOpen(false)} categories={categories}
        onChange={async () => { await load(); setCatFilter(ALL) }}/>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Taomni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setDeleting(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={del}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>«{deleting?.name}» menyudan butunlay o'chiriladi.</p>
      </Modal>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle, Package2 } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal from '../../components/shared/Modal.jsx'
import { Field, Loading, Empty, PageHead, Seg, money } from '../../components/ui.jsx'

const UNITS = ['kg', 'g', 'l', 'ml', 'dona', 'litr', 'paket']
const EMPTY = { name: '', unit: 'kg', quantity: '', minQty: '', price: '' }
const fmtQty = n => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('ru-RU')

export default function Ingredients() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)

  const load = async () => {
    try { const { data } = await API.get('/api/ingredients'); setItems(data) }
    catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true) }
  const openEdit = it => { setEditing(it); setForm({ name: it.name, unit: it.unit, quantity: it.quantity, minQty: it.minQty, price: it.price }); setOpen(true) }

  const save = async () => {
    if (!form.name) return toast.error('Nomi majburiy')
    setSaving(true)
    try {
      if (editing) {
        const { data } = await API.put(`/api/ingredients/${editing._id}`, form)
        setItems(p => p.map(x => (x._id === editing._id ? data : x))); toast.success('Saqlandi')
      } else {
        const { data } = await API.post('/api/ingredients', form)
        setItems(p => [data, ...p]); toast.success("Qo'shildi")
      }
      setOpen(false)
    } catch { toast.error('Xatolik') }
    finally { setSaving(false) }
  }

  const del = async () => {
    const id = deleting._id
    try {
      await API.delete(`/api/ingredients/${id}`)
      setItems(p => p.filter(x => x._id !== id)); toast.success("O'chirildi"); setDeleting(null)
    } catch { toast.error('Xatolik') }
  }

  const isLow = it => it.minQty > 0 && it.quantity <= it.minQty
  const lowCount = items.filter(isLow).length
  const worth = items.reduce((s, it) => s + (Number(it.price) || 0) * Math.max(0, Number(it.quantity) || 0), 0)
  const list = filter === 'low' ? items.filter(isLow) : items
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="page">
      <PageHead title="Ombor" sub={`${items.length} ta mahsulot · qiymati ${money(worth)} so'm`}
        actions={<button className="btn btn-primary btn-lg" onClick={openAdd}><Plus size={20}/> Yangi mahsulot</button>}/>

      <Seg value={filter} onChange={setFilter} style={{ marginBottom: 18 }}
        items={[{ k: 'all', l: 'Barchasi', n: items.length }, { k: 'low', l: 'Kam qolgan', n: lowCount, icon: AlertTriangle }]}/>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={Package2} title={filter === 'low' ? "Kam qolgan mahsulot yo'q" : "Ombor bo'sh"}
          text={filter === 'low' ? 'Hamma mahsulot yetarli miqdorda.' : "Un, go'sht, yog' kabi mahsulotlarni qo'shing — buyurtma yopilganda avtomatik ayiriladi."}
          action={filter === 'all' && <button className="btn btn-primary btn-lg" onClick={openAdd}><Plus size={20}/> Yangi mahsulot</button>}/>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr>
              <th>Nomi</th><th className="r">Qoldiq</th><th className="r">Minimum</th><th className="r">Narxi (1 birlik)</th><th/>
            </tr></thead>
            <tbody>
              {list.map(it => {
                const low = isLow(it)
                return (
                  <tr key={it._id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        {low && <AlertTriangle size={18} style={{ color: 'var(--accent-ink)', flexShrink: 0 }}/>}
                        <b style={{ fontWeight: 600 }}>{it.name}</b>
                        {low && <span className="tag tag-soft">Kam</span>}
                      </div>
                    </td>
                    <td className="r mono" style={{ fontWeight: 600, color: low ? 'var(--accent-ink)' : undefined }}>{fmtQty(it.quantity)} <span className="muted">{it.unit}</span></td>
                    <td className="r mono muted">{it.minQty ? `${fmtQty(it.minQty)} ${it.unit}` : '—'}</td>
                    <td className="r mono">{it.price ? money(it.price) : '—'}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-soft btn-icon" title="Tahrirlash" onClick={() => openEdit(it)}><Pencil size={18}/></button>
                        <button className="btn btn-ghost btn-icon" title="O'chirish" style={{ color: 'var(--accent-ink)' }} onClick={() => setDeleting(it)}><Trash2 size={18}/></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Bekor qilish</button>
          <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? <><span className="spinner-sm"/> Saqlanmoqda</> : 'Saqlash'}
          </button>
        </>}>
        <Field label="Nomi" required><input className="input" value={form.name} onChange={set('name')} placeholder="Masalan: Un"/></Field>
        <Field label="O'lchov birligi">
          <select className="input" value={form.unit} onChange={set('unit')}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Joriy qoldiq"><input className="input mono" type="number" value={form.quantity} onChange={set('quantity')} placeholder="0"/></Field>
          <Field label="Minimum chegara" hint="Shundan kam bo'lsa ogohlantiradi"><input className="input mono" type="number" value={form.minQty} onChange={set('minQty')} placeholder="0"/></Field>
        </div>
        <Field label="1 birlik narxi (so'm)"><input className="input mono" type="number" value={form.price} onChange={set('price')} placeholder="0"/></Field>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Mahsulotni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setDeleting(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={del}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>«{deleting?.name}» ombordan o'chiriladi. Retseptlardagi bog'lanish ham yo'qoladi.</p>
      </Modal>
    </div>
  )
}

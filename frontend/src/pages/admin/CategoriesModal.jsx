import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal from '../../components/shared/Modal.jsx'
import { Empty } from '../../components/ui.jsx'

// Taom bo'limlari: qo'shish, nomini o'zgartirish, o'chirish (faqat bo'sh bo'lim).
// Nom o'zgarsa server shu bo'limdagi taomlar va printer sozlamalarini ham yangilaydi.
export default function CategoriesModal({ open, onClose, categories, onChange }) {
  const [name, setName] = useState('')
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn, ok) => {
    setBusy(true)
    try { await fn(); toast.success(ok); await onChange() }
    catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setBusy(false) }
  }

  const add = () => {
    if (!name.trim()) return
    run(() => API.post('/api/categories', { name }), "Bo'lim qo'shildi").then(() => setName(''))
  }
  const rename = c => {
    if (!editName.trim() || editName.trim() === c.name) return setEditId(null)
    run(() => API.put(`/api/categories/${c._id}`, { name: editName }), 'Saqlandi').then(() => setEditId(null))
  }
  const remove = c => run(() => API.delete(`/api/categories/${c._id}`), "O'chirildi")

  return (
    <Modal open={open} onClose={onClose} title="Bo'limlar" maxWidth={520}
      footer={<button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Yopish</button>}>
      <form className="row" style={{ gap: 8, marginBottom: 16 }} onSubmit={e => { e.preventDefault(); add() }}>
        <input className="input" style={{ flex: 1 }} value={name} onChange={e => setName(e.target.value)}
          placeholder="Yangi bo'lim, masalan: Ichimliklar" maxLength={40}/>
        <button className="btn btn-primary" disabled={busy || !name.trim()}><Plus size={18}/> Qo'shish</button>
      </form>

      {categories.length === 0 ? (
        <Empty icon={FolderOpen} title="Bo'lim yo'q" text="Avval bo'lim qo'shing — keyin taomni shu bo'limga qo'yasiz."/>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          {categories.map(c => (
            <div key={c._id} className="row" style={{ gap: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--thumb)' }}>
              {editId === c._id ? (
                <form className="row" style={{ gap: 8, flex: 1 }} onSubmit={e => { e.preventDefault(); rename(c) }}>
                  <input className="input" style={{ flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} maxLength={40} autoFocus/>
                  <button className="btn btn-primary btn-icon" disabled={busy} title="Saqlash"><Check size={18}/></button>
                  <button type="button" className="btn btn-ghost btn-icon" onClick={() => setEditId(null)} title="Bekor qilish"><X size={18}/></button>
                </form>
              ) : (
                <>
                  <span style={{ flex: 1, fontWeight: 600, minWidth: 0 }}>{c.name}</span>
                  <span className="muted" style={{ fontSize: 14 }}>{c.products} ta taom</span>
                  <button className="btn btn-soft btn-icon" title="Nomini o'zgartirish" onClick={() => { setEditId(c._id); setEditName(c.name) }}><Pencil size={17}/></button>
                  <button className="btn btn-danger btn-icon" disabled={busy || c.products > 0}
                    title={c.products ? "Avval taomlarni boshqa bo'limga o'tkazing" : "O'chirish"} onClick={() => remove(c)}><Trash2 size={17}/></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Grid3X3, QrCode, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import Modal from '../../components/shared/Modal.jsx'
import { Select } from '../../components/shared/Pickers.jsx'
import { Loading, Empty, PageHead, Seg, Field } from '../../components/ui.jsx'
import { useSections } from '../../utils/sections.js'
import SectionsModal from './SectionsModal.jsx'

const pad = n => String(n).padStart(2, '0')

export default function Tables() {
  const { sections, label: sectionLabel } = useSections()
  const [tables, setTables] = useState([])
  const [cat, setCat] = useState('zal')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [editing, setEditing] = useState(null)
  const [sectionsOpen, setSectionsOpen] = useState(false)

  const fetchTables = async () => {
    try { const { data } = await API.get('/api/tables'); setTables(data) }
    catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => {
    fetchTables()
    const s = createSocket()
    s.on('tableCreated', t => setTables(p => (p.some(x => x._id === t._id) ? p : [...p, t])))
    s.on('tableDeleted', id => setTables(p => p.filter(t => t._id !== id)))
    s.on('tableUpdated', t => t && setTables(p => p.map(x => (x._id === t._id ? t : x))))
    s.on('syncApplied', ({ colls }) => { if (colls.includes('tables')) fetchTables() })
    return () => s.disconnect()
  }, [])

  // Tanlangan bo'lim o'chirilgan bo'lsa — birinchisiga
  const tabs = [...sections.map(s => ({ k: s.key, l: s.label })), { k: 'soboy', l: 'Soboy' }]
  useEffect(() => { if (!tabs.some(t => t.k === cat)) setCat(tabs[0].k) }, [sections])

  const counts = tables.reduce((m, t) => ({ ...m, [t.category]: (m[t.category] || 0) + 1 }), {})
  const list = tables.filter(t => t.category === cat).sort((a, b) => a.number - b.number)

  // Tezkor qo'shish — keyingi raqamli stol darhol yaratiladi
  const addTable = async () => {
    if (adding) return
    const number = list.length ? Math.max(...list.map(t => t.number)) + 1 : 1
    setAdding(true)
    try {
      const { data } = await API.post('/api/tables', { category: cat, number })
      setTables(p => (p.some(x => x._id === data._id) ? p : [...p, data]))
      toast.success(`${number}-stol qo'shildi`)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
    finally { setAdding(false) }
  }

  const del = async () => {
    const t = deleting
    try {
      await API.delete(`/api/tables/${t._id}`)
      setTables(p => p.filter(x => x._id !== t._id))
      toast.success("O'chirildi"); setDeleting(null)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
  }

  const saveEdit = async () => {
    const { _id, number, category, description } = editing
    if (!(+number >= 1)) return toast.error("Stol raqamini yozing")
    try {
      const { data } = await API.put(`/api/tables/${_id}`, { number: +number, description, ...(category !== cat ? { category } : {}) })
      setTables(p => p.map(x => (x._id === data._id ? data : x)))
      toast.success(category !== cat ? `${sectionLabel(category)} bo'limiga o'tkazildi` : 'Saqlandi')
      setEditing(null)
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
  }

  const busy = list.filter(t => t.status === 'busy').length
  const label = sectionLabel(cat)

  return (
    <div className="page">
      <PageHead title="Stollar" sub={`${label} · ${list.length} ta stol · ${busy} ta band`}
        actions={<>
          <button className="btn btn-soft btn-lg" onClick={() => setSectionsOpen(true)}><Layers size={20}/> Bo'limlar</button>
          <Link to="/admin/tables/qr" className="btn btn-soft btn-lg"><QrCode size={20}/> QR kodlar</Link>
          <button className="btn btn-primary btn-lg" onClick={addTable} disabled={adding}>
            <Plus size={20}/>{adding ? "Qo'shilmoqda" : "Stol qo'shish"}
          </button>
        </>}/>

      <Seg value={cat} onChange={setCat} items={tabs.map(t => ({ ...t, n: counts[t.k] || 0 }))} style={{ marginBottom: 18 }}/>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={Grid3X3} title="Bu bo'limda stol yo'q" text="«Stol qo'shish» tugmasi keyingi raqamli stolni darhol yaratadi."
          action={<button className="btn btn-primary btn-lg" onClick={addTable} disabled={adding}><Plus size={20}/> Stol qo'shish</button>}/>
      ) : (
        <div className="tgrid">
          {list.map(t => {
            const isBusy = t.status === 'busy'
            return (
              <div key={t._id} className={`tcard ${isBusy ? 'busy' : ''}`} role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                title="Tahrirlash / boshqa bo'limga o'tkazish"
                onClick={() => setEditing({ _id: t._id, number: t.number, category: t.category, description: t.description || '' })}>
                <span className="tcard-st"><i className="dot"/>{isBusy ? 'Band' : "Bo'sh"}</span>
                <span className="tcard-n">{pad(t.number)}</span>
                <span className="tcard-foot" style={isBusy ? { color: 'inherit', opacity: .7 } : undefined}>{t.description || label}</span>
                <button className="btn btn-icon btn-sm corner" title={isBusy ? "Band stolni o'chirib bo'lmaydi" : "O'chirish"}
                  disabled={isBusy} onClick={e => { e.stopPropagation(); setDeleting(t) }}
                  style={{ background: isBusy ? 'rgba(255,255,255,.2)' : 'var(--thumb)', color: isBusy ? 'inherit' : 'var(--accent-ink)', boxShadow: 'none' }}>
                  <Trash2 size={17}/>
                </button>
              </div>
            )
          })}
          <button className="tcard add" onClick={addTable} disabled={adding}>
            <Plus size={30} strokeWidth={1.8}/>
            <span>{adding ? "Qo'shilmoqda" : 'Yangi stol'}</span>
          </button>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${label}, ${editing?.number}-stol`} maxWidth={460}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setEditing(null)}>Bekor qilish</button>
          <button className="btn btn-primary btn-lg" onClick={saveEdit}>Saqlash</button>
        </>}>
        {editing && <div className="col" style={{ gap: 14 }}>
          <Field label="Bo'lim">
            <Select value={editing.category} onChange={v => setEditing(x => ({ ...x, category: v }))}
              options={(cat === 'soboy' ? tabs : sections.map(s => ({ k: s.key, l: s.label }))).map(t => ({ value: t.k, label: t.l }))}/>
          </Field>
          <Field label="Stol raqami">
            <input className="input" type="number" min="1" value={editing.number} onChange={e => setEditing(x => ({ ...x, number: e.target.value }))}/>
          </Field>
          <Field label="Izoh" hint="Masalan: deraza oldida, 8 kishilik">
            <input className="input" value={editing.description} maxLength={200} onChange={e => setEditing(x => ({ ...x, description: e.target.value }))}/>
          </Field>
        </div>}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Stolni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setDeleting(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={del}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>{label}, {deleting?.number}-stol o'chiriladi.</p>
      </Modal>

      <SectionsModal open={sectionsOpen} onClose={() => setSectionsOpen(false)} counts={counts}/>
    </div>
  )
}

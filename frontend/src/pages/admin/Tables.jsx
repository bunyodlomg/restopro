import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Grid3X3, QrCode } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import Modal from '../../components/shared/Modal.jsx'
import { Loading, Empty, PageHead, Seg } from '../../components/ui.jsx'

const CATS = [
  { k: 'zal', l: 'Zal' },
  { k: 'xona', l: 'Xona' },
  { k: "ko'cha", l: "Ko'cha" },
  { k: 'soboy', l: 'Soboy' },
]
const pad = n => String(n).padStart(2, '0')

export default function Tables() {
  const [tables, setTables] = useState([])
  const [cat, setCat] = useState('zal')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    const s = createSocket()
    s.on('tableCreated', t => setTables(p => (p.some(x => x._id === t._id) ? p : [...p, t])))
    s.on('tableDeleted', id => setTables(p => p.filter(t => t._id !== id)))
    s.on('tableUpdated', t => t && setTables(p => p.map(x => (x._id === t._id ? t : x))))
    return () => s.disconnect()
  }, [])

  const fetchTables = async () => {
    setLoading(true)
    try { const { data } = await API.get(`/api/tables?category=${cat}`); setTables(data) }
    catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => {
    fetchTables()
    const s = createSocket()
    s.on('syncApplied', ({ colls }) => { if (colls.includes('tables')) fetchTables() })
    return () => s.disconnect()
  }, [cat])

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

  const busy = list.filter(t => t.status === 'busy').length
  const label = CATS.find(c => c.k === cat)?.l

  return (
    <div className="page">
      <PageHead title="Stollar" sub={`${label} · ${list.length} ta stol · ${busy} ta band`}
        actions={<>
          <Link to="/admin/tables/qr" className="btn btn-soft btn-lg"><QrCode size={20}/> QR kodlar</Link>
          <button className="btn btn-primary btn-lg" onClick={addTable} disabled={adding}>
            <Plus size={20}/>{adding ? "Qo'shilmoqda" : "Stol qo'shish"}
          </button>
        </>}/>

      <Seg value={cat} onChange={setCat} items={CATS} style={{ marginBottom: 18 }}/>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={Grid3X3} title="Bu bo'limda stol yo'q" text="«Stol qo'shish» tugmasi keyingi raqamli stolni darhol yaratadi."
          action={<button className="btn btn-primary btn-lg" onClick={addTable} disabled={adding}><Plus size={20}/> Stol qo'shish</button>}/>
      ) : (
        <div className="tgrid">
          {list.map(t => {
            const isBusy = t.status === 'busy'
            return (
              <div key={t._id} className={`tcard ${isBusy ? 'busy' : ''}`}>
                <span className="tcard-st"><i className="dot"/>{isBusy ? 'Band' : "Bo'sh"}</span>
                <span className="tcard-n">{pad(t.number)}</span>
                <span className="tcard-foot" style={isBusy ? { color: 'inherit', opacity: .7 } : undefined}>{t.description || label}</span>
                <button className="btn btn-icon btn-sm corner" title={isBusy ? "Band stolni o'chirib bo'lmaydi" : "O'chirish"}
                  disabled={isBusy} onClick={() => setDeleting(t)}
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

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Stolni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setDeleting(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={del}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>{label}, {deleting?.number}-stol o'chiriladi.</p>
      </Modal>
    </div>
  )
}

import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal from '../../components/shared/Modal.jsx'
import { Loading } from '../../components/ui.jsx'
import { useSections } from '../../utils/sections.js'

const pad = n => String(n).padStart(2, '0')

// Mehmonlarni boshqa stolga ko'chirish (Zal 1 → Xona 4): faqat bo'sh stollar, bo'limlar bo'yicha
export default function MoveTableModal({ open, order, onClose, onMoved }) {
  const { sections, label } = useSections()
  const [tables, setTables] = useState(null)
  const [busyIds, setBusyIds] = useState(new Set())
  const [moving, setMoving] = useState(null)

  useEffect(() => {
    if (!open) return
    setTables(null)
    Promise.all([API.get('/api/tables'), API.get('/api/orders?status=pending')])
      .then(([t, o]) => {
        setBusyIds(new Set(o.data.map(x => String(x.tableId)).filter(Boolean)))
        setTables(t.data.filter(x => x.category !== 'soboy'))
      })
      .catch(() => { toast.error("Stollarni yuklab bo'lmadi"); onClose() })
  }, [open])

  const move = async t => {
    if (moving) return
    setMoving(t._id)
    try {
      const { data } = await API.post(`/api/orders/${order._id}/move`, { tableId: t._id })
      toast.success(`${label(order.category)} · Stol ${order.tableNumber} → ${label(t.category)} · Stol ${t.number}`)
      onMoved(data, t)
    } catch (err) {
      toast.error(err.response?.data?.message || "Ko'chirib bo'lmadi")
      setMoving(null)
    }
  }

  // Ochiq buyurtmasi yo'q stol — bo'sh ("band" belgisi qolib ketgan bo'lsa ham)
  const free = (tables || []).filter(t => !busyIds.has(String(t._id)) && String(t._id) !== String(order?.tableId))
  const groups = sections.map(s => ({ ...s, list: free.filter(t => t.category === s.key).sort((a, b) => a.number - b.number) }))
    .filter(g => g.list.length)

  return (
    <Modal open={open} onClose={onClose} maxWidth={620}
      title={order ? `${label(order.category)} · Stol ${order.tableNumber} — qayerga ko'chirish?` : ''}>
      {!tables ? <Loading/> : groups.length === 0 ? (
        <div className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>Bo'sh stol yo'q</div>
      ) : groups.map(g => (
        <div key={g.key} style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginBottom: 8 }}>{g.label} · {g.list.length} ta bo'sh</div>
          <div className="row wrap" style={{ gap: 10 }}>
            {g.list.map(t => (
              <button key={t._id} className="btn btn-soft btn-lg" disabled={!!moving} onClick={() => move(t)}
                style={{ minWidth: 76, fontSize: 20, fontWeight: 700 }} title={t.description || ''}>
                {moving === t._id ? <span className="spinner-sm"/> : pad(t.number)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  )
}

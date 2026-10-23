import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal from '../../components/shared/Modal.jsx'
import { Select } from '../../components/shared/Pickers.jsx'
import { Field, Seg } from '../../components/ui.jsx'
import { useSections } from '../../utils/sections.js'

// Stol qo'shish: bitta (istalgan raqam — masalan 100-xona, izoh bilan) yoki bir nechta (1–32 oralig'i)
export default function AddTablesModal({ open, onClose, tables, defaultCat, onAdded }) {
  const { sections } = useSections()
  const [cat, setCat] = useState(defaultCat)
  const [mode, setMode] = useState('one')
  const [number, setNumber] = useState('')
  const [desc, setDesc] = useState('')
  const [from, setFrom] = useState('1')
  const [to, setTo] = useState('10')
  const [busy, setBusy] = useState(false)

  const taken = new Set(tables.filter(t => t.category === cat).map(t => t.number))
  const next = () => { let n = 1; while (taken.has(n)) n++; return n }
  useEffect(() => { if (open) { setCat(defaultCat); setDesc(''); setMode('one') } }, [open])
  useEffect(() => { if (open) setNumber(String(next())) }, [open, cat])

  const a = Math.round(+from), b = Math.round(+to)
  const rangeOk = a >= 1 && b >= a && b - a < 200
  const exists = rangeOk ? Array.from({ length: b - a + 1 }, (_, i) => a + i).filter(n => taken.has(n)).length : 0
  const n = Math.round(+number)

  const submit = async () => {
    setBusy(true)
    try {
      if (mode === 'one') {
        if (!(n >= 1)) return toast.error('Stol raqamini yozing')
        if (taken.has(n)) return toast.error(`${n}-stol bu bo'limda allaqachon bor`)
        const { data } = await API.post('/api/tables', { category: cat, number: n, description: desc.trim() })
        onAdded([data]); toast.success(`${n}-stol qo'shildi`)
      } else {
        if (!rangeOk) return toast.error("Oraliqni to'g'ri yozing (ko'pi bilan 200 ta)")
        const { data } = await API.post('/api/tables/bulk', { category: cat, from: a, to: b })
        onAdded(data.created)
        toast.success(`${data.created.length} ta stol qo'shildi${data.skipped ? ` · ${data.skipped} tasi oldin bor edi` : ''}`)
      }
      onClose()
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Stol qo'shish" maxWidth={480}
      footer={<>
        <button className="btn btn-ghost btn-lg" onClick={onClose}>Bekor qilish</button>
        <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner-sm"/> : mode === 'one' ? "Qo'shish" : `${rangeOk ? b - a + 1 - exists : 0} ta stol yaratish`}
        </button>
      </>}>
      <Field label="Bo'lim">
        <Select value={cat} onChange={setCat} options={sections.map(s => ({ value: s.key, label: s.label }))}/>
      </Field>
      <Seg value={mode} onChange={setMode} style={{ marginBottom: 16 }} items={[{ k: 'one', l: 'Bitta stol' }, { k: 'range', l: 'Bir nechta' }]}/>
      {mode === 'one' ? <>
        <Field label="Stol raqami" hint={taken.has(n) ? `${n}-stol bu bo'limda bor` : 'Istalgan raqam — masalan 100'}>
          <input className="input mono" type="number" min={1} max={9999} value={number} onChange={e => setNumber(e.target.value)} autoFocus/>
        </Field>
        <Field label="Izoh (ixtiyoriy)" hint="Stol kartasida ko'rinadi: VIP, deraza yonida, 8 kishilik…">
          <input className="input" value={desc} onChange={e => setDesc(e.target.value)} maxLength={60}/>
        </Field>
      </> : <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Dan"><input className="input mono" type="number" min={1} value={from} onChange={e => setFrom(e.target.value)}/></Field>
          <Field label="Gacha"><input className="input mono" type="number" min={1} value={to} onChange={e => setTo(e.target.value)}/></Field>
        </div>
        <div className="calc-row">
          <span>{rangeOk ? `${a} — ${b}` : "Oraliq noto'g'ri"}</span>
          <b>{rangeOk ? `${b - a + 1 - exists} ta yangi${exists ? ` · ${exists} tasi bor` : ''}` : '—'}</b>
        </div>
      </>}
    </Modal>
  )
}

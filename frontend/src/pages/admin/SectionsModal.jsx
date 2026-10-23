import React, { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, ArrowUp, ArrowDown } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal from '../../components/shared/Modal.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useSections } from '../../utils/sections.js'

// Stol bo'limlari: zal, xona, ko'cha va restoranning o'zinikilari (2-etaj, lux xonalar, terrasa ...).
// Qo'shish, nomini o'zgartirish, tartibini o'zgartirish, o'chirish (stoli bo'lsa — tasdiq bilan, stollari bilan).
export default function SectionsModal({ open, onClose, counts = {} }) {
  const { sections } = useSections()
  const { refresh } = useSettings()
  const [name, setName] = useState('')
  const [editKey, setEditKey] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)

  const [confirmDel, setConfirmDel] = useState(null)   // stoli bor bo'limni o'chirishdan oldin tasdiq

  const save = async (list, ok, { dropTables = false } = {}) => {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('tableSections', JSON.stringify(list.map(({ key, label }) => ({ key, label }))))
      if (dropTables) fd.append('dropTables', 'true')
      await API.put('/api/settings', fd)
      await refresh()
      toast.success(ok)
      return true
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik'); return false }
    finally { setBusy(false) }
  }

  const add = async () => {
    const label = name.trim()
    if (label && await save([...sections, { label }], `«${label}» qo'shildi`)) setName('')
  }
  const rename = async s => {
    const label = editName.trim()
    if (!label || label === s.label) return setEditKey(null)
    if (await save(sections.map(x => (x.key === s.key ? { ...x, label } : x)), 'Saqlandi')) setEditKey(null)
  }
  const move = (i, d) => {
    const list = [...sections]
    ;[list[i], list[i + d]] = [list[i + d], list[i]]
    save(list, 'Tartib saqlandi')
  }
  const remove = async (s, dropTables = false) => {
    if (counts[s.key] && !dropTables) return setConfirmDel(s)
    if (await save(sections.filter(x => x.key !== s.key), dropTables ? `«${s.label}» ${counts[s.key]} ta stoli bilan o'chirildi` : "O'chirildi", { dropTables })) setConfirmDel(null)
  }

  return (
    <Modal open={open} onClose={onClose} title="Stol bo'limlari" maxWidth={560}
      footer={<button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onClose}>Yopish</button>}>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 14.5 }}>
        Restoraningiz qanday bo'lingan bo'lsa, shunday bo'limlar yarating: «Zal», «2-etaj», «Lux xonalar», «Terrasa».
        Keragi yo'q bo'limni o'chiring — kamida bittasi qolishi kerak. Ofitsant stollarni shu bo'limlar bo'yicha ko'radi.
      </p>
      <form className="row" style={{ gap: 8, marginBottom: 16 }} onSubmit={e => { e.preventDefault(); add() }}>
        <input className="input" style={{ flex: 1 }} value={name} onChange={e => setName(e.target.value)}
          placeholder="Yangi bo'lim, masalan: 2-etaj" maxLength={30}/>
        <button className="btn btn-primary" disabled={busy || !name.trim()}><Plus size={18}/> Qo'shish</button>
      </form>

      <div className="col" style={{ gap: 6 }}>
        {sections.map((s, i) => (
          <div key={s.key} className="row" style={{ gap: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--thumb)' }}>
            {editKey === s.key ? (
              <form className="row" style={{ gap: 8, flex: 1 }} onSubmit={e => { e.preventDefault(); rename(s) }}>
                <input className="input" style={{ flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} maxLength={30} autoFocus/>
                <button className="btn btn-primary btn-icon" disabled={busy} title="Saqlash"><Check size={18}/></button>
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => setEditKey(null)} title="Bekor qilish"><X size={18}/></button>
              </form>
            ) : (
              <>
                <span style={{ flex: 1, fontWeight: 600, minWidth: 0 }} className="truncate">{s.label}</span>
                <span className="muted" style={{ fontSize: 14 }}>{counts[s.key] || 0} ta stol</span>
                <button className="btn btn-ghost btn-icon" disabled={busy || i === 0} title="Yuqoriga" onClick={() => move(i, -1)}><ArrowUp size={17}/></button>
                <button className="btn btn-ghost btn-icon" disabled={busy || i === sections.length - 1} title="Pastga" onClick={() => move(i, 1)}><ArrowDown size={17}/></button>
                <button className="btn btn-soft btn-icon" title="Nomini o'zgartirish" onClick={() => { setEditKey(s.key); setEditName(s.label) }}><Pencil size={17}/></button>
                <button className="btn btn-danger btn-icon" disabled={busy || sections.length === 1}
                  title={sections.length === 1 ? "Kamida bitta bo'lim qolishi kerak" : "O'chirish"} onClick={() => remove(s)}><Trash2 size={17}/></button>
              </>
            )}
          </div>
        ))}
      </div>

      {confirmDel && (
        <div className="calc-row" style={{ marginTop: 14, flexDirection: 'column', alignItems: 'stretch', background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
          <span>«{confirmDel.label}» bo'limida <b>{counts[confirmDel.key]} ta stol</b> bor. Bo'lim stollari bilan birga o'chiriladi
            (band stol bo'lsa — o'chirilmaydi). Yopilgan buyurtmalar tarixi saqlanadi.</span>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Bekor qilish</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => remove(confirmDel, true)}><Trash2 size={17}/> Stollari bilan o'chirish</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

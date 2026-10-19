import React, { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Plus, Phone, Users, ChevronLeft, ChevronRight, Check, X, Pencil, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import Modal from '../../components/shared/Modal.jsx'
import { PageHead, Field, Loading, Empty, money, hhmm } from '../../components/ui.jsx'

const CAT = { zal: 'Zal', xona: 'Xona', "ko'cha": "Ko'cha" }
const STATUS = {
  booked:    ['Kutilmoqda', 'tag-yel'],
  arrived:   ['Keldi', 'tag-ok'],
  cancelled: ['Bekor', 'tag-soft'],
  noshow:    ['Kelmadi', 'tag-soft'],
}
const UZ_DAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return iso(d) }
const dayTitle = s => {
  const today = iso(new Date())
  const d = new Date(s + 'T00:00')
  const rel = s === today ? 'Bugun' : s === addDays(today, 1) ? 'Ertaga' : s === addDays(today, -1) ? 'Kecha' : UZ_DAYS[d.getDay()]
  return `${rel}, ${d.getDate()} ${UZ_MONTHS[d.getMonth()]}`
}

const EMPTY = { tableId: '', date: '', time: '19:00', duration: 120, guests: 4, name: '', phone: '+998 ', deposit: '', note: '' }

export default function Reservations() {
  const [day, setDay] = useState(() => iso(new Date()))
  const [list, setList] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)        // null | { ...EMPTY, _id? }
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(null)

  const load = () => API.get(`/api/reservations?from=${day}&to=${day}`)
    .then(r => setList(r.data)).catch(() => toast.error("Yuklab bo'lmadi")).finally(() => setLoading(false))

  useEffect(() => { setLoading(true); load() }, [day])
  useEffect(() => {
    API.get('/api/tables').then(r => setTables(r.data.filter(t => t.category !== 'soboy').sort((a, b) => a.category.localeCompare(b.category) || a.number - b.number)))
    const s = createSocket()
    s.on('reservationsChanged', () => load())
    return () => s.disconnect()
  }, [day])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openNew = () => setForm({ ...EMPTY, date: day, tableId: tables.find(t => t.category === 'xona')?._id || tables[0]?._id || '' })
  const openEdit = r => {
    const d = new Date(r.startAt)
    setForm({ _id: r._id, tableId: r.tableId, date: iso(d), time: hhmm(d), duration: r.duration, guests: r.guests, name: r.name, phone: r.phone, deposit: r.deposit || '', note: r.note || '' })
  }

  const save = async () => {
    if (!form.name.trim()) return toast.error('Mijoz ismini kiriting')
    if (!form.tableId) return toast.error('Stol yoki xonani tanlang')
    setSaving(true)
    try {
      const body = {
        tableId: form.tableId, startAt: new Date(`${form.date}T${form.time}`).toISOString(),
        duration: form.duration, guests: form.guests, name: form.name, phone: form.phone.trim() === '+998' ? '' : form.phone,
        deposit: form.deposit || 0, note: form.note,
      }
      if (form._id) await API.put(`/api/reservations/${form._id}`, body)
      else await API.post('/api/reservations', body)
      toast.success(form._id ? 'Bron yangilandi' : 'Bron qo\'shildi')
      setForm(null)
      if (form.date !== day) setDay(form.date); else load()
    } catch (err) { toast.error(err.response?.data?.message || 'Saqlab bo\'lmadi') }
    finally { setSaving(false) }
  }

  const setStatus = async (r, status) => {
    try { await API.put(`/api/reservations/${r._id}`, { status }); load() }
    catch (err) { toast.error(err.response?.data?.message || 'Xatolik') }
  }
  const remove = async () => {
    try { await API.delete(`/api/reservations/${removing._id}`); setRemoving(null); load(); toast.success("O'chirildi") }
    catch { toast.error('Xatolik') }
  }

  const active = list.filter(r => r.status === 'booked')
  const guests = active.reduce((s, r) => s + r.guests, 0)
  const groups = useMemo(() => {
    const byCat = {}
    for (const t of tables) (byCat[t.category] ||= []).push(t)
    return byCat
  }, [tables])

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <PageHead title="Bron" sub={`${dayTitle(day)} · ${active.length} ta faol · ${guests} kishi`}
        actions={<button className="btn btn-primary btn-lg" onClick={openNew}><Plus size={20}/> Yangi bron</button>}/>

      <div className="row" style={{ gap: 10, marginBottom: 18 }}>
        <button className="btn btn-soft btn-lg btn-icon" onClick={() => setDay(addDays(day, -1))} aria-label="Oldingi kun"><ChevronLeft size={22}/></button>
        <button className={`btn btn-lg ${day === iso(new Date()) ? 'btn-dark' : 'btn-soft'}`} onClick={() => setDay(iso(new Date()))}>Bugun</button>
        <input className="input mono" type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} style={{ width: 190 }}/>
        <button className="btn btn-soft btn-lg btn-icon" onClick={() => setDay(addDays(day, 1))} aria-label="Keyingi kun"><ChevronRight size={22}/></button>
      </div>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={CalendarClock} title="Bu kunga bron yo'q" text="Mijoz telefon qilganda «Yangi bron» tugmasi orqali qo'shing." action={<button className="btn btn-dark btn-lg" onClick={openNew}><Plus size={20}/> Yangi bron</button>}/>
      ) : (
        <div className="card">
          {list.map(r => {
            const [label, cls] = STATUS[r.status] || STATUS.booked
            const past = r.status === 'booked' && new Date(r.startAt).getTime() < Date.now() - 30 * 60000
            return (
              <div key={r._id} className="res-row" style={{ opacity: ['cancelled', 'noshow'].includes(r.status) ? .55 : 1 }}>
                <div className="res-time mono">{hhmm(r.startAt)}<small>{r.duration} daq</small></div>
                <div className="res-table"><small>{CAT[r.category] || r.category}</small><b>{String(r.tableNumber).padStart(2, '0')}</b></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <b style={{ fontSize: 17 }} className="truncate">{r.name}</b>
                    <span className={`tag ${cls}`}>{past ? 'Kechikmoqda' : label}</span>
                  </div>
                  <div className="row muted" style={{ gap: 14, fontSize: 14, marginTop: 4, flexWrap: 'wrap' }}>
                    <span className="row" style={{ gap: 5 }}><Users size={15}/>{r.guests} kishi</span>
                    {r.phone && <a className="row" style={{ gap: 5, color: 'inherit' }} href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}><Phone size={15}/>{r.phone}</a>}
                    {r.deposit > 0 && <span className="mono">oldindan {money(r.deposit)}</span>}
                    {r.note && <span className="truncate">— {r.note}</span>}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {r.status === 'booked' && <>
                    <button className="btn btn-dark" onClick={() => setStatus(r, 'arrived')}><Check size={18}/> Keldi</button>
                    <button className="btn btn-soft hide-mobile" onClick={() => setStatus(r, 'noshow')}>Kelmadi</button>
                    <button className="btn btn-ghost btn-icon" title="Bekor qilish" onClick={() => setStatus(r, 'cancelled')}><X size={18}/></button>
                  </>}
                  {r.status !== 'booked' && <button className="btn btn-soft" onClick={() => setStatus(r, 'booked')}>Qaytarish</button>}
                  <button className="btn btn-ghost btn-icon" title="Tahrirlash" onClick={() => openEdit(r)}><Pencil size={18}/></button>
                  <button className="btn btn-ghost btn-icon" title="O'chirish" onClick={() => setRemoving(r)}><Trash2 size={18}/></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?._id ? 'Bronni tahrirlash' : 'Yangi bron'} maxWidth={560}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setForm(null)}>Bekor qilish</button>
          <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>{saving ? 'Saqlanmoqda…' : 'Saqlash'}</button>
        </>}>
        {form && <div className="col" style={{ gap: 14 }}>
          <div className="form-2">
            <Field label="Mijoz ismi" required><input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Karimovlar" autoFocus/></Field>
            <Field label="Telefon"><input className="input mono" value={form.phone} onChange={e => set('phone', e.target.value)} inputMode="tel"/></Field>
          </div>
          <Field label="Stol / xona" required>
            <select className="input" value={form.tableId} onChange={e => set('tableId', e.target.value)}>
              {Object.entries(groups).map(([cat, ts]) => (
                <optgroup key={cat} label={CAT[cat] || cat}>
                  {ts.map(t => <option key={t._id} value={t._id}>{CAT[cat] || cat} {t.number}{t.description ? ` — ${t.description}` : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <div className="form-3">
            <Field label="Sana"><input className="input mono" type="date" value={form.date} onChange={e => set('date', e.target.value)}/></Field>
            <Field label="Vaqt"><input className="input mono" type="time" value={form.time} onChange={e => set('time', e.target.value)}/></Field>
            <Field label="Necha soat">
              <select className="input" value={form.duration} onChange={e => set('duration', +e.target.value)}>
                {[60, 90, 120, 180, 240, 360].map(m => <option key={m} value={m}>{m / 60} soat</option>)}
              </select>
            </Field>
          </div>
          <div className="form-2">
            <Field label="Mehmonlar soni"><input className="input mono" type="number" min={1} value={form.guests} onChange={e => set('guests', e.target.value)}/></Field>
            <Field label="Oldindan to'lov (so'm)"><input className="input mono" type="number" min={0} value={form.deposit} onChange={e => set('deposit', e.target.value)} placeholder="0"/></Field>
          </div>
          <Field label="Izoh"><input className="input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="Tug'ilgan kun, tort olib kelishadi…"/></Field>
        </div>}
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Bronni o'chirish" maxWidth={420}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setRemoving(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={remove}>Ha, o'chirish</button>
        </>}>
        {removing && <p style={{ margin: 0, fontSize: 16 }}>{removing.name} — {hhmm(removing.startAt)}, {CAT[removing.category]} {removing.tableNumber}</p>}
      </Modal>
    </div>
  )
}

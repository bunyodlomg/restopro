import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle, Package2, PackagePlus, PackageMinus, ClipboardCheck, History, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import Modal from '../../components/shared/Modal.jsx'
import { Select, DateInput } from '../../components/shared/Pickers.jsx'
import { Field, Switch, Loading, Empty, PageHead, Seg, money } from '../../components/ui.jsx'

// Ombor: qoldiq faqat harakat orqali o'zgaradi — Kirim (xarid, chiqimga yoziladi), Hisobdan chiqarish,
// Sanash (inventarizatsiya) va buyurtma yopilganda retsept bo'yicha sarf. Har harakat «Tarix»da.

const UNITS = ['kg', 'g', 'l', 'ml', 'dona', 'paket'].map(u => ({ value: u, label: u }))
const EMPTY = { name: '', unit: 'kg', quantity: '', minQty: '', price: '', asPurchase: true }
const fmtQty = n => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('ru-RU')
const MOVE = {
  in:     { l: 'Kirim',              c: 'tag-ok' },
  out:    { l: 'Sarf (buyurtma)',    c: '' },
  waste:  { l: 'Hisobdan chiqarildi', c: 'tag-yel' },
  adjust: { l: 'Inventarizatsiya',   c: '' },
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const when = d => new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const stateOf = it => (it.quantity <= 0 ? 'out' : it.minQty > 0 && it.quantity <= it.minQty ? 'low' : 'ok')

export default function Ingredients() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [form, setForm] = useState(null)        // qo'shish / tahrirlash
  const [action, setAction] = useState(null)    // { kind: 'in' | 'waste' | 'count', it }
  const [deleting, setDeleting] = useState(null)
  const [historyOf, setHistoryOf] = useState('')

  const load = () => API.get('/api/ingredients').then(r => setItems(r.data)).catch(() => toast.error("Yuklab bo'lmadi")).finally(() => setLoading(false))
  useEffect(() => {
    load()
    const s = createSocket()
    s.on('stockChanged', load)
    s.on('syncApplied', ({ colls }) => { if (colls.includes('ingredients')) load() })
    return () => s.disconnect()
  }, [])

  const out = items.filter(it => stateOf(it) === 'out')
  const low = items.filter(it => stateOf(it) === 'low')
  const worth = items.reduce((s, it) => s + (Number(it.price) || 0) * Math.max(0, Number(it.quantity) || 0), 0)
  const list = tab === 'low' ? [...out, ...low] : items

  const openHistory = id => { setHistoryOf(id); setTab('history') }

  return (
    <div className="page">
      <PageHead title="Ombor" sub={`${items.length} ta mahsulot · qiymati ${money(worth)} so'm`}
        actions={<button className="btn btn-primary btn-lg" onClick={() => setForm({ ...EMPTY })}><Plus size={20}/> Yangi mahsulot</button>}/>

      {(out.length > 0 || low.length > 0) && (
        <div className="card card-pad stock-alert" style={{ marginBottom: 16 }}>
          <AlertTriangle size={24} style={{ flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{out.length ? `${out.length} ta mahsulot tugagan` : ''}{out.length && low.length ? ' · ' : ''}{low.length ? `${low.length} ta kam qolgan` : ''}</b>
            <div className="hint" style={{ color: 'inherit', opacity: .85 }}>
              {[...out, ...low].slice(0, 6).map(it => `${it.name} — ${fmtQty(it.quantity)} ${it.unit}`).join(' · ')}{out.length + low.length > 6 ? ' …' : ''}
            </div>
          </div>
          {tab !== 'low' && <button className="btn btn-soft" onClick={() => setTab('low')}>Ko'rish</button>}
        </div>
      )}

      <Seg value={tab} onChange={k => { setTab(k); if (k !== 'history') setHistoryOf('') }} style={{ marginBottom: 18 }}
        items={[{ k: 'all', l: 'Barchasi', n: items.length }, { k: 'low', l: 'Kam qolgan', n: out.length + low.length, icon: AlertTriangle }, { k: 'history', l: 'Tarix', icon: History }]}/>

      {tab === 'history' ? <Moves items={items} ingredientId={historyOf} onIngredient={setHistoryOf}/> : loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={Package2} title={tab === 'low' ? "Kam qolgan mahsulot yo'q" : "Ombor bo'sh"}
          text={tab === 'low' ? 'Hamma mahsulot yetarli miqdorda.' : "Un, go'sht, yog' kabi mahsulotlarni qo'shing — buyurtma yopilganda retsept bo'yicha avtomatik ayiriladi."}
          action={tab === 'all' && <button className="btn btn-primary btn-lg" onClick={() => setForm({ ...EMPTY })}><Plus size={20}/> Yangi mahsulot</button>}/>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr>
              <th>Nomi</th><th className="r">Qoldiq</th><th className="r">Narxi (1 birlik)</th><th className="r">Qiymati</th><th/>
            </tr></thead>
            <tbody>
              {list.map(it => {
                const st = stateOf(it)
                const pct = it.minQty > 0 ? Math.max(3, Math.min(100, (it.quantity / (it.minQty * 2)) * 100)) : null
                return (
                  <tr key={it._id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <b style={{ fontWeight: 600 }}>{it.name}</b>
                        {st === 'out' && <span className="tag tag-accent">Tugagan</span>}
                        {st === 'low' && <span className="tag tag-yel">Kam</span>}
                      </div>
                      {pct !== null && <span className="meter" style={{ marginTop: 8, display: 'block', maxWidth: 220 }}>
                        <i style={{ width: `${pct}%`, background: st === 'ok' ? 'var(--ok)' : st === 'low' ? 'var(--warn)' : 'var(--accent)' }}/>
                      </span>}
                    </td>
                    <td className="r mono" style={{ fontWeight: 600, color: st !== 'ok' ? 'var(--accent-ink)' : undefined }}>
                      {fmtQty(it.quantity)} <span className="muted">{it.unit}</span>
                      {it.minQty > 0 && <div className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>min {fmtQty(it.minQty)}</div>}
                    </td>
                    <td className="r mono">{it.price ? money(it.price) : '—'}</td>
                    <td className="r mono">{it.price && it.quantity > 0 ? money(it.price * it.quantity) : '—'}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button className="btn btn-primary btn-sm" title="Kirim (xarid)" onClick={() => setAction({ kind: 'in', it })}><PackagePlus size={17}/> Kirim</button>
                        <button className="btn btn-soft btn-icon" title="Hisobdan chiqarish" onClick={() => setAction({ kind: 'waste', it })}><PackageMinus size={18}/></button>
                        <button className="btn btn-soft btn-icon" title="Sanash (inventarizatsiya)" onClick={() => setAction({ kind: 'count', it })}><ClipboardCheck size={18}/></button>
                        <button className="btn btn-soft btn-icon" title="Tarix" onClick={() => openHistory(it._id)}><History size={18}/></button>
                        <button className="btn btn-soft btn-icon" title="Tahrirlash" onClick={() => setForm({ ...it, _id: it._id })}><Pencil size={18}/></button>
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

      {form && <ItemModal form={form} setForm={setForm} onSaved={() => { setForm(null); load() }}/>}
      {action && <ActionModal {...action} onClose={() => setAction(null)} onDone={() => { setAction(null); load() }}/>}

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Mahsulotni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setDeleting(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={async () => {
            try {
              const { data } = await API.delete(`/api/ingredients/${deleting._id}`)
              toast.success(data.recipes ? `O'chirildi · ${data.recipes} ta retseptdan olib tashlandi` : "O'chirildi"); setDeleting(null); load()
            } catch { toast.error('Xatolik') }
          }}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>«{deleting?.name}» ombordan o'chiriladi va taomlar retseptidan olib tashlanadi. Harakatlar tarixi qoladi.</p>
      </Modal>
    </div>
  )
}

// Qo'shish / tahrirlash. Qoldiq faqat yangi mahsulotda kiritiladi — keyin Kirim / Sanash orqali
function ItemModal({ form, setForm, onSaved }) {
  const editing = !!form._id
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    if (!form.name?.trim()) return toast.error('Nomi majburiy')
    setSaving(true)
    try {
      if (editing) await API.put(`/api/ingredients/${form._id}`, { name: form.name, unit: form.unit, minQty: form.minQty, price: form.price })
      else await API.post('/api/ingredients', form)
      toast.success(editing ? 'Saqlandi' : "Qo'shildi"); onSaved()
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setSaving(false) }
  }
  const qty = +form.quantity || 0, price = +form.price || 0
  return (
    <Modal open onClose={() => setForm(null)} title={editing ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}
      footer={<>
        <button className="btn btn-ghost btn-lg" onClick={() => setForm(null)}>Bekor qilish</button>
        <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={save} disabled={saving}>{saving ? <><span className="spinner-sm"/> Saqlanmoqda</> : 'Saqlash'}</button>
      </>}>
      <Field label="Nomi" required><input className="input" value={form.name} onChange={set('name')} placeholder="Masalan: Un" autoFocus/></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="O'lchov birligi" hint={editing ? 'kg ↔ g, l ↔ ml almashsa qoldiq o\'zi o\'giriladi' : undefined}>
          <Select value={form.unit === 'litr' ? 'l' : form.unit} onChange={v => setForm(f => ({ ...f, unit: v }))} options={UNITS}/>
        </Field>
        <Field label="Minimum chegara" hint="Shundan kam qolsa ogohlantiradi"><input className="input mono" type="number" min={0} value={form.minQty} onChange={set('minQty')} placeholder="0"/></Field>
      </div>
      <Field label={`1 ${form.unit} narxi (so'm)`} hint={editing ? "Kirimda o'rtacha narx o'zi hisoblanadi" : undefined}>
        <input className="input mono" type="number" min={0} value={form.price} onChange={set('price')} placeholder="0"/>
      </Field>
      {!editing && <>
        <Field label="Hozirgi qoldiq" hint="Ixtiyoriy — keyin «Kirim» bilan ham qo'shsa bo'ladi">
          <input className="input mono" type="number" min={0} value={form.quantity} onChange={set('quantity')} placeholder="0"/>
        </Field>
        {qty > 0 && <Switch checked={form.asPurchase} onChange={v => setForm(f => ({ ...f, asPurchase: v }))}
          label="Xarid sifatida chiqimga yozilsin"
          hint={form.asPurchase && price ? `Bugungi chiqimga ${money(qty * price)} so'm qo'shiladi` : "Avvaldan bor tovar — chiqimga yozilmaydi"}/>}
      </>}
    </Modal>
  )
}

// Kirim / Hisobdan chiqarish / Sanash
function ActionModal({ kind, it, onClose, onDone }) {
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState(it.price || '')
  const [byTotal, setByTotal] = useState(false)
  const [total, setTotal] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const q = +qty || 0
  const title = { in: `Kirim — ${it.name}`, waste: `Hisobdan chiqarish — ${it.name}`, count: `Sanash — ${it.name}` }[kind]
  const sum = byTotal ? +total || 0 : Math.round(q * (+price || 0))
  const diff = kind === 'count' && qty !== '' ? q - it.quantity : 0

  const submit = async () => {
    if (kind === 'count' ? qty === '' || q < 0 : q <= 0) return toast.error('Miqdorni kiriting')
    setBusy(true)
    try {
      if (kind === 'in') await API.post(`/api/ingredients/${it._id}/restock`, { quantity: q, ...(byTotal ? { totalCost: +total || 0 } : { unitPrice: +price || 0 }), note })
      if (kind === 'waste') await API.post(`/api/ingredients/${it._id}/writeoff`, { quantity: q, note })
      if (kind === 'count') await API.post(`/api/ingredients/${it._id}/count`, { actual: q, note })
      toast.success({ in: 'Kirim qayd etildi', waste: 'Hisobdan chiqarildi', count: 'Qoldiq tenglandi' }[kind]); onDone()
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={title} maxWidth={480}
      footer={<>
        <button className="btn btn-ghost btn-lg" onClick={onClose}>Bekor qilish</button>
        <button className={`btn btn-lg ${kind === 'waste' ? 'btn-danger' : 'btn-primary'}`} style={{ flex: 1 }} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner-sm"/> : { in: 'Kirim qilish', waste: 'Hisobdan chiqarish', count: 'Tenglash' }[kind]}
        </button>
      </>}>
      <div className="hint" style={{ marginBottom: 14, fontSize: 14 }}>Hozir omborda: <b className="mono">{fmtQty(it.quantity)} {it.unit}</b></div>
      <Field label={kind === 'count' ? `Sanalgan haqiqiy qoldiq (${it.unit})` : `Miqdor (${it.unit})`} required>
        <input className="input mono" type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} placeholder="0" autoFocus/>
      </Field>
      {kind === 'in' && <>
        <Seg value={byTotal ? 'total' : 'unit'} onChange={k => setByTotal(k === 'total')} style={{ marginBottom: 12 }}
          items={[{ k: 'unit', l: `1 ${it.unit} narxi` }, { k: 'total', l: 'Jami summa' }]}/>
        {byTotal
          ? <Field label="To'langan jami summa (so'm)"><input className="input mono" type="number" min={0} value={total} onChange={e => setTotal(e.target.value)} placeholder="0"/></Field>
          : <Field label={`1 ${it.unit} narxi (so'm)`}><input className="input mono" type="number" min={0} value={price} onChange={e => setPrice(e.target.value)} placeholder="0"/></Field>}
        {q > 0 && <div className="calc-row"><span>Chiqimga yoziladi</span><b className="mono">{money(sum)} so'm</b></div>}
        {q > 0 && byTotal && +total > 0 && <div className="calc-row muted"><span>1 {it.unit} narxi</span><span className="mono">{money(+total / q)}</span></div>}
      </>}
      {kind === 'count' && qty !== '' && (
        <div className="calc-row" style={{ color: diff < 0 ? 'var(--accent-ink)' : undefined }}>
          <span>{diff === 0 ? 'Farq yo\'q' : diff < 0 ? 'Kamomad' : 'Ortiqcha'}</span>
          <b className="mono">{diff > 0 ? '+' : ''}{fmtQty(diff)} {it.unit}{it.price && diff ? ` · ${money(Math.abs(diff) * it.price)} so'm` : ''}</b>
        </div>
      )}
      <Field label="Izoh" style={{ marginTop: 12 }}>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={200}
          placeholder={{ in: "Masalan: Bozordan, Karimov do'koni", waste: 'Masalan: buzilib qoldi', count: 'Masalan: oy oxiri sanog\'i' }[kind]}/>
      </Field>
    </Modal>
  )
}

// Harakatlar tarixi — filtrlar bilan
function Moves({ items, ingredientId, onIngredient }) {
  const [type, setType] = useState('')
  const [from, setFrom] = useState(daysAgo(6))
  const [to, setTo] = useState(iso(new Date()))
  const [rows, setRows] = useState(null)

  useEffect(() => {
    setRows(null)
    const q = new URLSearchParams({ from, to, ...(ingredientId ? { ingredientId } : {}), ...(type ? { type } : {}) })
    API.get(`/api/ingredients/moves?${q}`).then(r => setRows(r.data)).catch(() => { toast.error("Yuklab bo'lmadi"); setRows([]) })
  }, [ingredientId, type, from, to])

  const totals = useMemo(() => {
    const t = { in: 0, out: 0, waste: 0 }
    for (const m of rows || []) if (t[m.type] !== undefined) t[m.type] += m.cost || 0
    return t
  }, [rows])

  return <>
    <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
      <Select value={ingredientId} onChange={onIngredient} style={{ width: 230 }}
        options={[{ value: '', label: 'Barcha mahsulotlar' }, ...items.map(i => ({ value: i._id, label: i.name }))]}/>
      <Select value={type} onChange={setType} style={{ width: 210 }}
        options={[{ value: '', label: 'Barcha harakatlar' }, ...Object.entries(MOVE).map(([k, v]) => ({ value: k, label: v.l }))]}/>
      <DateInput value={from} onChange={setFrom} style={{ width: 200 }}/>
      <DateInput value={to} onChange={setTo} min={from} style={{ width: 200 }}/>
    </div>
    <div className="kpis" style={{ marginBottom: 14 }}>
      <div className="card card-pad"><div className="label">Kirim</div><b className="mono" style={{ fontSize: 22 }}>{money(totals.in)}</b></div>
      <div className="card card-pad"><div className="label">Sarf (tannarx)</div><b className="mono" style={{ fontSize: 22 }}>{money(totals.out)}</b></div>
      <div className="card card-pad"><div className="label">Hisobdan chiqarilgan</div><b className="mono" style={{ fontSize: 22 }}>{money(totals.waste)}</b></div>
    </div>
    {!rows ? <Loading/> : rows.length === 0 ? <Empty icon={History} title="Harakat yo'q" text="Tanlangan davrda kirim yoki chiqim bo'lmagan."/> : (
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Vaqt</th><th>Mahsulot</th><th>Harakat</th><th className="r">Miqdor</th><th className="r">Summa</th><th>Izoh</th></tr></thead>
          <tbody>
            {rows.map(m => (
              <tr key={m._id}>
                <td className="mono muted">{when(m.createdAt)}</td>
                <td><b style={{ fontWeight: 600 }}>{m.ingredientName}</b></td>
                <td><span className={`tag ${MOVE[m.type]?.c ?? ''}`}>{MOVE[m.type]?.l || m.type}</span></td>
                <td className="r mono" style={{ color: m.quantity < 0 ? 'var(--accent-ink)' : 'var(--ok)', fontWeight: 600 }}>
                  {m.quantity < 0 ? <ArrowUpRight size={14}/> : <ArrowDownLeft size={14}/>} {m.quantity > 0 ? '+' : ''}{fmtQty(m.quantity)} {m.unit}
                </td>
                <td className="r mono">{m.cost ? money(m.cost) : '—'}</td>
                <td className="muted truncate" style={{ maxWidth: 260 }}>{m.note || (m.orderId ? 'Buyurtma yopildi' : '')}{m.by ? ` · ${m.by}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </>
}

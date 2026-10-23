import React, { useEffect, useState } from 'react'
import { UserPlus, Search, HandCoins, Plus, History, Pencil, Trash2, Phone, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { createSocket } from '../../api/socket.js'
import Modal from '../../components/shared/Modal.jsx'
import { Field, Loading, Empty, PageHead, Seg, money, initials } from '../../components/ui.jsx'

// Qarzdor mijozlar: qo'lda kiritish (avvaldan qarzi bilan), to'lov qabul qilish, qarz qo'shish, tarix.
// Buyurtmani qarzga yopish — Buyurtmalar sahifasidagi «Qarzga» tugmasi.

const when = d => new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Debts() {
  const [data, setData] = useState({ customers: [], total: 0, count: 0 })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [show, setShow] = useState('debt')
  const [form, setForm] = useState(null)          // qo'shish / tahrirlash
  const [action, setAction] = useState(null)      // { kind: 'pay' | 'debt', c }
  const [history, setHistory] = useState(null)    // mijoz
  const [deleting, setDeleting] = useState(null)

  const load = () => API.get(`/api/debts/customers?${new URLSearchParams({ q, ...(show === 'all' ? { all: '1' } : {}) })}`)
    .then(r => setData(r.data)).catch(() => toast.error("Yuklab bo'lmadi")).finally(() => setLoading(false))
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t) }, [q, show])
  useEffect(() => {
    const s = createSocket()
    s.on('debtsChanged', load)
    s.on('syncApplied', ({ colls }) => { if (colls.some(c => ['customers', 'debttxes'].includes(c))) load() })
    return () => s.disconnect()
  }, [q, show])

  const list = data.customers

  return (
    <div className="page">
      <PageHead title="Qarzlar" sub={`${data.count} ta qarzdor · jami ${money(data.total)} so'm`}
        actions={<>
          <div className="input-icon" style={{ width: 240 }}>
            <Search size={19}/>
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Ism yoki telefon"/>
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => setForm({ name: '', phone: '', note: '', debt: '', debtNote: '' })}><UserPlus size={20}/> Mijoz qo'shish</button>
        </>}/>

      <Seg value={show} onChange={setShow} style={{ marginBottom: 18 }} items={[{ k: 'debt', l: 'Qarzi borlar', n: data.count }, { k: 'all', l: 'Hammasi' }]}/>

      {loading ? <Loading/> : list.length === 0 ? (
        <Empty icon={Wallet} title={q ? 'Topilmadi' : "Qarzdor yo'q"}
          text={q ? `«${q}» bo'yicha mijoz yo'q` : "Buyurtmani «Qarzga» yopsangiz yoki qarzdor mijozni qo'lda kiritsangiz, shu yerda ko'rinadi."}
          action={!q && <button className="btn btn-primary btn-lg" onClick={() => setForm({ name: '', phone: '', note: '', debt: '', debtNote: '' })}><UserPlus size={20}/> Mijoz qo'shish</button>}/>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Mijoz</th><th>Telefon</th><th className="r">Qarzi</th><th>Oxirgi harakat</th><th/></tr></thead>
            <tbody>
              {list.map(c => (
                <tr key={c._id}>
                  <td>
                    <div className="row" style={{ gap: 12 }}>
                      <span className="lst-th">{initials(c.name)}</span>
                      <div style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }}>{c.name}</b>{c.note && <div className="hint truncate" style={{ maxWidth: 260 }}>{c.note}</div>}</div>
                    </div>
                  </td>
                  <td className="mono">{c.phone ? <a href={`tel:${c.phone}`} className="row" style={{ gap: 6, color: 'inherit' }}><Phone size={15}/>{c.phone}</a> : <span className="muted">—</span>}</td>
                  <td className="r mono" style={{ fontWeight: 700, fontSize: 17, color: c.balance > 0 ? 'var(--accent-ink)' : 'var(--ok-ink)' }}>{c.balance > 0 ? money(c.balance) : "yo'q"}</td>
                  <td className="muted mono" style={{ fontSize: 13.5 }}>{c.lastAt ? when(c.lastAt) : '—'}</td>
                  <td className="r">
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn btn-ok btn-sm" disabled={!(c.balance > 0)} onClick={() => setAction({ kind: 'pay', c })}><HandCoins size={17}/> To'lov</button>
                      <button className="btn btn-soft btn-icon" title="Qarz qo'shish" onClick={() => setAction({ kind: 'debt', c })}><Plus size={18}/></button>
                      <button className="btn btn-soft btn-icon" title="Tarix" onClick={() => setHistory(c)}><History size={18}/></button>
                      <button className="btn btn-soft btn-icon" title="Tahrirlash" onClick={() => setForm({ _id: c._id, name: c.name, phone: c.phone || '', note: c.note || '' })}><Pencil size={18}/></button>
                      <button className="btn btn-ghost btn-icon" title={c.balance > 0 ? "Qarzi bor — o'chirib bo'lmaydi" : "O'chirish"} disabled={c.balance > 0} style={{ color: 'var(--accent-ink)' }} onClick={() => setDeleting(c)}><Trash2 size={18}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && <CustomerModal form={form} setForm={setForm} onSaved={() => { setForm(null); load() }}/>}
      {action && <AmountModal {...action} onClose={() => setAction(null)} onDone={() => { setAction(null); load() }}/>}
      {history && <HistoryModal c={history} onClose={() => setHistory(null)}/>}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Mijozni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setDeleting(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={async () => {
            try { await API.delete(`/api/debts/customers/${deleting._id}`); toast.success("O'chirildi"); setDeleting(null); load() }
            catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
          }}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>«{deleting?.name}» ro'yxatdan o'chiriladi. Qarz harakatlari tarixi saqlanadi.</p>
      </Modal>
    </div>
  )
}

function CustomerModal({ form, setForm, onSaved }) {
  const editing = !!form._id
  const [busy, setBusy] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    if (!form.name.trim()) return toast.error('Mijoz ismini yozing')
    setBusy(true)
    try {
      if (editing) await API.put(`/api/debts/customers/${form._id}`, { name: form.name, phone: form.phone, note: form.note })
      else await API.post('/api/debts/customers', form)
      toast.success(editing ? 'Saqlandi' : "Mijoz qo'shildi"); onSaved()
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setBusy(false) }
  }
  return (
    <Modal open onClose={() => setForm(null)} title={editing ? 'Mijozni tahrirlash' : "Qarzdor mijoz qo'shish"} maxWidth={500}
      footer={<>
        <button className="btn btn-ghost btn-lg" onClick={() => setForm(null)}>Bekor qilish</button>
        <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={save} disabled={busy}>{busy ? <span className="spinner-sm"/> : 'Saqlash'}</button>
      </>}>
      <Field label="Ism familiya" required><input className="input" value={form.name} onChange={set('name')} placeholder="Masalan: Akmal aka" autoFocus/></Field>
      <Field label="Telefon"><input className="input mono" type="tel" value={form.phone} onChange={set('phone')} placeholder="+998 90 123 45 67"/></Field>
      <Field label="Izoh"><input className="input" value={form.note} onChange={set('note')} placeholder="Masalan: qo'shni do'kon egasi" maxLength={200}/></Field>
      {!editing && <>
        <Field label="Hozirgi qarzi (so'm)" hint="Avvaldan qarzdor bo'lsa — summasini yozing; bo'lmasa bo'sh qoldiring">
          <input className="input mono" type="number" min={0} value={form.debt} onChange={set('debt')} placeholder="0"/>
        </Field>
        {+form.debt > 0 && <Field label="Qarz izohi"><input className="input" value={form.debtNote} onChange={set('debtNote')} placeholder="Masalan: oktabr oyidagi to'y" maxLength={200}/></Field>}
      </>}
    </Modal>
  )
}

function AmountModal({ kind, c, onClose, onDone }) {
  const [amount, setAmount] = useState(kind === 'pay' ? String(Math.round(c.balance)) : '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const a = Math.round(+amount || 0)
  const submit = async () => {
    if (!(a > 0)) return toast.error('Summani kiriting')
    setBusy(true)
    try {
      await API.post(`/api/debts/customers/${c._id}/${kind}`, { amount: a, note })
      toast.success(kind === 'pay' ? `${money(a)} so'm qabul qilindi` : `${money(a)} so'm qarzga yozildi`); onDone()
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setBusy(false) }
  }
  const after = kind === 'pay' ? c.balance - a : c.balance + a
  return (
    <Modal open onClose={onClose} title={`${kind === 'pay' ? "To'lov qabul qilish" : "Qarz qo'shish"} — ${c.name}`} maxWidth={460}
      footer={<>
        <button className="btn btn-ghost btn-lg" onClick={onClose}>Bekor qilish</button>
        <button className={`btn btn-lg ${kind === 'pay' ? 'btn-ok' : 'btn-primary'}`} style={{ flex: 1 }} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner-sm"/> : kind === 'pay' ? "To'lovni qabul qilish" : 'Qarzga yozish'}
        </button>
      </>}>
      <div className="hint" style={{ marginBottom: 14, fontSize: 14 }}>Hozirgi qarzi: <b className="mono">{money(c.balance)} so'm</b></div>
      <Field label="Summa (so'm)" required>
        <input className="input mono" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} autoFocus/>
      </Field>
      {kind === 'pay' && c.balance > 0 && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
          {[c.balance, Math.round(c.balance / 2)].filter((v, i, s) => v > 0 && s.indexOf(v) === i).map(v => (
            <button key={v} type="button" className="btn btn-soft btn-sm" onClick={() => setAmount(String(Math.round(v)))}>{v === c.balance ? 'Hammasi' : 'Yarmi'} · {money(v)}</button>
          ))}
        </div>
      )}
      {a > 0 && <div className="calc-row"><span>Keyin qarzi</span><b className="mono" style={{ color: after < 0 ? 'var(--accent-ink)' : undefined }}>{money(Math.max(0, after))} so'm</b></div>}
      <Field label="Izoh" style={{ marginTop: 12 }}><input className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder={kind === 'pay' ? 'Masalan: naqd / karta' : 'Masalan: 2 ta non'}/></Field>
    </Modal>
  )
}

function HistoryModal({ c, onClose }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { API.get(`/api/debts/customers/${c._id}/tx`).then(r => setRows(r.data)).catch(() => setRows([])) }, [c._id])
  return (
    <Modal open onClose={onClose} title={`${c.name} — tarix`} maxWidth={600}>
      {!rows ? <Loading/> : rows.length === 0 ? <div className="muted" style={{ padding: '18px 0', textAlign: 'center' }}>Harakat yo'q</div> : (
        <div className="lst" style={{ paddingBottom: 12 }}>
          {rows.map(t => (
            <div key={t._id} className="lst-row">
              <span className="lst-th" style={t.type === 'payment' ? { background: 'var(--ok-soft)', color: 'var(--ok-ink)' } : { background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
                {t.type === 'payment' ? <HandCoins size={18}/> : <Plus size={18}/>}
              </span>
              <span className="lst-name truncate">{t.type === 'payment' ? "To'lov" : 'Qarz'}{t.note ? ` — ${t.note}` : ''}
                <small>{when(t.createdAt)}{t.by ? ` · ${t.by}` : ''}</small>
              </span>
              <span className="lst-val" style={{ color: t.type === 'payment' ? 'var(--ok-ink)' : 'var(--accent-ink)' }}>{t.type === 'payment' ? '−' : '+'}{money(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

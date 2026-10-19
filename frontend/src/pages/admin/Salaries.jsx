import React, { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Wallet, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal, { ModalField } from '../../components/shared/Modal.jsx'
import { PageHead, Loading, Empty, money, initials } from '../../components/ui.jsx'

export default function Salaries() {
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [form, setForm] = useState({ userId: '', amount: '', note: '' })

  const load = async () => {
    setLoading(true)
    try { const { data } = await API.get(`/api/salaries/users-summary?month=${month}`); setSummary(data) }
    catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [month])

  const totalPaid = summary.reduce((s, u) => s + u.totalPaid, 0)
  const totalBase = summary.reduce((s, u) => s + (u.baseSalary || 0), 0)
  const totalLeft = summary.reduce((s, u) => s + Math.max(0, u.remaining || 0), 0)

  const pay = (userId = '', amount = '') => { setForm({ userId, amount, note: '' }); setOpen(true) }

  const save = async () => {
    if (!form.userId || !form.amount) return toast.error("Xodim va miqdorni to'ldiring")
    setSaving(true)
    try {
      await API.post('/api/salaries', { ...form, month })
      toast.success("To'lov saqlandi")
      setOpen(false)
      setForm({ userId: '', amount: '', note: '' })
      load()
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setSaving(false) }
  }

  const del = async () => {
    try {
      await API.delete(`/api/salaries/${removing._id}`)
      toast.success("O'chirildi")
      setRemoving(null)
      load()
    } catch { toast.error('Xatolik') }
  }

  return (
    <div className="page">
      <PageHead title="Ish haqi" sub={`${month} · ${summary.length} ta xodim`}
        actions={<>
          <input type="month" className="input" value={month} onChange={e => setMonth(e.target.value)} style={{ width: 190 }}/>
          <button className="btn btn-primary btn-lg" onClick={() => pay()}><Plus size={20}/> To'lov</button>
        </>}/>

      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="card kpi hero">
          <div className="label">To'langan</div>
          <div className="kpi-value">{money(totalPaid)}<small>so'm</small></div>
        </div>
        <div className="card kpi">
          <div className="label">Qoldi</div>
          <div className="kpi-value">{money(totalLeft)}<small>so'm</small></div>
        </div>
        <div className="card kpi">
          <div className="label">Oylik fondi</div>
          <div className="kpi-value">{money(totalBase)}<small>so'm</small></div>
        </div>
      </div>

      {loading ? <Loading/> : summary.length === 0 ? (
        <Empty icon={Wallet} title="Xodim yo'q" text="Avval «Xodimlar» bo'limida xodim qo'shing."/>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          {summary.map(u => {
            const isExp = expanded === u._id
            const pct = u.baseSalary > 0 ? Math.min(100, Math.round(u.totalPaid / u.baseSalary * 100)) : null
            const done = u.baseSalary > 0 && u.remaining <= 0
            return (
              <div key={u._id} className="card" style={{ overflow: 'hidden' }}>
                <button className="row" onClick={() => setExpanded(isExp ? null : u._id)}
                  style={{ width: '100%', padding: '14px 18px', gap: 14, textAlign: 'left', minHeight: 72 }}>
                  <span className="avatar" style={{ width: 44, height: 44 }}>{initials(u.name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }} className="truncate">{u.name}</div>
                    <div className="label">{u.baseSalary > 0 ? `Oylik ${money(u.baseSalary)}` : 'Oylik belgilanmagan'}</div>
                  </div>
                  {pct !== null && (
                    <div className="hide-mobile" style={{ width: 140 }}>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--thumb)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: done ? 'var(--ok)' : 'var(--accent)' }}/>
                      </div>
                      <div className="mono muted" style={{ fontSize: 12, marginTop: 4 }}>{pct}%</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'right', minWidth: 120 }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: 18 }}>{money(u.totalPaid)}</div>
                    {done ? <span className="tag tag-ok"><Check size={13}/> To'liq</span>
                      : u.remaining > 0 ? <div className="mono" style={{ fontSize: 12.5, color: 'var(--accent-ink)' }}>qoldi {money(u.remaining)}</div>
                      : null}
                  </div>
                  <span className="muted">{isExp ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</span>
                </button>

                {isExp && (
                  <div style={{ borderTop: '1.5px dashed var(--rule-2)', padding: '12px 18px 16px' }}>
                    {u.payments.length === 0 ? (
                      <div className="muted" style={{ padding: '8px 0 12px' }}>Bu oy hali to'lov qilinmagan</div>
                    ) : (
                      <table className="table" style={{ marginBottom: 12 }}>
                        <thead><tr><th>Sana</th><th>Izoh</th><th className="r">Miqdor</th><th/></tr></thead>
                        <tbody>
                          {u.payments.map(p => (
                            <tr key={p._id}>
                              <td className="mono">{new Date(p.paidAt).toLocaleDateString('uz-UZ')}</td>
                              <td className="muted">{p.note || '—'}</td>
                              <td className="r mono" style={{ fontWeight: 600 }}>{money(p.amount)}</td>
                              <td className="r" style={{ width: 60 }}>
                                <button className="btn btn-danger btn-icon btn-sm" title="O'chirish" onClick={() => setRemoving(p)}><Trash2 size={16}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <button className="btn btn-soft btn-lg" onClick={() => pay(u._id, u.payments.length ? (u.remaining > 0 ? u.remaining : '') : (u.baseSalary || ''))}>
                      <Plus size={20}/> To'lov qo'shish
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Ish haqi to'lash"
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Bekor qilish</button>
          <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner-sm"/> Saqlanmoqda</> : "To'lash"}
          </button>
        </>}>
        <div className="col" style={{ gap: 14 }}>
          <ModalField label="Xodim" required>
            <select className="input" value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}>
              <option value="">Xodimni tanlang</option>
              {summary.map(u => <option key={u._id} value={u._id}>{u.name} — qoldi {money(u.remaining)}</option>)}
            </select>
          </ModalField>
          <ModalField label="Miqdor (so'm)" required>
            <input className="input mono" type="number" inputMode="numeric" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="1500000"/>
          </ModalField>
          <ModalField label="Izoh">
            <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Ixtiyoriy"/>
          </ModalField>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="To'lovni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setRemoving(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={del}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>{removing && `${money(removing.amount)} so'm to'lov o'chiriladi.`}</p>
      </Modal>
    </div>
  )
}

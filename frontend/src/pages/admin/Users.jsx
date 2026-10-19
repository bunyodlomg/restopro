import React, { useState, useEffect } from 'react'
import { UserPlus, Trash2, Search, Pencil, Users as UsersIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal, { ModalField } from '../../components/shared/Modal.jsx'
import { PageHead, Loading, Empty, money, initials } from '../../components/ui.jsx'

const EMPTY = { name: '', username: '', password: '', role: 'waiter', phone: '', salary: '' }

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const load = async () => {
    try { const { data } = await API.get('/api/users'); setUsers(data) }
    catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true) }
  const openEdit = u => {
    setEditing(u)
    setForm({ name: u.name, username: u.username, password: '', role: u.role, phone: u.phone || '', salary: u.salary || '' })
    setOpen(true)
  }

  const save = async () => {
    if (!form.name || !form.username) return toast.error("Ism va loginni to'ldiring")
    if (!editing && !form.password) return toast.error('Parol kiriting')
    setSaving(true)
    try {
      const body = { ...form }
      if (form.salary) body.salary = +form.salary
      if (!body.password) delete body.password
      if (editing) {
        const { data } = await API.put(`/api/users/${editing._id}`, body)
        setUsers(p => p.map(u => (u._id === editing._id ? data : u)))
        toast.success('Saqlandi')
      } else {
        const { data } = await API.post('/api/users', body)
        setUsers(p => [data, ...p])
        toast.success("Xodim qo'shildi")
      }
      setOpen(false)
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setSaving(false) }
  }

  const del = async () => {
    const u = removing
    try {
      await API.delete(`/api/users/${u._id}`)
      setUsers(p => p.filter(x => x._id !== u._id))
      toast.success("O'chirildi")
      setRemoving(null)
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
  }

  const s = q.trim().toLowerCase()
  const filtered = users.filter(u => !s || u.name?.toLowerCase().includes(s) || u.username?.toLowerCase().includes(s))
  const admins = users.filter(u => u.role === 'admin').length

  return (
    <div className="page">
      <PageHead title="Xodimlar" sub={`${users.length} ta xodim · ${admins} admin · ${users.length - admins} ofitsant`}
        actions={<>
          <div className="input-icon" style={{ width: 240 }}>
            <Search size={19}/>
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Ism yoki login"/>
          </div>
          <button className="btn btn-primary btn-lg" onClick={openAdd}><UserPlus size={20}/> Xodim qo'shish</button>
        </>}/>

      <div className="card">
        {loading ? <Loading/> : filtered.length === 0 ? (
          <Empty icon={UsersIcon} title={s ? 'Topilmadi' : "Xodim yo'q"} text={s ? `«${q}» bo'yicha xodim yo'q` : "Birinchi xodimni qo'shing."}/>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Xodim</th><th>Login</th><th>Rol</th><th className="r">Oylik</th><th/></tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u._id}>
                    <td>
                      <div className="row">
                        <span className="avatar" style={{ width: 42, height: 42 }}>{initials(u.name)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>
                          {u.phone && <div className="mono muted" style={{ fontSize: 13 }}>{u.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="mono muted">{u.username}</td>
                    <td>{u.role === 'admin' ? <span className="tag tag-accent">Admin</span> : <span className="tag">Ofitsant</span>}</td>
                    <td className="r mono">{u.salary ? money(u.salary) : <span className="muted">—</span>}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-soft btn-icon" title="Tahrirlash" onClick={() => openEdit(u)}><Pencil size={18}/></button>
                        <button className="btn btn-danger btn-icon" title="O'chirish" onClick={() => setRemoving(u)}><Trash2 size={18}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? editing.name : 'Yangi xodim'}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setOpen(false)}>Bekor qilish</button>
          <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner-sm"/> Saqlanmoqda</> : 'Saqlash'}
          </button>
        </>}>
        <div className="col" style={{ gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ModalField label="Ism familiya" required>
              <input className="input" value={form.name} onChange={set('name')} placeholder="Ali Karimov"/>
            </ModalField>
            <ModalField label="Login" required>
              <input className="input" value={form.username} onChange={set('username')} placeholder="ali" disabled={!!editing}
                autoCapitalize="none" spellCheck={false}/>
            </ModalField>
          </div>
          <ModalField label={editing ? 'Yangi parol' : 'Parol'} required={!editing}
            hint={editing ? "O'zgartirmasangiz bo'sh qoldiring" : undefined}>
            <input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password"/>
          </ModalField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ModalField label="Rol">
              <select className="input" value={form.role} onChange={set('role')}>
                <option value="waiter">Ofitsant</option>
                <option value="admin">Admin</option>
              </select>
            </ModalField>
            <ModalField label="Oylik (so'm)">
              <input className="input" type="number" inputMode="numeric" value={form.salary} onChange={set('salary')} placeholder="2000000"/>
            </ModalField>
          </div>
          <ModalField label="Telefon">
            <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+998 90 123 45 67"/>
          </ModalField>
        </div>
      </Modal>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Xodimni o'chirish" maxWidth={440}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setRemoving(null)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={del}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>{removing?.name} tizimdan o'chiriladi. Uning eski buyurtmalari saqlanib qoladi.</p>
      </Modal>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { UserPlus, Trash2, Search, Pencil, Users as UsersIcon, ShieldOff, ShieldCheck, KeyRound, LogOut, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal, { ModalField } from '../../components/shared/Modal.jsx'
import { Select } from '../../components/shared/Pickers.jsx'
import { PageHead, Loading, Empty, Switch, money, initials } from '../../components/ui.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

const EMPTY = { name: '', username: '', password: '', role: 'waiter', phone: '', salary: '', pin: '' }

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
  const { settings, refresh } = useSettings()
  const { user: me } = useAuth()
  const staffOn = settings.staffAccessEnabled !== false
  const [confirmOff, setConfirmOff] = useState(false)

  // Ofitsant terminali bloklanishi (PIN ekraniga qaytish) — yoqish/o'chirish va vaqtlar
  const lock = { enabled: true, afterOrder: 10, idle: 120, ...(settings.terminalLock || {}) }
  const [lockSec, setLockSec] = useState({ afterOrder: lock.afterOrder, idle: lock.idle })
  useEffect(() => { setLockSec({ afterOrder: lock.afterOrder, idle: lock.idle }) }, [lock.afterOrder, lock.idle])
  const saveLock = async patch => {
    const fd = new FormData(); fd.append('terminalLock', JSON.stringify({ ...lock, ...patch }))
    try { await API.put('/api/settings', fd); await refresh(); toast.success('Terminal bloklanishi saqlandi') }
    catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
  }
  const lockDirty = +lockSec.afterOrder !== lock.afterOrder || +lockSec.idle !== lock.idle

  // Barcha xodimlar (admin bo'lmaganlar) kirishini yoqish/o'chirish
  const setStaffAccess = async enabled => {
    const fd = new FormData(); fd.append('staffAccessEnabled', String(enabled))
    try {
      await API.put('/api/settings', fd); await refresh()
      toast.success(enabled ? 'Xodimlar kirishi yoqildi' : "Barcha xodimlar tizimdan chiqarildi")
      setConfirmOff(false)
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
  }
  // Bitta xodimni yoqish/o'chirish
  const toggleActive = async (u, isActive) => {
    try {
      const { data } = await API.put(`/api/users/${u._id}`, { isActive })
      setUsers(p => p.map(x => (x._id === u._id ? data : x)))
      toast.success(isActive ? `${u.name} — kirish yoqildi` : `${u.name} — kirish o'chirildi`)
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
  }

  // Ofitsant qurilmasi yo'qolgan / osilib qolgan — sessiyani yopib, boshqa qurilmadan kirishga ruxsat
  const closeSession = async u => {
    try {
      await API.delete(`/api/users/${u._id}/session`)
      setUsers(p => p.map(x => (x._id === u._id ? { ...x, online: false } : x)))
      toast.success(`${u.name} — sessiya yopildi`)
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
  }

  const load = async () => {
    try { const { data } = await API.get('/api/users'); setUsers(data) }
    catch { toast.error("Yuklab bo'lmadi") }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true) }
  const openEdit = u => {
    setEditing(u)
    setForm({ name: u.name, username: u.username, password: '', role: u.role, phone: u.phone || '', salary: u.salary || '', pin: '', clearPin: false })
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
      if (body.pin && !/^\d{4}$/.test(body.pin)) { setSaving(false); return toast.error('PIN 4 ta raqam bo\'lsin') }
      if (body.clearPin) body.pin = ''
      else if (!body.pin) delete body.pin
      delete body.clearPin
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

      <div className={`card card-pad staff-switch ${staffOn ? '' : 'off'}`}>
        {staffOn ? <ShieldCheck size={28}/> : <ShieldOff size={28}/>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 17 }}>{staffOn ? 'Xodimlar tizimga kira oladi' : "Xodimlar kirishi o'chirilgan"}</b>
          <div className="hint" style={{ color: 'inherit', opacity: .75 }}>
            {staffOn ? "O'chirsangiz barcha ofitsantlar darhol chiqariladi va qayta kira olmaydi. Adminlar ishlayveradi."
              : 'Hech bir ofitsant kira olmaydi va buyurtma bera olmaydi. Ish boshlanganda yoqing.'}
          </div>
        </div>
        <Switch checked={staffOn} onChange={v => (v ? setStaffAccess(true) : setConfirmOff(true))}/>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <Lock size={26} style={{ flexShrink: 0, marginTop: 2 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 10 }}>
              <b style={{ fontSize: 17 }}>Ofitsant terminali bloklanishi</b>
              <span className={`tag ${lock.enabled ? 'tag-ok' : 'tag-soft'}`}>{lock.enabled ? 'Yoqilgan' : "O'chirilgan"}</span>
            </div>
            <div className="hint">
              {lock.enabled ? `Monoblok o'zi PIN ekraniga qaytadi: buyurtmadan ${lock.afterOrder} soniya, harakatsiz ${lock.idle} soniya o'tgach.`
                : "Terminal o'zi bloklanmaydi — ofitsant «Chiqish» tugmasini bosmaguncha ochiq qoladi. Yoqish uchun tugmani bosing."}
            </div>
          </div>
          <Switch checked={lock.enabled} onChange={v => saveLock({ enabled: v })}/>
        </div>
        <div className="row wrap" style={{ gap: 16, marginTop: 14, alignItems: 'flex-end', opacity: lock.enabled ? 1 : .55 }}>
          <label className="col" style={{ gap: 6 }}>
            <span className="label">Buyurtma yuborilgach, soniya</span>
            <input className="input mono" type="number" min={3} max={600} style={{ width: 150 }}
              value={lockSec.afterOrder} onChange={e => setLockSec(s => ({ ...s, afterOrder: e.target.value }))}/>
          </label>
          <label className="col" style={{ gap: 6 }}>
            <span className="label">Hech narsa bosilmasa, soniya</span>
            <input className="input mono" type="number" min={10} max={3600} style={{ width: 150 }}
              value={lockSec.idle} onChange={e => setLockSec(s => ({ ...s, idle: e.target.value }))}/>
          </label>
          <button className="btn btn-primary btn-lg" disabled={!lockDirty} onClick={() => saveLock({ afterOrder: +lockSec.afterOrder, idle: +lockSec.idle })}>Saqlash</button>
        </div>
      </div>

      <div className="card">
        {loading ? <Loading/> : filtered.length === 0 ? (
          <Empty icon={UsersIcon} title={s ? 'Topilmadi' : "Xodim yo'q"} text={s ? `«${q}» bo'yicha xodim yo'q` : "Birinchi xodimni qo'shing."}/>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Xodim</th><th>Login</th><th>Rol</th><th className="r">Oylik</th><th>Kirish</th><th/></tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u._id} style={{ opacity: u.isActive === false ? .55 : 1 }}>
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
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {u.role === 'admin' ? <span className="tag tag-accent">Admin</span> : <span className="tag">Ofitsant</span>}
                        {u.hasPin && <span className="tag" title="Monoblokda PIN bilan kiradi"><KeyRound size={12}/> PIN</span>}
                        {u.online && u.role !== 'admin' && <span className="tag tag-accent" title="Hozir bir qurilmada ishlayapti — boshqa qurilmadan kira olmaydi">Onlayn</span>}
                      </div>
                    </td>
                    <td className="r mono">{u.salary ? money(u.salary) : <span className="muted">—</span>}</td>
                    <td>{u._id === me?._id ? <span className="muted">siz</span> : <Switch checked={u.isActive !== false} onChange={v => toggleActive(u, v)}/>}</td>
                    <td className="r">
                      <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                        {u.online && u.role !== 'admin' && (
                          <button className="btn btn-soft btn-icon" title="Sessiyani yopish — qurilmadan chiqariladi, boshqa qurilmadan kira oladi"
                            onClick={() => closeSession(u)}><LogOut size={18}/></button>
                        )}
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
              <Select value={form.role} onChange={v => setForm(f => ({ ...f, role: v }))}
                options={[{ value: 'waiter', label: 'Ofitsant' }, { value: 'admin', label: 'Admin' }]}/>
            </ModalField>
            <ModalField label="Oylik (so'm)">
              <input className="input" type="number" inputMode="numeric" value={form.salary} onChange={set('salary')} placeholder="2000000"/>
            </ModalField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ModalField label="Telefon">
              <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+998 90 123 45 67"/>
            </ModalField>
            <ModalField label={editing?.hasPin ? 'Yangi PIN (4 raqam)' : 'PIN (4 raqam)'} hint="Monoblokda tez kirish uchun">
              <input className="input mono" inputMode="numeric" maxLength={4} value={form.pin}
                onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4), clearPin: false }))}
                placeholder={editing?.hasPin ? '••••  (o\'rnatilgan)' : '4826'} autoComplete="off"/>
            </ModalField>
          </div>
          {editing?.hasPin && (
            <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.clearPin} onChange={e => setForm(f => ({ ...f, clearPin: e.target.checked, pin: '' }))}/>
              PIN'ni o'chirish
            </label>
          )}
        </div>
      </Modal>

      <Modal open={confirmOff} onClose={() => setConfirmOff(false)} title="Barcha xodimlar kirishini o'chirish" maxWidth={460}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setConfirmOff(false)}>Yo'q</button>
          <button className="btn btn-danger btn-lg" onClick={() => setStaffAccess(false)}>Ha, o'chirish</button>
        </>}>
        <p style={{ margin: 0, fontSize: 16 }}>
          Barcha ofitsantlar telefon va monobloklardan darhol chiqariladi va qayta kira olmaydi. Adminlar ishlashda davom etadi.
          Qayta yoqish uchun shu tugmani bosing.
        </p>
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

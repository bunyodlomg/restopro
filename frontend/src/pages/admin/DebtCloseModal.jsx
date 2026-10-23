import React, { useEffect, useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import Modal from '../../components/shared/Modal.jsx'
import { Select } from '../../components/shared/Pickers.jsx'
import { Field, Seg, money, orderTotal } from '../../components/ui.jsx'
import { usePlace } from '../../utils/sections.js'

// Buyurtmani qarzga yopish: mavjud mijoz yoki yangisi; to'liq yoki qisman (qolgani naqd to'landi)
export default function DebtCloseModal({ order, onClose, onDone }) {
  const place = usePlace()
  const total = orderTotal(order)
  const [mode, setMode] = useState('pick')
  const [customers, setCustomers] = useState(null)
  const [customerId, setCustomerId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState(String(total))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    API.get('/api/debts/customers?all=1').then(r => {
      setCustomers(r.data.customers)
      if (!r.data.customers.length) setMode('new')
    }).catch(() => setCustomers([]))
  }, [])

  const a = Math.round(+amount || 0)
  const submit = async () => {
    if (mode === 'pick' && !customerId) return toast.error('Mijozni tanlang')
    if (mode === 'new' && !name.trim()) return toast.error('Mijoz ismini yozing')
    if (!(a > 0) || a > total) return toast.error(`Qarz 1 dan ${money(total)} so'mgacha bo'lishi kerak`)
    setBusy(true)
    try {
      const debt = mode === 'pick' ? { customerId, amount: a } : { name: name.trim(), phone: phone.trim(), amount: a }
      await API.put(`/api/orders/${order._id}/close`, { debt })
      const who = mode === 'pick' ? customers.find(c => c._id === customerId)?.name : name.trim()
      toast.success(`${place(order)} — ${money(a)} so'm ${who} nomiga qarzga yozildi`)
      onDone(order)
    } catch (e) { toast.error(e.response?.data?.message || 'Xatolik') }
    finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Qarzga yopish — ${place(order)}`} maxWidth={500}
      footer={<>
        <button className="btn btn-ghost btn-lg" onClick={onClose}>Bekor qilish</button>
        <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner-sm"/> : `${money(a)} so'm qarzga yozish`}
        </button>
      </>}>
      <div className="calc-row" style={{ marginTop: 0, marginBottom: 14 }}><span>Buyurtma summasi</span><b className="mono">{money(total)} so'm</b></div>
      <Seg value={mode} onChange={setMode} style={{ marginBottom: 14 }}
        items={[{ k: 'pick', l: 'Mavjud mijoz', icon: Users }, { k: 'new', l: 'Yangi mijoz', icon: UserPlus }]}/>
      {mode === 'pick' ? (
        <Field label="Mijoz" required>
          <Select value={customerId} onChange={setCustomerId} placeholder={customers === null ? 'Yuklanmoqda…' : customers.length ? 'Mijozni tanlang' : "Hali mijoz yo'q — «Yangi mijoz»"}
            options={(customers || []).map(c => ({ value: c._id, label: c.name, hint: [c.phone, c.balance > 0 ? `qarzi ${money(c.balance)} so'm` : ''].filter(Boolean).join(' · ') }))}/>
        </Field>
      ) : <>
        <Field label="Ism familiya" required><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Masalan: Akmal aka" autoFocus/></Field>
        <Field label="Telefon"><input className="input mono" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+998 90 123 45 67"/></Field>
      </>}
      <Field label="Qarzga yoziladigan summa (so'm)" hint={a > 0 && a < total ? `Qolgan ${money(total - a)} so'm naqd to'landi deb hisoblanadi` : 'Hammasi qarzga — yoki kamroq yozing, qolgani naqd'}>
        <input className="input mono" type="number" min={1} max={total} value={amount} onChange={e => setAmount(e.target.value)}/>
      </Field>
    </Modal>
  )
}

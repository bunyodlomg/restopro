import React, { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AuthFrame from '../components/auth/AuthFrame.jsx'
import { Field } from '../components/ui.jsx'

const MIN_PASSWORD = 6

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { user, changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const forced = !!user?.mustChangePassword

  const submit = async e => {
    e.preventDefault()
    setError('')
    if (newPassword.length < MIN_PASSWORD) return setError(`Yangi parol kamida ${MIN_PASSWORD} belgidan iborat bo'lsin`)
    if (newPassword !== confirm) return setError('Yangi parollar mos kelmadi')
    setLoading(true)
    try {
      const u = await changePassword(oldPassword, newPassword)
      toast.success("Parol o'zgartirildi")
      navigate(u.role === 'admin' ? '/admin' : '/waiter', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Xatolik yuz berdi')
    } finally { setLoading(false) }
  }

  return (
    <AuthFrame>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', margin: 0 }}>Parolni o'zgartirish</h1>
      <p className="muted" style={{ margin: '8px 0 28px', fontSize: 16 }}>
        {forced ? "Xavfsizlik uchun davom etishdan oldin yangi parol o'rnating." : `${user?.name || ''} — yangi parol`}
      </p>

      <form onSubmit={submit} className="col" style={{ gap: 18 }}>
        {error && <div className="alert"><AlertCircle size={20}/>{error}</div>}
        <Field label="Joriy parol">
          <input className="input" type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
            autoComplete="current-password" autoFocus required/>
        </Field>
        <Field label="Yangi parol" hint={`Kamida ${MIN_PASSWORD} belgi`}>
          <input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password" minLength={MIN_PASSWORD} required/>
        </Field>
        <Field label="Yangi parol (takror)">
          <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password" minLength={MIN_PASSWORD} required/>
        </Field>
        <button type="submit" className="btn btn-primary btn-xl btn-block" disabled={loading} style={{ marginTop: 6 }}>
          {loading ? <><span className="spinner-sm"/> Saqlanmoqda</> : 'Saqlash'}
        </button>
        {forced
          ? <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => { logout(); navigate('/login', { replace: true }) }}>Chiqish</button>
          : <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={() => navigate(-1)}>Bekor qilish</button>}
      </form>
    </AuthFrame>
  )
}

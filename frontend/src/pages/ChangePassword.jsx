import React, { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { BRAND } from '../brand.js'

const MIN_PASSWORD = 6

const labelStyle = { display:'block', fontSize:'0.75rem', fontWeight:700, color:'var(--text-3)', marginBottom:6, letterSpacing:'0.06em', textTransform:'uppercase' }

export default function ChangePassword() {
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const { user, changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const forced = !!user?.mustChangePassword

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (newPassword.length < MIN_PASSWORD) return setError(`Yangi parol kamida ${MIN_PASSWORD} belgidan iborat bo'lsin`)
    if (newPassword !== confirm)           return setError('Yangi parollar mos kelmadi')
    setLoading(true)
    try {
      const u = await changePassword(oldPassword, newPassword)
      toast.success("Parol o'zgartirildi")
      navigate(u.role === 'admin' ? '/admin' : '/waiter', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Xatolik yuz berdi')
    } finally { setLoading(false) }
  }

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:'1rem' }}>
      <div className="animate-scale-in" style={{
        width:'100%', maxWidth:380, background:'var(--card)', border:'1px solid var(--border)',
        borderRadius:'var(--r-3xl)', overflow:'hidden', boxShadow:'var(--shadow-xl)',
      }}>
        <div style={{ height:3, background:'linear-gradient(90deg,var(--brand),var(--brand-lt),var(--brand))' }}/>

        <div style={{ padding:'2.25rem 2rem' }}>
          <div style={{ textAlign:'center', marginBottom:'1.5rem' }}>
            <div style={{ fontSize:'1.875rem', marginBottom:'0.75rem' }}>{BRAND.logo}</div>
            <h1 style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.25rem', color:'var(--text)', marginBottom:4 }}>
              Parolni o'zgartirish
            </h1>
            {forced && (
              <p style={{ fontSize:'0.8rem', color:'var(--text-3)' }}>
                Xavfsizlik uchun davom etishdan oldin yangi parol o'rnating.
              </p>
            )}
          </div>

          {error && (
            <div className="animate-slide-up" style={{
              padding:'0.75rem 1rem', borderRadius:12, marginBottom:'1rem',
              background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)',
              color:'#F87171', fontSize:'0.825rem', fontWeight:500,
            }}>⚠️ {error}</div>
          )}

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label style={labelStyle}>Joriy parol</label>
              <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                className="rp-input" autoComplete="current-password" required/>
            </div>
            <div>
              <label style={labelStyle}>Yangi parol</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="rp-input" autoComplete="new-password" minLength={MIN_PASSWORD} required/>
            </div>
            <div>
              <label style={labelStyle}>Yangi parol (takror)</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                className="rp-input" autoComplete="new-password" minLength={MIN_PASSWORD} required/>
            </div>

            <button type="submit" disabled={loading} className="btn-primary"
              style={{ justifyContent:'center', padding:'0.8rem', fontSize:'0.95rem', marginTop:'0.5rem', width:'100%' }}>
              {loading ? <><span className="spinner-sm"/> Saqlanmoqda...</> : <><KeyRound size={16}/> Saqlash</>}
            </button>

            {forced ? (
              <button type="button" onClick={handleLogout} className="btn-ghost" style={{ justifyContent:'center', width:'100%' }}>
                <LogOut size={16}/> Chiqish
              </button>
            ) : (
              <button type="button" onClick={() => navigate(-1)} className="btn-ghost" style={{ justifyContent:'center', width:'100%' }}>
                Bekor qilish
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

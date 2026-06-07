import React, { useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'
import { BRAND } from '../brand.js'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass]  = useState(false)
  const [error,    setError]     = useState('')
  const [loading,  setLoading]   = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const user = await login(username, password)
      navigate(user.role === 'admin' ? '/admin' : '/waiter', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || "Login yoki parol noto'g'ri")
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'var(--bg)', padding:'1rem', position:'relative', overflow:'hidden',
    }}>
      {/* Glow effects */}
      <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:600, height:400, pointerEvents:'none', background:'radial-gradient(ellipse,var(--brand-glow) 0%,transparent 70%)' }}/>
      <div style={{ position:'absolute', bottom:0, right:0, width:400, height:400, background:'radial-gradient(circle,rgba(232,87,42,0.06) 0%,transparent 70%)', filter:'blur(60px)', pointerEvents:'none' }}/>

      <div className="animate-scale-in" style={{
        position:'relative', width:'100%', maxWidth:380,
        background:'var(--card)',
        border:'1px solid var(--border)',
        borderRadius:'var(--r-3xl)',
        overflow:'hidden',
        boxShadow:'var(--shadow-xl)',
      }}>
        {/* Accent line */}
        <div style={{ height:3, background:'linear-gradient(90deg,var(--brand),var(--brand-lt),var(--brand))' }}/>

        <div style={{ padding:'2.25rem 2rem 2.25rem' }}>
          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:'2rem' }}>
            <div style={{
              width:68, height:68, borderRadius:20,
              background:'linear-gradient(135deg,rgba(var(--brand-rgb),0.15),rgba(240,160,48,0.06))',
              border:'1.5px solid rgba(var(--brand-rgb),0.2)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1.875rem', margin:'0 auto 1rem',
            }}>{BRAND.logo}</div>
            <h1 style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'1.35rem', color:'var(--text)', marginBottom:4 }}>
              {BRAND.name}
            </h1>
            <p style={{ fontSize:'0.8rem', color:'var(--text-3)' }}>Tizimga kirish</p>
          </div>

          {/* Error */}
          {error && (
            <div className="animate-slide-up" style={{
              display:'flex', alignItems:'center', gap:'0.5rem',
              padding:'0.75rem 1rem', borderRadius:12, marginBottom:'1rem',
              background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)',
              color:'#F87171', fontSize:'0.825rem', fontWeight:500,
            }}>⚠️ {error}</div>
          )}

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {/* Username */}
            <div>
              <label style={{ display:'block', fontSize:'0.75rem', fontWeight:700, color:'var(--text-3)', marginBottom:6, letterSpacing:'0.06em', textTransform:'uppercase' }}>
                Foydalanuvchi nomi
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                className="rp-input"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ display:'block', fontSize:'0.75rem', fontWeight:700, color:'var(--text-3)', marginBottom:6, letterSpacing:'0.06em', textTransform:'uppercase' }}>
                Parol
              </label>
              <div style={{ position:'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="rp-input"
                  style={{ paddingRight: '3rem' }}
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                  style={{
                    position:'absolute', right:'0.875rem', top:'50%', transform:'translateY(-50%)',
                    background:'none', border:'none', cursor:'pointer',
                    color:'var(--text-3)', display:'flex', padding:4,
                    transition:'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color='var(--brand)'}
                  onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}
                >
                  {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="btn-primary"
              style={{ justifyContent:'center', padding:'0.8rem', fontSize:'0.95rem', marginTop:'0.5rem', width:'100%' }}>
              {loading
                ? <><span className="spinner-sm"/> Kirilmoqda...</>
                : <><LogIn size={16}/> Kirish</>
              }
            </button>
          </form>

          <p style={{ textAlign:'center', fontSize:'0.72rem', color:'var(--text-3)', marginTop:'1.5rem' }}>
            {BRAND.name} — Admin & Ofitsant tizimi
          </p>
        </div>
      </div>
    </div>
  )
}

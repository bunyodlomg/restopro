import React, { useEffect, useState } from 'react'
import { Eye, EyeOff, AlertCircle, Delete } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import API from '../api/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import AuthFrame from '../components/auth/AuthFrame.jsx'
import { Field, Seg } from '../components/ui.jsx'
import { isTerminal } from '../utils/terminal.js'

// 4 raqamli PIN klaviaturasi (monoblok uchun katta tugmalar)
function PinPad({ onSubmit, busy }) {
  const [pin, setPin] = useState('')
  const press = d => {
    if (busy) return
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) onSubmit(next).finally(() => setPin(''))
  }
  useEffect(() => {
    const h = e => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  return (
    <div className="pin">
      <div className="pin-dots">{[0, 1, 2, 3].map(i => <i key={i} className={i < pin.length ? 'on' : ''}/>)}</div>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
        <button type="button" className="ghost" onClick={() => setPin('')}>C</button>
        <button type="button" onClick={() => press('0')}>0</button>
        <button type="button" className="ghost" onClick={() => setPin(p => p.slice(0, -1))} aria-label="O'chirish"><Delete size={26}/></button>
      </div>
    </div>
  )
}

export default function Login() {
  const [mode, setMode] = useState(isTerminal() ? 'pin' : 'pass')
  const [pinAvailable, setPinAvailable] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState(() => {
    const reason = sessionStorage.getItem('rp_logout_reason') || ''
    sessionStorage.removeItem('rp_logout_reason')
    return reason
  })
  const [loading, setLoading] = useState(false)
  const { login, loginPin, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    API.get('/api/auth/pin-available').then(r => {
      setPinAvailable(!!r.data.available)
      if (!r.data.available) setMode('pass')
    }).catch(() => setMode('pass'))
  }, [])

  const go = user => {
    // Ofitsant terminaliga (monoblok) faqat ofitsantlar kiradi
    if (isTerminal() && user.role === 'admin') {
      logout()
      return setError('Bu terminalga faqat ofitsantlar kira oladi. Admin kassa yoki sayt orqali kiradi.')
    }
    if (user.mustChangePassword) navigate('/change-password', { replace: true })
    else navigate(user.role === 'admin' ? '/admin' : '/waiter', { replace: true })
  }

  const submit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try { go(await login(username.trim(), password)) }
    catch (err) { setError(err.response?.data?.message || "Login yoki parol noto'g'ri") }
    finally { setLoading(false) }
  }
  const submitPin = async pin => {
    setError(''); setLoading(true)
    try { go(await loginPin(pin)) }
    catch (err) { setError(err.response?.data?.message || "PIN noto'g'ri") }
    finally { setLoading(false) }
  }

  return (
    <AuthFrame>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', margin: 0 }}>Tizimga kirish</h1>
      <p className="muted" style={{ margin: '8px 0 20px', fontSize: 16 }}>
        {mode === 'pin' ? '4 raqamli PIN kodingizni kiriting' : 'Login va parolingizni kiriting'}
      </p>

      {pinAvailable && (
        <Seg value={mode} onChange={m => { setMode(m); setError('') }} style={{ marginBottom: 20 }}
          items={[{ k: 'pin', l: 'PIN kod' }, { k: 'pass', l: 'Login va parol' }]}/>
      )}

      {error && <div className="alert" style={{ marginBottom: 16 }}><AlertCircle size={20}/>{error}</div>}

      {mode === 'pin' ? <PinPad onSubmit={submitPin} busy={loading}/> : (
        <form onSubmit={submit} className="col" style={{ gap: 18 }}>
          <Field label="Login">
            <input className="input" value={username} onChange={e => setUsername(e.target.value)}
              autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus required/>
          </Field>
          <Field label="Parol">
            <div className="pw-wrap">
              <input className="input" type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="current-password" required/>
              <button type="button" onClick={() => setShowPass(p => !p)} aria-label={showPass ? 'Yashirish' : "Ko'rsatish"}>
                {showPass ? <EyeOff size={22}/> : <Eye size={22}/>}
              </button>
            </div>
          </Field>
          <button type="submit" className="btn btn-primary btn-xl btn-block" disabled={loading} style={{ marginTop: 6 }}>
            {loading ? <><span className="spinner-sm"/> Kirilmoqda</> : 'Kirish'}
          </button>
        </form>
      )}
    </AuthFrame>
  )
}

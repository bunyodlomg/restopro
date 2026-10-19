import React, { useState } from 'react'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import AuthFrame from '../components/auth/AuthFrame.jsx'
import { Field } from '../components/ui.jsx'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const submit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const user = await login(username.trim(), password)
      if (user.mustChangePassword) navigate('/change-password', { replace: true })
      else navigate(user.role === 'admin' ? '/admin' : '/waiter', { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || "Login yoki parol noto'g'ri")
    } finally { setLoading(false) }
  }

  return (
    <AuthFrame>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.03em', margin: 0 }}>Tizimga kirish</h1>
      <p className="muted" style={{ margin: '8px 0 28px', fontSize: 16 }}>Login va parolingizni kiriting</p>

      <form onSubmit={submit} className="col" style={{ gap: 18 }}>
        {error && <div className="alert"><AlertCircle size={20}/>{error}</div>}
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
    </AuthFrame>
  )
}

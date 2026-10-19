import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isTerminal } from '../utils/terminal.js'

const IDLE_MS = 120000   // 2 daqiqa harakatsizlik → PIN ekraniga qaytish

// Monoblok rejimida ofitsant qurilmani ochiq qoldirib ketsa, boshqasi uning nomidan
// buyurtma bera olmasligi uchun avtomatik chiqish.
export default function TerminalLock() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user || !isTerminal()) return
    let timer
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { logout(); navigate('/login', { replace: true }) }, IDLE_MS)
    }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [user?._id])

  return null
}

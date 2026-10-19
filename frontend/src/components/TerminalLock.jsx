import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { isTerminal, LOCK_SOON_MS } from '../utils/terminal.js'

const IDLE_MS = 120000   // 2 daqiqa harakatsizlik → PIN ekraniga qaytish

// Monoblok rejimida ofitsant qurilmani ochiq qoldirib ketsa, boshqasi uning nomidan
// buyurtma bera olmasligi uchun avtomatik chiqish. Buyurtma yuborilgach (lockSoon)
// kutish 10 soniyaga qisqaradi: ofitsant ekranni ko'rib ulguradi, keyin PIN ekrani chiqadi.
export default function TerminalLock() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user || !isTerminal()) return
    const out = () => { logout(); navigate('/login', { replace: true }) }
    // Terminalga faqat ofitsant kiradi (eski saqlangan admin sessiyasi ham chiqariladi)
    if (user.role === 'admin') { out(); return }
    let ms = IDLE_MS, timer
    const reset = () => { clearTimeout(timer); timer = setTimeout(out, ms) }
    const soon = () => { ms = LOCK_SOON_MS; reset() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    window.addEventListener('rp:lock-soon', soon)
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
      window.removeEventListener('rp:lock-soon', soon)
    }
  }, [user?._id])

  return null
}

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useSettings } from '../context/SettingsContext.jsx'
import { isTerminal } from '../utils/terminal.js'

// Monoblok rejimida ofitsant qurilmani ochiq qoldirib ketsa, boshqasi uning nomidan
// buyurtma bera olmasligi uchun avtomatik chiqish (PIN ekraniga). Buyurtma yuborilgach (lockSoon)
// kutish qisqaradi: ofitsant ekranni ko'rib ulguradi, keyin PIN ekrani chiqadi.
// Yoqish/o'chirish va vaqtlar — kassada: Xodimlar → «Terminal bloklanishi» (settings.terminalLock).
export default function TerminalLock() {
  const { user, logout } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()
  const lock = settings.terminalLock || {}
  const enabled = lock.enabled !== false
  const idleMs = (Number(lock.idle) || 120) * 1000
  const afterOrderMs = (Number(lock.afterOrder) || 10) * 1000

  useEffect(() => {
    if (!user || !isTerminal()) return
    const out = () => { logout(); navigate('/login', { replace: true }) }
    // Terminalga faqat ofitsant kiradi (eski saqlangan admin sessiyasi ham chiqariladi)
    if (user.role === 'admin') { out(); return }
    if (!enabled) return
    let ms = idleMs, timer
    const reset = () => { clearTimeout(timer); timer = setTimeout(out, ms) }
    const soon = () => { ms = afterOrderMs; reset() }
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    window.addEventListener('rp:lock-soon', soon)
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
      window.removeEventListener('rp:lock-soon', soon)
    }
  }, [user?._id, enabled, idleMs, afterOrderMs])

  return null
}

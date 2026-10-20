// Monoblok (ofitsant terminali) rejimi: PIN bilan kirish, buyurtmadan keyin va
// harakatsizlikda avtomatik chiqish. RestoPro Ofitsant ilovasi ?terminal=1 bilan ochadi.
try {
  const q = new URLSearchParams(window.location.search)
  if (q.get('terminal') === '1') localStorage.setItem('rp_terminal', '1')
  if (q.get('terminal') === '0') localStorage.removeItem('rp_terminal')
} catch {}

export const isTerminal = () => {
  if (window.rpNative?.terminal) return true
  try { return localStorage.getItem('rp_terminal') === '1' } catch { return false }
}

// Qaysi ilova: 'kassa' (faqat admin), 'terminal' (faqat ofitsant), '' — brauzer/telefon (hamma)
export const appKind = () => window.rpNative?.app === 'kassa' ? 'kassa' : isTerminal() ? 'terminal' : ''

// Shu ilova/brauzerga bu rol kira oladimi (server ham tekshiradi — bu saqlangan eski sessiya uchun)
export const roleAllowedHere = role => {
  const app = appKind()
  if (app === 'kassa') return role === 'admin'
  if (app === 'terminal') return role !== 'admin'
  return true
}

// Qurilma belgisi: ofitsant bir vaqtda faqat bitta qurilmada ishlaydi (server shu bo'yicha ajratadi)
export const deviceId = () => {
  try {
    let id = localStorage.getItem('rp_device')
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
      localStorage.setItem('rp_device', id)
    }
    return id
  } catch { return '' }
}

// Buyurtma yuborilgach terminal tez bloklanadi (TerminalLock tinglaydi)
export const LOCK_SOON_MS = 10000
export const lockSoon = () => window.dispatchEvent(new Event('rp:lock-soon'))

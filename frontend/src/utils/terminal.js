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

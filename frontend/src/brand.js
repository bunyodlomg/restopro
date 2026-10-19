// ============================================================
//  BREND — har bir restoran uchun
//  Nom va logo Sozlamalar sahifasidan o'zgartiriladi (serverda saqlanadi).
//  Asosiy rang (accent) ham Sozlamalardan tanlanadi (shu qurilmada saqlanadi).
// ============================================================

export const BRAND = {
  name: 'RestoPro',
  logo: '',
  // Same-origin uchun bo'sh qoldiring. Alohida backend: .env → VITE_API_URL
  apiUrl: '',
}

// Tanlanadigan asosiy ranglar (tugmalar, belgilar, tanlangan holat)
export const ACCENTS = [
  { id: 'red',    name: 'Qizil',      c: '#FF3B2F', d: '#E0281D', ink: '#D0261B', inkDark: '#FF7A70' },
  { id: 'orange', name: "To'q sariq", c: '#FF6A13', d: '#E5560A', ink: '#C2410C', inkDark: '#FF9A5C' },
  { id: 'green',  name: 'Yashil',     c: '#12A150', d: '#0E8743', ink: '#0F7A3D', inkDark: '#4ADE80' },
  { id: 'blue',   name: "Ko'k",       c: '#2563EB', d: '#1D4FD8', ink: '#1D4ED8', inkDark: '#7AA2FF' },
  { id: 'violet', name: 'Binafsha',   c: '#7C3AED', d: '#6D28D9', ink: '#6D28D9', inkDark: '#B49BFF' },
]

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',')

export function getAccentId() {
  try { return localStorage.getItem('rp_accent') || 'red' } catch { return 'red' }
}

export function applyAccent(id = getAccentId()) {
  const a = ACCENTS.find(x => x.id === id) || ACCENTS[0]
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  const r = document.documentElement.style
  r.setProperty('--accent', a.c)
  r.setProperty('--accent-2', a.d)
  r.setProperty('--accent-ink', dark ? a.inkDark : a.ink)
  r.setProperty('--accent-soft', `rgba(${hexToRgb(a.c)},${dark ? .16 : .10})`)
  try { localStorage.setItem('rp_accent', a.id) } catch {}
}

// Eski nom bilan moslik
export const applyBrand = () => applyAccent()

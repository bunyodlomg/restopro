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

// Mos ranglar to'plami: asosiy rang + yon panel (rail / yuqori panel) + fon bir-biriga moslangan.
//   c / d / ink / inkDark — asosiy rang (tugma, belgi, matn) yorug' va qorong'u rejimda
//   bar / bar2 / barDark   — yon panel (yorug' rejimda va qorong'uda)
//   bg / side / thumb / rule — yorug' rejim foni (qorong'u rejim foni o'zgarmaydi — ko'zni charchatmasin)
export const PALETTES = [
  { id: 'klassik',  name: 'Klassik',  hint: 'qizil · qora',        c: '#FF3B2F', d: '#E0281D', ink: '#D0261B', inkDark: '#FF7A70', bar: '#0B0B0C', bar2: '#1F1F24', barDark: '#000000', bg: '#F4F4F2', side: '#EBEBE8', thumb: '#EFEFEC', rule: '#E4E4E1' },
  { id: 'zumrad',   name: 'Zumrad',   hint: 'yashil · o\'rmon',     c: '#12A150', d: '#0E8743', ink: '#0F7A3D', inkDark: '#4ADE80', bar: '#0F2A1D', bar2: '#1C3D2C', barDark: '#07140E', bg: '#F1F5F1', side: '#E6EDE6', thumb: '#E8EFE8', rule: '#DCE5DC' },
  { id: 'okean',    name: 'Okean',    hint: "ko'k · to'q ko'k",     c: '#2563EB', d: '#1D4FD8', ink: '#1D4ED8', inkDark: '#7AA2FF', bar: '#0F1B33', bar2: '#1C2B4A', barDark: '#070D1A', bg: '#F2F4F8', side: '#E6EAF2', thumb: '#E8ECF4', rule: '#DCE2EC' },
  { id: 'shokolad', name: 'Shokolad', hint: "to'q sariq · jigarrang", c: '#E8590C', d: '#C2410C', ink: '#B5400B', inkDark: '#FF9A5C', bar: '#2A1B12', bar2: '#3D2A1E', barDark: '#140C07', bg: '#F7F3EE', side: '#EEE7DE', thumb: '#F0E9E0', rule: '#E5DCD0' },
  { id: 'lavanda',  name: 'Lavanda',  hint: 'binafsha · siyoh',     c: '#7C3AED', d: '#6D28D9', ink: '#6D28D9', inkDark: '#B49BFF', bar: '#1E1433', bar2: '#2E2148', barDark: '#0E0919', bg: '#F5F3F9', side: '#EBE7F3', thumb: '#ECE8F4', rule: '#E1DCEC' },
  { id: 'firuza',   name: 'Firuza',   hint: 'firuza · grafit',      c: '#0D9488', d: '#0F766E', ink: '#0F766E', inkDark: '#2DD4BF', bar: '#102526', bar2: '#1D3738', barDark: '#071213', bg: '#F1F5F4', side: '#E5ECEB', thumb: '#E7EEED', rule: '#DAE3E2' },
  { id: 'gilos',    name: 'Gilos',    hint: "pushti · to'q qizil",  c: '#E11D48', d: '#BE123C', ink: '#BE123C', inkDark: '#FB7185', bar: '#2A0F18', bar2: '#3F1A26', barDark: '#14070B', bg: '#F8F2F4', side: '#F0E6EA', thumb: '#F1E8EC', rule: '#E8DADF' },
  { id: 'oltin',    name: 'Oltin',    hint: 'oltin · qahva',        c: '#D97706', d: '#B45309', ink: '#A16207', inkDark: '#FBBF24', bar: '#1F1A10', bar2: '#332B1C', barDark: '#0F0C07', bg: '#F7F5EE', side: '#EDEAE0', thumb: '#EFECE3', rule: '#E4E0D3' },
]
// Eski «asosiy rang» tanlovi → mos to'plam (avval tanlangani saqlanib qolsin)
const OLD_ACCENT = { red: 'klassik', orange: 'shokolad', green: 'zumrad', blue: 'okean', violet: 'lavanda' }
export const ACCENTS = PALETTES   // eski nom bilan moslik

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',')

export function getAccentId() {
  try {
    const v = localStorage.getItem('rp_palette') || OLD_ACCENT[localStorage.getItem('rp_accent')] || 'klassik'
    return PALETTES.some(p => p.id === v) ? v : 'klassik'
  } catch { return 'klassik' }
}

// To'plamni qo'llash — inline o'zgaruvchilar [data-theme] qoidalaridan ustun, shuning uchun
// rejim almashganda qayta chaqiriladi (ThemeContext)
export function applyAccent(id = getAccentId()) {
  const p = PALETTES.find(x => x.id === id) || PALETTES[0]
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
  const r = document.documentElement.style
  const set = (k, v) => (v === null ? r.removeProperty(k) : r.setProperty(k, v))
  set('--accent', p.c)
  set('--accent-2', p.d)
  set('--accent-ink', dark ? p.inkDark : p.ink)
  set('--accent-soft', `rgba(${hexToRgb(p.c)},${dark ? .16 : .10})`)
  set('--busy-1', p.c)
  set('--busy-2', p.d)
  set('--busy-glow', `rgba(${hexToRgb(p.d)},${dark ? .35 : .45})`)
  set('--bar', dark ? p.barDark : p.bar)
  set('--bar-2', p.bar2)
  set('--bar-rule', p.bar2)
  for (const [k, v] of [['--bg', p.bg], ['--side', p.side], ['--thumb', p.thumb], ['--rule', p.rule]]) set(k, dark ? null : v)
  try { localStorage.setItem('rp_palette', p.id) } catch {}
}

// Eski nom bilan moslik
export const applyBrand = () => applyAccent()

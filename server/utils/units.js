// ── O'lchov birliklari: retsept birligidan ombor birligiga o'tkazish ──
// Ombor «kg»da, retsept «g»da bo'lsa: 250 g → 0.25 kg. «litr» — «l» ning eski nomi.
const ALIAS = { litr: 'l', gr: 'g', 'gramm': 'g', kilo: 'kg' }
const BASE = { kg: ['g', 1000], g: ['g', 1], l: ['ml', 1000], ml: ['ml', 1], dona: ['dona', 1], paket: ['paket', 1] }

const UNITS = ['kg', 'g', 'l', 'ml', 'dona', 'paket']
const norm = u => { const k = String(u || '').trim().toLowerCase(); return ALIAS[k] || k }

// qty (from birligida) → to birligida. Mos kelmaydigan birliklar (kg ↔ dona) — null
function convert(qty, from, to) {
  const f = BASE[norm(from)], t = BASE[norm(to)]
  if (!f || !t) return norm(from) === norm(to) ? qty : null
  if (f[0] !== t[0]) return null
  return qty * f[1] / t[1]
}

module.exports = { UNITS, norm, convert }

// ── Litsenziya (oylik obuna) tekshiruvi ────────────────────────
// Server soatiga bir marta sotuvchining litsenziya serveridan IMZOLANGAN
// javob oladi: mijoz holati (active/suspended) va qachongacha to'langan.
// Imzo vendor.json dagi ochiq kalit bilan tekshiriladi — soxta javob o'tmaydi.
//
//   to'langan muddat ichida            → ishlaydi
//   muddat tugashiga ≤5 kun            → ishlaydi + ogohlantirish
//   muddat o'tdi, lekin muhlat (g kun)  → ishlaydi + qizil ogohlantirish
//   muhlat ham o'tdi / to'xtatilgan     → API bloklanadi (ma'lumotlar o'chmaydi)
//   14 kundan beri tekshirilmagan       → bloklanadi (internetga ulash kerak)
//
// Kassa (SYNC_URL bor) javobni cloud orqali oladi: alohida kalit kerak emas.

const crypto   = require('crypto')
const mongoose = require('mongoose')
const vendor   = require('./vendor.json')
const VERSION  = require('../package.json').version

const PUBKEY      = process.env.LICENSE_PUBKEY || vendor.publicKey || ''
const LICENSE_URL = (process.env.LICENSE_URL || vendor.licenseUrl || '').replace(/\/+$/, '')
const ENV_KEY     = (process.env.LICENSE_KEY || '').trim().toUpperCase()
const KEY_RE      = /^RP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
// Kalit: .env (cloud server) yoki bloklash ekranida kiritilgan (kassa, bazada saqlanadi)
const licenseKey  = () => ENV_KEY || saved?.key || ''
const SYNC_URL    = (process.env.SYNC_URL || '').replace(/\/+$/, '')
const SYNC_KEY    = process.env.SYNC_KEY || ''
const INTERVAL_MS = Math.max(60, parseInt(process.env.LICENSE_INTERVAL, 10) || 3600) * 1000
// Ishlab chiqish/test uchun o'chirish (production'da ishlamaydi)
const DEV_OFF = process.env.LICENSE_DEV === '1' && process.env.NODE_ENV !== 'production'

const ENABLED = !!PUBKEY && !DEV_OFF
const VIA_CLOUD = !!SYNC_URL
const ROLE = VIA_CLOUD ? 'kassa' : process.env.SYNC_KEY ? 'cloud' : 'server'
const DAY = 86400000
const WARN_DAYS = 5

let publicKey = null
if (ENABLED) {
  try { publicKey = crypto.createPublicKey({ key: Buffer.from(PUBKEY, 'base64'), format: 'der', type: 'spki' }) }
  catch { console.error('❌ Litsenziya ochiq kaliti noto\'g\'ri (vendor.json / LICENSE_PUBKEY)') }
}

const coll = () => mongoose.connection.collection('license_state')
let saved = null          // { token, maxSeen, instance, lastCheckAt }
let loaded = false
let lastError = null
let lastTry = 0

// Imzoni tekshirish → payload yoki null
function verify(token) {
  if (!publicKey || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    if (!crypto.verify(null, Buffer.from(body), publicKey, Buffer.from(sig, 'base64url'))) return null
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (p.v !== 1 || !p.pu || !p.iat || !p.exp) return null
    if (!VIA_CLOUD && licenseKey() && p.k !== licenseKey()) return null   // boshqa mijozning javobi
    return p
  } catch { return null }
}

// Yangilanish ruxsatnomasi (sotuvchi imzosi, t: 'upd') — kalitni o'z ichiga olmaydi
function verifyUpdate(token) {
  if (!publicKey || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  try {
    if (!crypto.verify(null, Buffer.from(body), publicKey, Buffer.from(sig, 'base64url'))) return null
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    return p.t === 'upd' && p.exp > Date.now() ? p : null
  } catch { return null }
}

// Soatni orqaga surish orqali aldashning oldini olish
const now = () => Math.max(Date.now(), saved?.maxSeen || 0)

async function persist(patch) {
  saved = { ...saved, ...patch }
  await coll().updateOne({ _id: 'main' }, { $set: patch }, { upsert: true }).catch(() => {})
}

async function fetchToken(key = licenseKey()) {
  if (VIA_CLOUD) {
    const r = await fetch(`${SYNC_URL}/api/sync/license`, { headers: { 'x-sync-key': SYNC_KEY }, signal: AbortSignal.timeout(20000) })
    if (!r.ok) throw new Error(r.status === 404 ? 'Cloud serverda litsenziya hali yo\'q' : `Cloud javobi: ${r.status}`)
    return r.json()
  }
  if (!LICENSE_URL) throw new Error('Litsenziya serveri manzili yo\'q (vendor.json)')
  if (!key) throw new Error('Litsenziya kaliti kiritilmagan')
  const r = await fetch(`${LICENSE_URL}/api/v1/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, instance: saved?.instance, version: VERSION, role: ROLE }),
    signal: AbortSignal.timeout(20000),
  })
  const j = await r.json().catch(() => ({}))
  if (r.status === 404) throw new Error('Litsenziya kaliti topilmadi')
  if (!r.ok) throw new Error(j.message || `Litsenziya serveri javobi: ${r.status}`)
  return j
}

async function check() {
  if (!ENABLED) return
  lastTry = Date.now()
  try {
    const { token, updateToken } = await fetchToken()
    const p = verify(token)
    if (!p) throw new Error('Litsenziya javobi imzosi noto\'g\'ri')
    const cur = verify(saved?.token)
    // Eskiroq javob yangisini almashtira olmaydi
    if (!cur || p.iat >= cur.iat) await persist({ token, lastCheckAt: Date.now(), ...(verifyUpdate(updateToken) ? { updateToken } : {}) })
    lastError = null
  } catch (err) {
    lastError = err.cause?.code ? `Ulanib bo'lmadi (${err.cause.code})` : err.message
  }
  await persist({ maxSeen: now() })
}

function status() {
  if (!ENABLED) return { enabled: false, state: 'off', blocked: false }
  const base = { enabled: true, role: ROLE, lastCheckAt: saved?.lastCheckAt || null, lastError, keyHint: licenseKey() ? licenseKey().slice(-4) : null, canEnterKey: !VIA_CLOUD && !ENV_KEY }
  if (!loaded) return { ...base, state: 'checking', blocked: false }
  const p = verify(saved?.token)
  if (!p) {
    const reason = !VIA_CLOUD && !licenseKey() ? 'nokey' : 'missing'
    return { ...base, state: reason, blocked: true, contact: vendor.contact || '' }
  }
  const t = now()
  const paidUntil = new Date(p.pu).getTime()
  const graceUntil = paidUntil + (p.g || 0) * DAY
  const info = {
    ...base,
    customer: p.n,
    paidUntil: new Date(paidUntil).toISOString(),
    graceUntil: new Date(graceUntil).toISOString(),
    daysLeft: Math.ceil((paidUntil - t) / DAY),
    contact: p.c || vendor.contact || '',
  }
  if (p.s === 'suspended') return { ...info, state: 'suspended', blocked: true }
  if (t > graceUntil) return { ...info, state: 'expired', blocked: true }
  if (t > p.exp) return { ...info, state: 'stale', blocked: true }
  if (t > paidUntil) return { ...info, state: 'grace', blocked: false, graceDaysLeft: Math.ceil((graceUntil - t) / DAY) }
  if (paidUntil - t < WARN_DAYS * DAY) return { ...info, state: 'warning', blocked: false }
  return { ...info, state: 'active', blocked: false }
}

async function start() {
  if (!ENABLED) {
    if (!PUBKEY) console.log('ℹ️  Litsenziya tekshiruvi o\'chiq (vendor.json to\'ldirilmagan)')
    else console.log('ℹ️  Litsenziya tekshiruvi o\'chiq (LICENSE_DEV=1)')
    return
  }
  saved = (await coll().findOne({ _id: 'main' })) || {}
  if (!saved.instance) await persist({ instance: crypto.randomUUID() })
  loaded = true
  // Server litsenziya serverini kutmasdan ishga tushadi (saqlangan javob bilan)
  check().then(() => {
    const s = status()
    console.log(`🔑 Litsenziya: ${s.state}${s.customer ? ` — ${s.customer}, ${s.paidUntil.slice(0, 10)} gacha` : ''}${lastError ? ` (${lastError})` : ''}`)
  })
  setInterval(check, INTERVAL_MS).unref()
  setInterval(() => persist({ maxSeen: now() }), 10 * 60000).unref()
}

// Bloklangan holatda ham ochiq qoladiganlar
const ALLOW = [/^\/api\/license\//, /^\/api\/settings\/public$/, /^\/api\/sync\//]
function requireLicense(req, res, next) {
  if (!ENABLED || !req.path.startsWith('/api/') || ALLOW.some(r => r.test(req.path))) return next()
  const s = status()
  if (!s.blocked) return next()
  res.status(402).json({ code: 'LICENSE_BLOCKED', message: 'Obuna faol emas', license: s })
}

const router = require('express').Router()
router.get('/status', (req, res) => res.json(status()))
router.post('/refresh', async (req, res) => {
  if (ENABLED && Date.now() - lastTry > 15000) await check()
  res.json(status())
})

// Cloud → kassa: oxirgi imzolangan javob (routes/sync.js dan, SYNC_KEY bilan)
const currentToken = () => (verify(saved?.token) ? saved.token : null)
// POST /api/license/key — kalitni bloklash ekranidan kiritish (kassa / restoran ichidan).
// Avval litsenziya serverida tekshiriladi, faqat to'g'ri bo'lsa saqlanadi.
router.post('/key', async (req, res) => {
  const { isOnPremise } = require('../utils/onPremise')
  if (!ENABLED) return res.status(400).json({ message: 'Litsenziya tekshiruvi o\'chiq' })
  if (VIA_CLOUD) return res.status(400).json({ message: 'Bu kassa litsenziyani cloud serverdan oladi — kalit kerak emas' })
  if (ENV_KEY) return res.status(400).json({ message: 'Kalit server sozlamalarida (.env) berilgan' })
  if (!(await isOnPremise(req))) return res.status(403).json({ message: 'Kalitni faqat restoran ichidan kiritish mumkin' })
  const key = String(req.body?.key || '').trim().toUpperCase()
  if (!KEY_RE.test(key)) return res.status(400).json({ message: 'Kalit RP-XXXX-XXXX-XXXX ko\'rinishida bo\'lishi kerak' })
  if (Date.now() - lastTry < 1500) return res.status(429).json({ message: 'Biroz kuting' })
  lastTry = Date.now()
  try {
    const { token, updateToken } = await fetchToken(key)
    const p = verify(token)
    if (!p || p.k !== key) throw new Error('Litsenziya javobi imzosi noto\'g\'ri')
    await persist({ key, token, lastCheckAt: Date.now(), ...(verifyUpdate(updateToken) ? { updateToken } : {}) })
    lastError = null
    console.log(`🔑 Litsenziya kaliti kiritildi: …${key.slice(-4)} — ${p.n}`)
    res.json(status())
  } catch (err) {
    res.status(400).json({ message: err.cause?.code ? `Litsenziya serveriga ulanib bo'lmadi (${err.cause.code}). Internetni tekshiring.` : err.message })
  }
})

const currentUpdateToken = () => (verifyUpdate(saved?.updateToken) ? saved.updateToken : null)

// GET /api/license/update-token — kassa va ofitsant terminali ilovalari yangilanishni
// litsenziya serveridan yuklashi uchun (faqat restoran ichidan: localhost / Wi-Fi)
router.get('/update-token', async (req, res) => {
  const { isOnPremise } = require('../utils/onPremise')
  if (!(await isOnPremise(req))) return res.status(403).json({ message: 'Faqat restoran tarmog\'idan' })
  const token = ENABLED && currentUpdateToken()
  if (!token || !LICENSE_URL) return res.status(404).json({ message: 'Yangilanish sozlanmagan' })
  res.json({ url: `${LICENSE_URL}/updates`, token })
})

module.exports = { start, status, requireLicense, router, currentToken, currentUpdateToken, verify }

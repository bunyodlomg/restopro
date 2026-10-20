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
// Internetsiz ham saqlangan imzoli javob bo'yicha ishlaydi: to'langan muddat (+ muhlat) o'tsa
// bloklanadi; internet qaytishi bilan joriy holat olinadi (to'langan bo'lsa — darhol ochiladi).
//
// Darhol: sotuvchi admin panelda to'xtatsa / faollashtirsa / to'lov kiritsa, litsenziya serveri
// kutib turgan so'rovga (/api/v1/wait, long-poll) javob beradi → shu zahoti qayta tekshiriladi.
// Kassa xuddi shunday cloud'ni kutadi (/api/sync/license/wait). Ochiq ekranlarga socket orqali.
//
// Kassa (SYNC_URL bor) javobni cloud orqali oladi: alohida kalit kerak emas.

const crypto   = require('crypto')
const mongoose = require('mongoose')
const vendor   = require('./vendor.json')
const { EventEmitter } = require('events')
// Kassa ilovasi o'z versiyasini beradi (desktop/main.js → APP_VERSION)
const VERSION  = process.env.APP_VERSION || require('../package.json').version

const PUBKEY      = process.env.LICENSE_PUBKEY || vendor.publicKey || ''
const LICENSE_URL = (process.env.LICENSE_URL || vendor.licenseUrl || '').replace(/\/+$/, '')
// .env dagi kalit endi ixtiyoriy: sotuvchi panelda serverni mijozga biriktirsa, kalit litsenziya
// serveridan keladi va bazada saqlanadi (saved.key) — VPS'ga kirib .env yozish shart emas.
const LICENSE_KEY = (process.env.LICENSE_KEY || '').trim().toUpperCase()
// Sotuvchi panelida server qaysi restoranniki ekanini tanish uchun (domen yoki kompyuter nomi)
const HOST = (process.env.PUBLIC_URL || (process.env.CLIENT_URL || '').split(',')[0] || require('os').hostname()).trim().slice(0, 120)
const SYNC_URL    = (process.env.SYNC_URL || '').replace(/\/+$/, '')
const SYNC_KEY    = process.env.SYNC_KEY || ''
// Davriy tekshiruv (holat statistikasi ham shu bilan boradi); o'zgarishlar long-poll bilan darhol keladi
const INTERVAL_MS = Math.max(30, parseInt(process.env.LICENSE_INTERVAL, 10) || 60) * 1000
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
const currentKey = () => saved?.key || LICENSE_KEY
const bus = new EventEmitter()   // 'token' — yangi javob saqlandi (kassalar kutib turadi)
bus.setMaxListeners(0)

// Litsenziya serveriga yuboriladigan holat (qurilmalar, ofitsantlar) — server.js beradi
let statsProvider = null
const setStatsProvider = fn => { statsProvider = fn }
const collectStats = () => (statsProvider ? statsProvider().catch(() => null) : Promise.resolve(null))

// Imzoni tekshirish → payload yoki null
function verify(token) {
  if (!publicKey || typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    if (!crypto.verify(null, Buffer.from(body), publicKey, Buffer.from(sig, 'base64url'))) return null
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (p.v !== 1 || !p.pu || !p.iat || !p.exp) return null
    if (!VIA_CLOUD && currentKey() && p.k !== currentKey()) return null   // boshqa mijozning javobi
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

async function fetchToken() {
  const stats = await collectStats()
  if (VIA_CLOUD) {
    // Kassa o'zini cloud'ga tanitadi: cloud uni "online qurilmalar" ro'yxatida ko'rsatadi
    const r = await fetch(`${SYNC_URL}/api/sync/license`, {
      headers: {
        'x-sync-key': SYNC_KEY, 'x-node': process.env.NODE_ID || 'kassa', 'x-version': VERSION,
        ...(stats ? { 'x-stats': JSON.stringify(stats) } : {}),
      },
      signal: AbortSignal.timeout(20000),
    })
    if (r.status === 410) throw revokedError()   // cloud: sotuvchi litsenziyani bekor qilgan
    if (!r.ok) throw new Error(r.status === 404 ? 'Cloud serverda litsenziya hali yo\'q' : `Cloud javobi: ${r.status}`)
    return r.json()
  }
  if (!LICENSE_URL) throw new Error('Litsenziya serveri manzili yo\'q (vendor.json)')
  const r = await fetch(`${LICENSE_URL}/api/v1/check`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key: currentKey() || undefined, instance: saved?.instance, host: HOST, version: VERSION, role: ROLE, stats }),
    signal: AbortSignal.timeout(20000),
  })
  const j = await r.json().catch(() => ({}))
  // Kalit bazada yo'q (sotuvchi mijozni o'chirgan) — faqat litsenziya serverining aniq javobi bo'yicha
  if (r.status === 404 && j.code === 'UNKNOWN_KEY') throw revokedError()
  if (r.status === 404) throw new Error('Litsenziya serveri javobi: 404')
  if (!r.ok) throw new Error(j.message || `Litsenziya serveri javobi: ${r.status}`)
  return j
}

// Sotuvchi mijozni o'chirgan — saqlangan javob bilan ishlashda davom etmaslik kerak (aks holda 14 kun ishlaydi)
function revokedError() {
  return Object.assign(new Error('Litsenziya kaliti topilmadi (sotuvchi bekor qilgan)'), { revoked: true })
}

async function check() {
  if (!ENABLED) return
  lastTry = Date.now()
  try {
    const { token, updateToken, key } = await fetchToken()
    // Sotuvchi serverni mijozga biriktirgan / kalit almashgan — yangi kalitni saqlaymiz
    if (!VIA_CLOUD && key && key !== saved?.key) await persist({ key: String(key).toUpperCase() })
    const p = verify(token)
    if (!p) throw new Error('Litsenziya javobi imzosi noto\'g\'ri')
    const cur = verify(saved?.token)
    // Eskiroq javob yangisini almashtira olmaydi
    if (!cur || p.iat >= cur.iat) {
      await persist({ token, revoked: false, lastCheckAt: Date.now(), ...(verifyUpdate(updateToken) ? { updateToken } : {}) })
      bus.emit('token')
    } else if (saved?.revoked) await persist({ revoked: false })
    lastError = null
  } catch (err) {
    lastError = err.cause?.code ? `Ulanib bo'lmadi (${err.cause.code})` : err.message
    if (err.revoked && !saved?.revoked) {
      await persist({ revoked: true, token: null, updateToken: null })
      bus.emit('token')   // kutib turgan kassalar ham darhol bilsin
    }
  }
  await persist({ maxSeen: now() })
  announce()
}

// ── Holat o'zgarsa — ochiq ekranlarga (server.js socket orqali yuboradi) ──
const listeners = []
const onChange = fn => listeners.push(fn)
let lastKey = null
function announce() {
  const s = status()
  const key = [s.state, s.blocked, s.paidUntil].join('|')
  if (key === lastKey) return
  const first = lastKey === null
  lastKey = key
  if (!first) for (const fn of listeners) { try { fn(s) } catch {} }
}

// ── Darhol: o'zgarishni kutib turish (long-poll) ───────────────
const pause = ms => new Promise(r => setTimeout(r, ms).unref?.())
async function watch() {
  let rev = null
  for (;;) {
    try {
      let r
      if (VIA_CLOUD) {
        const iat = verify(saved?.token)?.iat || 0
        r = await fetch(`${SYNC_URL}/api/sync/license/wait?iat=${iat}`, { headers: { 'x-sync-key': SYNC_KEY }, signal: AbortSignal.timeout(40000) })
        if (r.status === 404) return               // eski cloud — faqat davriy tekshiruv
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        // iat 0 — cloud'da javob yo'q (bekor qilingan) — bu ham o'zgarish
        if (j.iat !== iat && Date.now() - lastTry > 2000) await check()
      } else {
        r = await fetch(`${LICENSE_URL}/api/v1/wait`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: currentKey() || undefined, instance: saved?.instance, rev }), signal: AbortSignal.timeout(40000),
        })
        if (r.status === 404) {
          if (!(await r.json().catch(() => ({}))).code) return   // eski litsenziya serveri — faqat davriy tekshiruv
          await pause(60000); continue                           // kalit o'chirilgan — tez-tez so'ramaymiz
        }
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        if (rev !== null && j.rev !== rev) await check()   // sotuvchi holatni o'zgartirdi
        rev = j.rev
      }
    } catch {
      await pause(5000)   // internet yo'q — biroz kutib qayta
    }
  }
}

// Cloud tomoni: kassa kutib turadi, yangi javob saqlanishi bilan (yoki 25 s da) qaytadi
function waitToken(iat, ms = 25000) {
  const cur = () => verify(saved?.token)?.iat || 0
  if (cur() !== iat) return Promise.resolve(cur())
  return new Promise(resolve => {
    const done = () => { clearTimeout(t); bus.off('token', done); resolve(cur()) }
    const t = setTimeout(done, ms)
    bus.on('token', done)
  })
}

function status() {
  if (!ENABLED) return { enabled: false, state: 'off', blocked: false }
  const base = { enabled: true, role: ROLE, lastCheckAt: saved?.lastCheckAt || null, lastError, keyHint: currentKey() ? currentKey().slice(-4) : null, serverId: serverId() }
  if (!loaded) return { ...base, state: 'checking', blocked: false }
  const p = verify(saved?.token)
  if (saved?.revoked) return { ...base, state: 'revoked', blocked: true, contact: vendor.contact || '' }
  if (!p) {
    const reason = !VIA_CLOUD && !currentKey() ? 'nokey' : 'missing'
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
  setInterval(announce, 30000).unref()   // muddat vaqt o'tishi bilan tugasa ham ekranlar bilsin
  if (VIA_CLOUD || LICENSE_URL) watch()
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
// Bloklangan ekranda ko'rinadi — sotuvchi panelidagi "Ulanmagan serverlar" bilan solishtirish uchun
const serverId = () => (VIA_CLOUD ? null : String(saved?.instance || '').slice(0, 8).toUpperCase() || null)
const currentToken = () => (verify(saved?.token) ? saved.token : null)
const isRevoked = () => !!saved?.revoked
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

module.exports = { start, status, requireLicense, router, currentToken, currentUpdateToken, isRevoked, verify, onChange, setStatsProvider, waitToken }

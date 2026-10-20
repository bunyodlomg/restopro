// ============================================================
//  RestoPro litsenziya serveri (sotuvchi — siz uchun)
//
//  Har bir restoran serveri / kassasi soatiga bir marta shu yerga
//  litsenziya kalitini yuboradi va IMZOLANGAN javob oladi:
//    { mijoz, holat (active/suspended), qachongacha to'langan }
//  Imzo Ed25519: maxfiy kalit faqat shu serverda, restoranlarda
//  faqat ochiq kalit bor — javobni soxtalashtirib bo'lmaydi.
//
//  Admin panel: https://<domen>/admin  (login: admin, parol: ADMIN_PASSWORD)
// ============================================================
require('dotenv').config()
const express = require('express')
const crypto  = require('crypto')
const fs      = require('fs')
const path    = require('path')

const PORT           = parseInt(process.env.PORT, 10) || 7070
const DATA_DIR       = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'))
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const GRACE_DAYS     = Math.max(0, parseInt(process.env.GRACE_DAYS, 10) || 3)
const VENDOR_CONTACT = (process.env.VENDOR_CONTACT || '').slice(0, 120)
const TOKEN_DAYS     = 14     // restoran internetsiz qancha kun ishlay oladi (keyin qayta tekshirish shart)
// Ilovalar yangilanishi: GitHub Actions shu tokenni ishlatib yangi .exe larni yuklaydi
const UPLOAD_TOKEN   = process.env.UPDATE_UPLOAD_TOKEN || ''
const UPDATE_DAYS    = 30     // yangilanish ruxsatnomasi muddati

if (ADMIN_PASSWORD.length < 10) {
  console.error('ADMIN_PASSWORD o\'rnatilmagan yoki juda qisqa (kamida 10 belgi). .env faylini to\'ldiring.')
  process.exit(1)
}
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })

// ── Kalitlar ───────────────────────────────────────────────────
const KEYS_FILE = path.join(DATA_DIR, 'keys.json')
if (!fs.existsSync(KEYS_FILE)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  fs.writeFileSync(KEYS_FILE, JSON.stringify({
    private: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    public: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    createdAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 })
  console.log('Yangi imzo kalitlari yaratildi:', KEYS_FILE)
}
const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'))
const PRIVATE_KEY = crypto.createPrivateKey({ key: Buffer.from(keys.private, 'base64'), format: 'der', type: 'pkcs8' })
const PUBLIC_KEY_B64 = keys.public

const b64u = buf => Buffer.from(buf).toString('base64url')
function signToken(payload) {
  const body = b64u(JSON.stringify(payload))
  return body + '.' + b64u(crypto.sign(null, Buffer.from(body), PRIVATE_KEY))
}

// ── Mijozlar bazasi (JSON fayl, atomar yozish) ─────────────────
const DB_FILE = path.join(DATA_DIR, 'db.json')
let db = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { customers: [] }
function saveDb() {
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, DB_FILE)
}
const findByKey = key => db.customers.find(c => c.key === key)
const findById  = id  => db.customers.find(c => c.id === id)

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // 0/O, 1/I chalkashmasin
function newKey() {
  let k
  do {
    const bytes = crypto.randomBytes(12)
    const chars = [...bytes].map(b => KEY_ALPHABET[b % KEY_ALPHABET.length]).join('')
    k = `RP-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`
  } while (findByKey(k))
  return k
}

const DAY = 86400000
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
function addMonths(date, n) {
  const d = new Date(date)
  const day = d.getDate()
  d.setMonth(d.getMonth() + n)
  if (d.getDate() < day) d.setDate(0)          // 31-yanvar + 1 oy → 28/29-fevral
  return d
}
// Muddat o'tgach necha kun ishlay oladi: mijozga alohida (graceDays) yoki .env dagi GRACE_DAYS.
// 0 — muddat tugashi bilan bloklanadi (internetsiz kassa ham, saqlangan imzoli javob bo'yicha).
const graceOf = c => (Number.isInteger(c.graceDays) ? c.graceDays : GRACE_DAYS)

// Mijozning hozirgi holati (admin panel uchun)
function stateOf(c) {
  if (c.status === 'suspended') return 'suspended'
  const left = new Date(c.paidUntil) - Date.now()
  if (left < -graceOf(c) * DAY) return 'expired'
  if (left < 0) return 'grace'
  if (left < 5 * DAY) return 'warning'
  return 'active'
}

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 'loopback')
app.use(express.json({ limit: '32kb' }))

// ── Ochiq API: restoranlar tekshiruvi ──────────────────────────
const hits = new Map()   // oddiy IP cheklovi: daqiqasiga 120 so'rov (bir VPS'da bir nechta restoran: har biri ~4 ta)
setInterval(() => hits.clear(), 60000).unref()
function limit(req, res, next) {
  const n = (hits.get(req.ip) || 0) + 1
  hits.set(req.ip, n)
  if (n > 120) return res.status(429).json({ message: 'Juda ko\'p so\'rov' })
  next()
}

// ── Darhol bildirish: admin holatni o'zgartirsa (to'xtatish, faollashtirish, to'lov) ──
// Restoran serveri /api/v1/wait da "kutib turadi" (long-poll); rev o'zgarishi bilan javob oladi
// va darhol qayta tekshiradi — soatlab kutish yo'q.
const waiting = new Map()   // customerId → Set<res>
function bump(c) {
  c.rev = (c.rev || 0) + 1
  for (const res of waiting.get(c.id) || []) if (!res.headersSent) res.json({ rev: c.rev })
  waiting.delete(c.id)
}

app.post('/api/v1/wait', limit, (req, res) => {
  const c = findByKey(String(req.body?.key || '').trim().toUpperCase())
  if (!c) return res.status(404).json({ code: 'UNKNOWN_KEY', message: 'Litsenziya kaliti topilmadi' })
  const rev = c.rev || 0
  // Mijoz hali joriy rev'ni bilmasa (birinchi so'rov) yoki eskisini bilsa — darhol javob
  if (req.body?.rev == null || Number(req.body.rev) !== rev) return res.json({ rev })
  const set = waiting.get(c.id) || new Set()
  waiting.set(c.id, set.add(res))
  const done = () => { clearTimeout(timer); set.delete(res) }
  const timer = setTimeout(() => { done(); if (!res.headersSent) res.json({ rev: c.rev || 0 }) }, 25000)
  res.on('close', done)
})

// Restoran serveri yuborgan holat (qurilmalar, ofitsantlar) — faqat raqamlar va qisqa matnlar saqlanadi
const num = v => Math.max(0, Math.min(1e6, Math.round(Number(v) || 0)))
function cleanStats(raw) {
  if (!raw || typeof raw !== 'object') return null
  const counts = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 10).map(([k, v]) => [String(k).slice(0, 20), num(v)]))
  return {
    at: new Date().toISOString(),
    waiters: num(raw.waiters), admins: num(raw.admins), waitersOnline: num(raw.waitersOnline),
    devices: counts(raw.devices),
    nodes: (Array.isArray(raw.nodes) ? raw.nodes : []).slice(0, 20).map(n => ({
      id: String(n?.id || '').slice(0, 40),
      version: String(n?.version || '').slice(0, 20),
      lastSeen: n?.lastSeen && !isNaN(new Date(n.lastSeen)) ? new Date(n.lastSeen).toISOString() : null,
      devices: counts(n?.devices),
    })),
  }
}

app.post('/api/v1/check', limit, (req, res) => {
  const key = String(req.body?.key || '').trim().toUpperCase()
  const c = findByKey(key)
  if (!c) return res.status(404).json({ code: 'UNKNOWN_KEY', message: 'Litsenziya kaliti topilmadi' })

  c.lastSeen = new Date().toISOString()
  c.lastIp = req.ip
  c.version = String(req.body?.version || '').slice(0, 20)
  const inst = String(req.body?.instance || '').slice(0, 64)
  if (inst) {
    c.instances = c.instances || {}
    c.instances[inst] = { lastSeen: c.lastSeen, ip: req.ip, role: String(req.body?.role || '').slice(0, 20) }
  }
  const stats = cleanStats(req.body?.stats)
  if (stats) c.stats = stats
  saveDb()

  const now = Date.now()
  res.json({
    token: signToken({
      v: 1,
      k: c.key,
      n: c.name,
      s: c.status === 'suspended' ? 'suspended' : 'active',
      pu: c.paidUntil,             // shu sanagacha to'langan
      g: graceOf(c),               // undan keyin necha kun ogohlantirish bilan ishlaydi
      c: VENDOR_CONTACT,
      iat: now,
      exp: now + TOKEN_DAYS * DAY, // internetsiz ishlash chegarasi
    }),
    // Ilovalarni yangilash ruxsatnomasi (kalitsiz — ofitsant terminaliga ham berish xavfsiz)
    updateToken: signToken({ v: 1, t: 'upd', id: c.id, iat: now, exp: now + UPDATE_DAYS * DAY }),
  })
})

// ── Ilovalar yangilanishi (electron-updater "generic" provider) ──
// Kassa: GET /updates/latest.yml, Ofitsant terminali: GET /updates/terminal.yml,
// so'ng yml ichidagi .exe (Range so'rovlari bilan — faqat o'zgargan qismlar yuklanadi).
// Faqat amaldagi litsenziyasi bor restoranlar yuklay oladi.
const UPD_DIR = path.join(DATA_DIR, 'updates')
fs.mkdirSync(UPD_DIR, { recursive: true })
const SAFE_UPD = /^[A-Za-z0-9._-]+\.(yml|exe|blockmap)$/

function verifyOwn(token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(PUBLIC_KEY_B64, 'base64'), format: 'der', type: 'spki' })
    if (!crypto.verify(null, Buffer.from(body), pub, Buffer.from(sig, 'base64url'))) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch { return null }
}

app.get('/updates/:file', (req, res) => {
  const p = verifyOwn(req.get('x-restopro-update'))
  if (!p || p.t !== 'upd' || p.exp < Date.now() || !findById(p.id))
    return res.status(401).json({ message: 'Yangilanish uchun litsenziya kerak' })
  const name = req.params.file
  if (!SAFE_UPD.test(name)) return res.status(404).end()
  const file = path.join(UPD_DIR, name)
  if (!fs.existsSync(file)) return res.status(404).end()
  res.set('Cache-Control', 'no-store')
  res.sendFile(file)
})

// PUT /api/v1/updates/:file — GitHub Actions yuklaydi (Authorization: Bearer UPDATE_UPLOAD_TOKEN).
// .exe/.blockmap avval, .yml oxirida — mijozlar yml'ni ko'rganda fayl allaqachon joyida bo'ladi.
app.put('/api/v1/updates/:file', (req, res) => {
  const given = Buffer.from((req.get('authorization') || '').replace(/^Bearer /, ''))
  const want = Buffer.from(UPLOAD_TOKEN)
  if (UPLOAD_TOKEN.length < 32 || given.length !== want.length || !crypto.timingSafeEqual(given, want))
    return res.status(401).json({ message: 'Ruxsat yo\'q' })
  const name = req.params.file
  if (!SAFE_UPD.test(name)) return res.status(400).json({ message: 'Fayl nomi noto\'g\'ri' })
  const dest = path.join(UPD_DIR, name)
  const tmp = dest + '.part'
  const out = fs.createWriteStream(tmp)
  let size = 0
  req.on('data', ch => { size += ch.length; if (size > 400 * 1024 * 1024) req.destroy() })
  req.pipe(out)
  out.on('finish', () => {
    if (!size) { fs.rmSync(tmp, { force: true }); return res.status(400).json({ message: 'Bo\'sh fayl' }) }
    fs.renameSync(tmp, dest)
    if (name.endsWith('.yml')) cleanupUpdates()
    res.json({ ok: true, name, size })
  })
  out.on('error', err => { fs.rmSync(tmp, { force: true }); res.status(500).json({ message: err.message }) })
  req.on('aborted', () => fs.rmSync(tmp, { force: true }))
})

// Hozirgi yml'larda ko'rsatilmagan eski .exe/.blockmap fayllarni o'chirish
function cleanupUpdates() {
  const keep = new Set()
  for (const yml of fs.readdirSync(UPD_DIR).filter(f => f.endsWith('.yml'))) {
    const text = fs.readFileSync(path.join(UPD_DIR, yml), 'utf8')
    for (const m of text.matchAll(/(?:path|url):\s*([^\s]+)/g)) { keep.add(m[1]); keep.add(m[1] + '.blockmap') }
  }
  for (const f of fs.readdirSync(UPD_DIR)) {
    if (/\.(exe|blockmap)$/.test(f) && !keep.has(f)) fs.rmSync(path.join(UPD_DIR, f), { force: true })
  }
}
function currentVersions() {
  const out = {}
  for (const [ch, yml] of [['kassa', 'latest.yml'], ['terminal', 'terminal.yml']]) {
    const f = path.join(UPD_DIR, yml)
    if (!fs.existsSync(f)) continue
    const m = fs.readFileSync(f, 'utf8').match(/^version:\s*(.+)$/m)
    out[ch] = { version: m?.[1]?.trim(), at: fs.statSync(f).mtime.toISOString() }
  }
  return out
}

app.get('/api/v1/pubkey', (req, res) => res.json({ publicKey: PUBLIC_KEY_B64 }))
app.get('/health', (req, res) => res.json({ ok: true }))

// ── Admin (HTTP Basic, faqat HTTPS orqali ishlating) ───────────
const fails = new Map()
function adminAuth(req, res, next) {
  const f = fails.get(req.ip) || { n: 0, until: 0 }
  if (f.until > Date.now()) return res.status(429).send('Ko\'p xato urinish. 15 daqiqadan keyin qayta urining.')
  const [scheme, value] = (req.get('authorization') || '').split(' ')
  let ok = false
  if (scheme === 'Basic' && value) {
    const [user, ...rest] = Buffer.from(value, 'base64').toString().split(':')
    const pass = Buffer.from(rest.join(':'))
    const want = Buffer.from(ADMIN_PASSWORD)
    ok = user === 'admin' && pass.length === want.length && crypto.timingSafeEqual(pass, want)
  }
  if (!ok) {
    if (scheme === 'Basic') {
      f.n += 1
      if (f.n >= 8) { f.until = Date.now() + 15 * 60000; f.n = 0 }
      fails.set(req.ip, f)
    }
    res.set('WWW-Authenticate', 'Basic realm="RestoPro litsenziya", charset="UTF-8"')
    return res.status(401).send('Kirish kerak')
  }
  fails.delete(req.ip)
  next()
}

const admin = express.Router()
admin.use(adminAuth)
admin.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')))

const ONLINE_MS = 3 * 60000   // restoran serveri har daqiqada tekshiradi
const isOnline = at => !!at && Date.now() - new Date(at) < ONLINE_MS
const view = c => ({
  ...c, state: stateOf(c), grace: graceOf(c), online: isOnline(c.lastSeen),
  stats: c.stats && { ...c.stats, nodes: (c.stats.nodes || []).map(n => ({ ...n, online: isOnline(n.lastSeen) })) },
})
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const money = v => Math.max(0, Math.round(Number(v) || 0))

admin.get('/api/info', (req, res) => res.json({ publicKey: PUBLIC_KEY_B64, graceDays: GRACE_DAYS, onlineMs: ONLINE_MS, contact: VENDOR_CONTACT, updates: currentVersions(), uploadReady: UPLOAD_TOKEN.length >= 32 }))
admin.get('/api/customers', (req, res) => res.json(db.customers.map(view)))

admin.post('/api/customers', (req, res) => {
  const name = str(req.body.name, 80)
  if (!name) return res.status(400).json({ message: 'Restoran nomi kerak' })
  const trialDays = Math.min(60, Math.max(0, parseInt(req.body.trialDays, 10) || 0))
  const c = {
    id: crypto.randomUUID(),
    key: newKey(),
    name,
    owner: str(req.body.owner, 80),
    phone: str(req.body.phone, 40),
    address: str(req.body.address, 160),
    monthly: money(req.body.monthly),
    setupFee: money(req.body.setupFee),
    note: str(req.body.note, 500),
    status: 'active',
    paidUntil: new Date(startOfToday().getTime() + (trialDays + 1) * DAY).toISOString(),
    createdAt: new Date().toISOString(),
    payments: [],
  }
  db.customers.push(c); saveDb()
  res.status(201).json(view(c))
})

admin.put('/api/customers/:id', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  for (const [k, max] of [['name', 80], ['owner', 80], ['phone', 40], ['address', 160], ['note', 500]])
    if (req.body[k] !== undefined) c[k] = str(req.body[k], max)
  if (req.body.monthly !== undefined) c.monthly = money(req.body.monthly)
  if (req.body.paidUntil) {
    const d = new Date(req.body.paidUntil)
    if (isNaN(d)) return res.status(400).json({ message: 'Sana noto\'g\'ri' })
    c.paidUntil = d.toISOString()
  }
  // Muhlat: bo'sh — umumiy (GRACE_DAYS), 0 — muddat tugashi bilan blok
  if (req.body.graceDays !== undefined) {
    const g = String(req.body.graceDays).trim()
    c.graceDays = g === '' ? undefined : Math.min(30, Math.max(0, parseInt(g, 10) || 0))
  }
  bump(c); saveDb(); res.json(view(c))
})

// To'lov: muddat tugagan bo'lsa bugundan, aks holda joriy muddatdan uzaytiriladi
admin.post('/api/customers/:id/pay', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  const months = Math.min(24, Math.max(1, parseInt(req.body.months, 10) || 1))
  const base = Math.max(new Date(c.paidUntil).getTime(), startOfToday().getTime())
  c.paidUntil = addMonths(base, months).toISOString()
  c.payments.push({
    at: new Date().toISOString(),
    months,
    amount: req.body.amount !== undefined ? money(req.body.amount) : c.monthly * months,
    note: str(req.body.note, 200),
    until: c.paidUntil,
  })
  if (c.status === 'suspended' && req.body.activate !== false) c.status = 'active'
  bump(c); saveDb(); res.json(view(c))
})

admin.post('/api/customers/:id/suspend', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  c.status = 'suspended'; c.suspendedAt = new Date().toISOString()
  bump(c); saveDb(); res.json(view(c))
})
admin.post('/api/customers/:id/activate', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  c.status = 'active'
  bump(c); saveDb(); res.json(view(c))
})
admin.delete('/api/customers/:id', (req, res) => {
  const i = db.customers.findIndex(c => c.id === req.params.id)
  if (i < 0) return res.status(404).json({ message: 'Topilmadi' })
  bump(db.customers[i])
  db.customers.splice(i, 1); saveDb()
  res.json({ ok: true })
})

app.use('/admin', admin)
app.get('/', (req, res) => res.redirect('/admin'))
app.use((req, res) => res.status(404).json({ message: 'Topilmadi' }))

app.listen(PORT, () => {
  console.log(`RestoPro litsenziya serveri: http://localhost:${PORT}/admin`)
  console.log(`Ochiq kalit (server/license/vendor.json → publicKey): ${PUBLIC_KEY_B64}`)
})

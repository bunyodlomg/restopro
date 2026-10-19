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
// Mijozning hozirgi holati (admin panel uchun)
function stateOf(c) {
  if (c.status === 'suspended') return 'suspended'
  const left = new Date(c.paidUntil) - Date.now()
  if (left < -GRACE_DAYS * DAY) return 'expired'
  if (left < 0) return 'grace'
  if (left < 5 * DAY) return 'warning'
  return 'active'
}

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 'loopback')
app.use(express.json({ limit: '32kb' }))

// ── Ochiq API: restoranlar tekshiruvi ──────────────────────────
const hits = new Map()   // oddiy IP cheklovi: daqiqasiga 30 so'rov
setInterval(() => hits.clear(), 60000).unref()
function limit(req, res, next) {
  const n = (hits.get(req.ip) || 0) + 1
  hits.set(req.ip, n)
  if (n > 30) return res.status(429).json({ message: 'Juda ko\'p so\'rov' })
  next()
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
  saveDb()

  const now = Date.now()
  res.json({
    token: signToken({
      v: 1,
      k: c.key,
      n: c.name,
      s: c.status === 'suspended' ? 'suspended' : 'active',
      pu: c.paidUntil,             // shu sanagacha to'langan
      g: GRACE_DAYS,               // undan keyin necha kun ogohlantirish bilan ishlaydi
      c: VENDOR_CONTACT,
      iat: now,
      exp: now + TOKEN_DAYS * DAY, // internetsiz ishlash chegarasi
    }),
  })
})

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

const view = c => ({ ...c, state: stateOf(c) })
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const money = v => Math.max(0, Math.round(Number(v) || 0))

admin.get('/api/info', (req, res) => res.json({ publicKey: PUBLIC_KEY_B64, graceDays: GRACE_DAYS, contact: VENDOR_CONTACT }))
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
  saveDb(); res.json(view(c))
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
  saveDb(); res.json(view(c))
})

admin.post('/api/customers/:id/suspend', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  c.status = 'suspended'; c.suspendedAt = new Date().toISOString()
  saveDb(); res.json(view(c))
})
admin.post('/api/customers/:id/activate', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  c.status = 'active'
  saveDb(); res.json(view(c))
})
admin.delete('/api/customers/:id', (req, res) => {
  const i = db.customers.findIndex(c => c.id === req.params.id)
  if (i < 0) return res.status(404).json({ message: 'Topilmadi' })
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

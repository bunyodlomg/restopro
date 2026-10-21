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
// Restoran internetsiz necha kun ishlay oladi (keyin litsenziya serveri bilan bog'lanish shart).
// Qisqa bo'lsin: o'chirilgan / to'xtatilgan mijoz kassani internetdan uzib bepul ishlata olmasin.
const OFFLINE_DAYS   = Math.min(30, Math.max(1, parseInt(process.env.OFFLINE_DAYS, 10) || 3))
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
const offlineOf = c => (Number.isInteger(c.offlineDays) ? c.offlineDays : OFFLINE_DAYS)

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

// ── Restoran serverini aniqlash: kalit yoki biriktirilgan server (instance) ──
// Har bir restoran serveri o'zining tasodifiy ID'sini (instance) yuboradi. Kalit .env da bo'lmasa ham,
// sotuvchi admin panelda shu serverni mijozga biriktirsa — server kalitni shu yerdan oladi.
const findByInstance = inst => (inst ? db.customers.find(c => c.instances?.[inst]) : null)
// Sotuvchi ajratgan server (eski / o'g'irlangan nusxa) — kaliti to'g'ri bo'lsa ham tanilmaydi
function customerFor(key, inst) {
  const c = findByKey(key) || findByInstance(inst)
  return c && inst && c.revokedInstances?.[inst] ? null : c
}

// Amallar tarixi (admin panelda: kim / qachon to'xtatdi, faollashtirdi, to'lov...)
function logEvent(c, act, detail = '') {
  c.events = [...(c.events || []), { at: new Date().toISOString(), act, detail: String(detail).slice(0, 200) }].slice(-200)
}
// Bloklash turi: yumshoq — yangi buyurtma yo'q, ochiq hisoblarni yopish mumkin; to'liq — tizim yopiladi
const blockModeOf = c => (c.blockMode === 'hard' ? 'hard' : 'soft')

// Biriktirilmagan serverlar (admin panelda "Ulanmagan serverlar")
db.pending = db.pending || {}
const PENDING_DAYS = 7
function notePending(inst, req) {
  if (!inst) return
  db.pending[inst] = {
    lastSeen: new Date().toISOString(), ip: req.ip,
    role: String(req.body?.role || '').slice(0, 20),
    host: String(req.body?.host || '').slice(0, 120),
    version: String(req.body?.version || '').slice(0, 20),
    key: String(req.body?.key || '').slice(0, 20),     // eski/noto'g'ri kalit — qaysi restoran ekanini topish uchun
  }
}

// ── Darhol bildirish: admin holatni o'zgartirsa (to'xtatish, faollashtirish, to'lov, biriktirish) ──
// Restoran serveri /api/v1/wait da "kutib turadi" (long-poll); rev o'zgarishi bilan javob oladi
// va darhol qayta tekshiradi — soatlab kutish yo'q.
const waiting = new Map()   // customerId yoki 'inst:<id>' → Set<res>
function release(id, rev) {
  for (const res of waiting.get(id) || []) if (!res.headersSent) res.json({ rev })
  waiting.delete(id)
}
function bump(c) {
  c.rev = (c.rev || 0) + 1
  release(c.id, c.rev)
}

app.post('/api/v1/wait', limit, (req, res) => {
  const inst = String(req.body?.instance || '').slice(0, 64)
  const c = customerFor(String(req.body?.key || '').trim().toUpperCase(), inst)
  if (!c && !inst) return res.status(404).json({ code: 'UNKNOWN_KEY', message: 'Litsenziya kaliti topilmadi' })
  // Biriktirilmagan server -1 ni kutadi: sotuvchi biriktirishi bilan javob oladi
  const rev = c ? c.rev || 0 : -1
  const id = c ? c.id : 'inst:' + inst
  // Mijoz hali joriy rev'ni bilmasa (birinchi so'rov) yoki eskisini bilsa — darhol javob
  if (req.body?.rev == null || Number(req.body.rev) !== rev) return res.json({ rev })
  const set = waiting.get(id) || new Set()
  waiting.set(id, set.add(res))
  const done = () => { clearTimeout(timer); set.delete(res) }
  const timer = setTimeout(() => { done(); if (!res.headersSent) res.json({ rev }) }, 25000)
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
      health: cleanHealth(n?.health),
      deviceList: cleanDeviceList(n?.deviceList),
    })),
    deviceList: cleanDeviceList(raw.deviceList),
  }
}

// Kassa sog'ligi: sync navbati, ziddiyatlar, soat farqi, litsenziya holati, oxirgi bajarilgan buyruq
const int = v => Math.round(Math.max(-1e9, Math.min(1e9, Number(v) || 0)))
const isoOrNull = v => (v && !isNaN(new Date(v)) ? new Date(v).toISOString() : null)
function cleanHealth(h) {
  if (!h || typeof h !== 'object') return undefined
  return {
    online: !!h.online, pending: int(h.pending), conflicts: int(h.conflicts), merged: int(h.merged),
    clockOffset: int(h.clockOffset), lastSyncAt: isoOrNull(h.lastSyncAt),
    lastError: h.lastError ? String(h.lastError).slice(0, 120) : null,
    license: h.license ? String(h.license).slice(0, 20) : null,
    lastCmd: h.lastCmd ? String(h.lastCmd).slice(0, 40) : null,
  }
}

// Restoran qurilmalari (telefon, ofitsant terminali, kassa oynasi) — sotuvchi alohida bloklay oladi
function cleanDeviceList(list) {
  const s = (v, max) => String(v ?? '').slice(0, max)
  return (Array.isArray(list) ? list : []).slice(0, 25).map(d => ({
    i: s(d?.i, 64), a: ['kassa', 'terminal', 'web'].includes(d?.a) ? d.a : 'web', u: s(d?.u, 40), r: s(d?.r, 20), d: s(d?.d, 40),
    s: isoOrNull(d?.s),
  })).filter(d => d.i)
}

// Imzolangan javobga: alohida bloklangan kassalar, sotuvchi xabari, masofaviy buyruqlar (oxirgi 7 kun)
const CMD_DAYS = 7
function extrasFor(c) {
  const out = {}
  const bn = Object.keys(c.blockedNodes || {})
  if (bn.length) out.bn = bn
  const bd = Object.keys(c.blockedDevices || {})
  if (bd.length) out.bd = bd
  if (c.message?.text) out.msg = { i: c.message.id, t: c.message.text, l: c.message.level }
  const cmd = (c.commands || []).filter(x => Date.now() - new Date(x.at) < CMD_DAYS * DAY).map(x => ({ i: x.id, t: x.type, n: x.node }))
  if (cmd.length) out.cmd = cmd
  return out
}

app.post('/api/v1/check', limit, (req, res) => {
  const key = String(req.body?.key || '').trim().toUpperCase()
  const inst = String(req.body?.instance || '').slice(0, 64)
  const c = customerFor(key, inst)
  if (!c) {
    notePending(inst, req); saveDb()
    return res.status(404).json({ code: 'UNKNOWN_KEY', message: 'Bu server hech qaysi mijozga biriktirilmagan' })
  }

  // Kassa bu yerga faqat cloud ishlamaganda keladi (zaxira yo'l) — restoranning umumiy holati
  // (online, versiya, qurilmalar) cloud'niki bo'lib qoladi, kassa faqat "Serverlar" ro'yxatida yangilanadi
  const role = String(req.body?.role || '').slice(0, 20)
  const at = new Date().toISOString()
  if (role !== 'kassa') {
    c.lastSeen = at
    c.lastIp = req.ip
    c.version = String(req.body?.version || '').slice(0, 20)
  }
  if (inst) {
    c.instances = c.instances || {}
    c.instances[inst] = { lastSeen: at, ip: req.ip, role, host: String(req.body?.host || '').slice(0, 120) }
    delete db.pending[inst]
  }
  const stats = role !== 'kassa' && cleanStats(req.body?.stats)
  if (stats) c.stats = stats
  // Cloud kassani ulash ma'lumotini yuboradi — admin panelda "Kassani ulash" (nusxalash uchun)
  const sync = req.body?.stats?.sync
  if (sync && /^https?:\/\/[\w.-]+(:\d+)?$/.test(String(sync.url || '')) && /^[\w-]{32,128}$/.test(String(sync.key || '')))
    c.sync = { url: String(sync.url), key: String(sync.key), at: new Date().toISOString() }
  saveDb()

  const now = Date.now()
  res.json({
    key: c.key,                    // server kalitni o'zida saqlaydi (.env shart emas)
    token: signToken({
      v: 1,
      k: c.key,
      n: c.name,
      s: c.status === 'suspended' ? 'suspended' : 'active',
      pu: c.paidUntil,             // shu sanagacha to'langan
      g: graceOf(c),               // undan keyin necha kun ogohlantirish bilan ishlaydi
      bm: blockModeOf(c),          // to'xtatilgan / muddati o'tgan: soft yoki hard
      c: VENDOR_CONTACT,
      ...extrasFor(c),
      iat: now,
      exp: now + offlineOf(c) * DAY, // internetsiz ishlash chegarasi
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
function uploadAuth(req) {
  const given = Buffer.from((req.get('authorization') || '').replace(/^Bearer /, ''))
  const want = Buffer.from(UPLOAD_TOKEN)
  return UPLOAD_TOKEN.length >= 32 && given.length === want.length && crypto.timingSafeEqual(given, want)
}

// ── Litsenziya serverining o'zini yangilash ────────────────────
// GitHub Actions (license-server/ o'zgarganda) yoki admin paneldagi «Yangilash» tugmasi
// deploy/update-license.sh ni ishga tushiradi: zaxira → git pull → pm2 restart → tekshiruv,
// ishlamasa oldingi versiyaga qaytadi. Skript server jarayonidan ajratib (setsid) ishga tushiriladi —
// pm2 restart uni ham o'ldirmasligi uchun.
const REPO_DIR      = path.resolve(__dirname, '..')
const UPDATE_SCRIPT = path.join(REPO_DIR, 'deploy', 'update-license.sh')
const UPDATE_LOG    = path.join(DATA_DIR, 'update.log')
const COMMIT = (() => {
  try { return require('child_process').execFileSync('git', ['-C', REPO_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { return '' }
})()
function selfUpdateState() {
  const st = fs.existsSync(UPDATE_LOG) ? fs.statSync(UPDATE_LOG) : null
  const lines = st ? fs.readFileSync(UPDATE_LOG, 'utf8').trim().split('\n') : []
  const last = lines[lines.length - 1] || ''
  // Oxirgi qatorda natija yo'q va log yaqinda yozilgan — hali ketyapti
  const running = !!st && !/✅|❌/.test(last) && Date.now() - st.mtimeMs < 5 * 60000
  return { commit: COMMIT.slice(0, 7), running, at: st ? st.mtime.toISOString() : null, log: lines.slice(-15).join('\n') }
}
function startSelfUpdate() {
  if (process.platform === 'win32' || !fs.existsSync(UPDATE_SCRIPT)) throw Object.assign(new Error('Yangilash skripti topilmadi (deploy/update-license.sh)'), { status: 501 })
  if (selfUpdateState().running) throw Object.assign(new Error('Yangilanish allaqachon ketyapti'), { status: 409 })
  fs.writeFileSync(UPDATE_LOG, `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] Yangilanish boshlandi (${COMMIT.slice(0, 7)})\n`)
  const q = s => `'${s.replace(/'/g, `'\\''`)}'`
  require('child_process').spawn('bash', ['-c', `setsid bash ${q(UPDATE_SCRIPT)} >> ${q(UPDATE_LOG)} 2>&1 < /dev/null &`], {
    detached: true, stdio: 'ignore', env: { ...process.env, PM2_NAME: process.env.PM2_NAME || process.env.name || 'restopro-license' },
  }).unref()
}

// POST /api/v1/self-update — GitHub Actions (Authorization: Bearer UPDATE_UPLOAD_TOKEN)
app.post('/api/v1/self-update', (req, res) => {
  if (!uploadAuth(req)) return res.status(401).json({ message: 'Ruxsat yo\'q' })
  try { startSelfUpdate(); res.json({ ok: true, from: COMMIT.slice(0, 7) }) }
  catch (err) { res.status(err.status || 500).json({ message: err.message }) }
})
// GET /api/v1/version — CI yangilanish tugaganini shu orqali tekshiradi
app.get('/api/v1/version', (req, res) => {
  if (!uploadAuth(req)) return res.status(401).json({ message: 'Ruxsat yo\'q' })
  res.json({ ...selfUpdateState(), commit: COMMIT })
})

app.put('/api/v1/updates/:file', (req, res) => {
  if (!uploadAuth(req)) return res.status(401).json({ message: 'Ruxsat yo\'q' })
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
// no-store: yangilangandan keyin brauzer eski panelni keshdan ko'rsatmasin
admin.get('/', (req, res) => { res.set('Cache-Control', 'no-store'); res.sendFile(path.join(__dirname, 'public', 'admin.html')) })

const ONLINE_MS = 3 * 60000   // restoran serveri har daqiqada tekshiradi
const isOnline = at => !!at && Date.now() - new Date(at) < ONLINE_MS
const view = c => ({
  ...c, state: stateOf(c), grace: graceOf(c), offline: offlineOf(c), blockMode: blockModeOf(c), online: isOnline(c.lastSeen),
  stats: c.stats && { ...c.stats, nodes: (c.stats.nodes || []).map(n => ({ ...n, online: isOnline(n.lastSeen) })) },
})
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const money = v => Math.max(0, Math.round(Number(v) || 0))

admin.get('/api/info', (req, res) => res.json({ publicKey: PUBLIC_KEY_B64, graceDays: GRACE_DAYS, offlineDays: OFFLINE_DAYS, onlineMs: ONLINE_MS, contact: VENDOR_CONTACT, updates: currentVersions(), uploadReady: UPLOAD_TOKEN.length >= 32, server: selfUpdateState() }))
admin.get('/api/self-update', (req, res) => res.json(selfUpdateState()))
admin.post('/api/self-update', (req, res) => {
  try { startSelfUpdate(); res.json(selfUpdateState()) }
  catch (err) { res.status(err.status || 500).json({ message: err.message }) }
})
admin.get('/api/customers', (req, res) => res.json(db.customers.map(view)))

// Ulanmagan serverlar: kaliti yo'q yoki eskirgan — sotuvchi mijozga biriktiradi (.env ga kirish shart emas)
admin.get('/api/pending', (req, res) => {
  const cutoff = Date.now() - PENDING_DAYS * DAY
  for (const [inst, p] of Object.entries(db.pending)) if (new Date(p.lastSeen) < cutoff) delete db.pending[inst]
  res.json(Object.entries(db.pending).map(([instance, p]) => ({ instance, ...p, online: isOnline(p.lastSeen) }))
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)))
})
admin.delete('/api/pending/:instance', (req, res) => {
  delete db.pending[req.params.instance]; saveDb(); res.json({ ok: true })
})

// Serverni mijozga biriktirish — server kutib turgan bo'lsa, shu zahoti kalit va litsenziyani oladi
function bind(c, inst) {
  const p = db.pending[inst]
  if (!p) return false
  c.instances = c.instances || {}
  c.instances[inst] = { lastSeen: p.lastSeen, ip: p.ip, role: p.role, host: p.host, boundAt: new Date().toISOString() }
  if (c.revokedInstances) delete c.revokedInstances[inst]
  delete db.pending[inst]
  logEvent(c, 'bind', `${inst.slice(0, 8).toUpperCase()} ${p.host || ''}`)
  bump(c)
  release('inst:' + inst, c.rev)
  return true
}
admin.post('/api/customers/:id/bind', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  if (!bind(c, String(req.body?.instance || ''))) return res.status(404).json({ message: 'Server topilmadi (ro\'yxatni yangilang)' })
  saveDb(); res.json(view(c))
})

// Serverni mijozdan ajratish: shu zahoti bloklanadi ("Ulanmagan serverlar"ga tushadi — qayta biriktirish mumkin).
// Restoran yangi kompyuterga ko'chganda eski nusxani, yoki ruxsatsiz nusxani o'chirish uchun.
admin.post('/api/customers/:id/unbind', (req, res) => {
  const c = findById(req.params.id)
  const inst = String(req.body?.instance || '')
  if (!c || !c.instances?.[inst]) return res.status(404).json({ message: 'Topilmadi' })
  const i = c.instances[inst]
  delete c.instances[inst]
  c.revokedInstances = { ...(c.revokedInstances || {}), [inst]: new Date().toISOString() }
  logEvent(c, 'unbind', `${inst.slice(0, 8).toUpperCase()} ${i.host || ''}`)
  bump(c); saveDb(); res.json(view(c))
})

// Bitta kassani bloklash / ochish (restoranning qolgan qurilmalari ishlayveradi)
admin.post('/api/customers/:id/node', (req, res) => {
  const c = findById(req.params.id)
  const node = str(req.body?.node, 40)
  if (!c || !node) return res.status(404).json({ message: 'Topilmadi' })
  c.blockedNodes = c.blockedNodes || {}
  if (req.body.blocked) c.blockedNodes[node] = new Date().toISOString()
  else delete c.blockedNodes[node]
  logEvent(c, req.body.blocked ? 'nodeBlock' : 'nodeUnblock', node)
  bump(c); saveDb(); res.json(view(c))
})

// Bitta qurilmani (telefon / ofitsant terminali / kassa oynasi) bloklash / ochish
admin.post('/api/customers/:id/device', (req, res) => {
  const c = findById(req.params.id)
  const device = str(req.body?.device, 64)
  if (!c || !device) return res.status(404).json({ message: 'Topilmadi' })
  c.blockedDevices = c.blockedDevices || {}
  const label = str(req.body?.label, 80)
  if (req.body.blocked) c.blockedDevices[device] = { at: new Date().toISOString(), label }
  else delete c.blockedDevices[device]
  logEvent(c, req.body.blocked ? 'deviceBlock' : 'deviceUnblock', label || device.slice(0, 8))
  bump(c); saveDb(); res.json(view(c))
})

// Restoranga xabar (admin ekranida banner). Bo'sh matn — xabarni olib tashlash.
admin.post('/api/customers/:id/message', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  const text = str(req.body?.text, 300)
  c.message = text ? { id: crypto.randomBytes(4).toString('hex'), text, level: req.body.level === 'warn' ? 'warn' : 'info', at: new Date().toISOString() } : null
  logEvent(c, 'message', text || "olib tashlandi")
  bump(c); saveDb(); res.json(view(c))
})

// Masofaviy buyruq: resync (kassa hamma ma'lumotni qaytadan oladi) yoki restart. node — kassa ID yoki 'cloud'.
admin.post('/api/customers/:id/command', (req, res) => {
  const c = findById(req.params.id)
  const type = String(req.body?.type || '')
  const node = str(req.body?.node, 40)
  if (!c || !node) return res.status(404).json({ message: 'Topilmadi' })
  if (!['resync', 'restart'].includes(type)) return res.status(400).json({ message: 'Noma\'lum buyruq' })
  const cmd = { id: crypto.randomBytes(5).toString('hex'), type, node, at: new Date().toISOString() }
  c.commands = [...(c.commands || []), cmd].slice(-20)
  logEvent(c, 'command', `${type} → ${node}`)
  bump(c); saveDb(); res.json(view(c))
})

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
  logEvent(c, 'create', trialDays ? `${trialDays} kun sinov` : '')
  db.customers.push(c)
  if (req.body.instance) bind(c, String(req.body.instance))   // "Yangi mijoz" — ulanmagan serverdan
  saveDb()
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
    if (d.toISOString().slice(0, 10) !== String(c.paidUntil).slice(0, 10)) logEvent(c, 'paidUntil', d.toISOString().slice(0, 10))
    c.paidUntil = d.toISOString()
  }
  if (['soft', 'hard'].includes(req.body.blockMode) && req.body.blockMode !== blockModeOf(c)) {
    c.blockMode = req.body.blockMode
    logEvent(c, 'blockMode', c.blockMode)
  }
  // Muhlat: bo'sh — umumiy (GRACE_DAYS), 0 — muddat tugashi bilan blok
  if (req.body.graceDays !== undefined) {
    const g = String(req.body.graceDays).trim()
    c.graceDays = g === '' ? undefined : Math.min(30, Math.max(0, parseInt(g, 10) || 0))
  }
  // Internetsiz ishlash: bo'sh — umumiy (OFFLINE_DAYS)
  if (req.body.offlineDays !== undefined) {
    const o = String(req.body.offlineDays).trim()
    c.offlineDays = o === '' ? undefined : Math.min(30, Math.max(1, parseInt(o, 10) || 1))
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
  logEvent(c, 'pay', `${months} oy · ${c.payments.at(-1).amount} so'm → ${c.paidUntil.slice(0, 10)}`)
  bump(c); saveDb(); res.json(view(c))
})

admin.post('/api/customers/:id/suspend', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  c.status = 'suspended'; c.suspendedAt = new Date().toISOString()
  // Tanlangan bloklash turi saqlanadi (muddat o'tganda ham shu ishlatiladi)
  if (['soft', 'hard'].includes(req.body?.mode)) c.blockMode = req.body.mode
  logEvent(c, 'suspend', [blockModeOf(c) === 'hard' ? "to'liq" : 'yumshoq', str(req.body?.reason, 150)].filter(Boolean).join(' · '))
  bump(c); saveDb(); res.json(view(c))
})
admin.post('/api/customers/:id/activate', (req, res) => {
  const c = findById(req.params.id)
  if (!c) return res.status(404).json({ message: 'Topilmadi' })
  c.status = 'active'
  logEvent(c, 'activate')
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

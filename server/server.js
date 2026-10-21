// Bir VPS'da bir nechta restoran: har biri o'z .env fayli bilan (pm2 ... -- --env=/etc/restopro/<nom>.env).
// Bunda server/.env umuman o'qilmaydi — boshqa restoranning sozlamasi aralashmasin.
const ENV_ARG = process.argv.find(a => a.startsWith('--env='))
require('dotenv').config(ENV_ARG ? { path: ENV_ARG.slice(6) } : undefined)
const { JWT_SECRET } = require('./config')   // JWT_SECRET yo'q bo'lsa server to'xtaydi
require('./sync/plugin')                     // modellardan OLDIN: har yozuvga sync belgisi
const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const mongoose   = require('mongoose')
const cors       = require('cors')
const path       = require('path')
const fs         = require('fs')
const crypto     = require('crypto')
const jwt        = require('jsonwebtoken')
const User       = require('./models/User')
const sessions   = require('./utils/sessions')   // Session modelini ham yuklaydi (sync migrate'dan oldin)
const syncEngine = require('./sync/engine')
const syncClient = require('./sync/client')
const license    = require('./license')

const app    = express()
const server = http.createServer(app)

// Nginx orqasida req.ip haqiqiy mijoz IP'si bo'lishi uchun (login cheklovi)
app.set('trust proxy', 'loopback')
app.disable('x-powered-by')

// ── uploads papkasini yaratish ─────────────────────────────────
const { UPLOAD_DIR } = require('./config')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  console.log('📁 uploads/ papkasi yaratildi')
}

// ── CORS ───────────────────────────────────────────────────────
const ALLOWED = process.env.CLIENT_URL?.split(',').map(s => s.trim()) || []
// ngrok/cloudflare tunnellari faqat ishlab chiqishda: ALLOW_TUNNELS=true
const ALLOW_TUNNELS = process.env.ALLOW_TUNNELS === 'true'
// Kassa (Electron) rejimi: restoran Wi-Fi'sidagi telefonlar http://192.168.x.x:PORT orqali kiradi
const ALLOW_LAN = process.env.ALLOW_LAN === 'true'
const PRIVATE_HOST = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/
const corsOrigin = (origin, cb) => {
  // browser bo'lmagan so'rovlar (curl, Postman) yoki ngrok proxy (no Origin)
  if (!origin) return cb(null, true)
  if (ALLOWED.includes('*')) return cb(null, true)
  if (ALLOWED.includes(origin)) return cb(null, true)
  // Tunnel hostlari (ngrok, cloudflare)
  if (ALLOW_TUNNELS && /\.ngrok-free\.app$|\.ngrok-free\.dev$|\.ngrok\.app$|\.ngrok\.io$|\.trycloudflare\.com$/.test(new URL(origin).hostname)) {
    return cb(null, true)
  }
  if (ALLOW_LAN && PRIVATE_HOST.test(new URL(origin).hostname)) return cb(null, true)
  // Localhost har qanday port
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
    return cb(null, true)
  }
  cb(Object.assign(new Error('CORS blocked: ' + origin), { status: 403 }))
}

// ── Socket.IO ──────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
})
app.set('io', io)

// Socket faqat tizimga kirgan va faol foydalanuvchilar uchun
io.use(async (socket, next) => {
  try {
    const payload = jwt.verify(socket.handshake.auth?.token || '', JWT_SECRET)
    const user = await User.findById(payload._id).select('role isActive name')
    if (!user || !user.isActive) return next(new Error('unauthorized'))
    if (user.role !== 'admin' && (await require('./utils/settingsCache').get()).staffAccessEnabled === false)
      return next(new Error('unauthorized'))
    if (user.role !== 'admin') {
      const session = await sessions.getSession(user._id)
      if (!sessions.sessionValid(user.role, session, payload.sid)) return next(new Error('unauthorized'))
      if (session) await sessions.touchSession(user._id, payload.sid, session)
    }
    socket.data.user = { _id: user._id, role: user.role }
    socket.data.sid  = payload.sid
    // Statistika uchun: qaysi ilova (kassa / terminal / brauzer) va qaysi qurilma
    const { app: kind, device, ver, upd, updErr } = socket.handshake.auth || {}
    socket.data.app    = ['kassa', 'terminal'].includes(kind) ? kind : 'web'
    socket.data.device = String(device || '').slice(0, 64) || socket.id
    // Sotuvchi shu qurilmani bloklagan
    if (license.deviceBlocked(socket.data.device)) return next(new Error('device_blocked'))
    require('./utils/devices').touch(device, {
      app: socket.data.app, user: user.name, role: user.role, ip: socket.handshake.address, ua: socket.handshake.headers['user-agent'],
      ver, upd, updErr,   // kassa / terminal ilovasi versiyasi va yangilanish holati
    }).catch(() => {})
    socket.join(`user:${user._id}`)   // sessiya yopilsa — shu xona orqali chiqariladi
    next()
  } catch {
    next(new Error('unauthorized'))
  }
})

// Ulanib turgan ofitsant qurilmasi faol hisoblanadi (boshqa qurilmadan kirib bo'lmaydi)
sessions.startHeartbeat(io)

// Litsenziya: holat o'zgarsa (sotuvchi to'xtatdi / faollashtirdi) — barcha ekranlar shu zahoti biladi
license.onChange(async s => {
  io.emit('license', s)
  // Sotuvchi bloklagan qurilmalar — ochiq ekranlari shu zahoti yopiladi
  for (const sock of await io.fetchSockets()) {
    if (license.deviceBlocked(sock.data.device)) { sock.emit('deviceBlocked'); sock.disconnect(true) }
  }
})
// Sotuvchi panelida ko'rinadigan holat: cloud o'zi va kassalari haqida, kassa/lokal server — o'zi haqida
{
  const stats = require('./license/stats')
  const isCloud = !!process.env.SYNC_KEY && !process.env.SYNC_URL
  // Cloud: kassani ulash ma'lumotlari ham (manzil + SYNC_KEY) — sotuvchi litsenziya panelidan
  // nusxalab oladi, VPS'ga kirib .env qidirish shart emas
  license.setStatsProvider(async () => (isCloud
    ? { ...(await stats.report(io)), sync: publicUrl ? { url: publicUrl, key: process.env.SYNC_KEY } : undefined }
    : { ...(await stats.localStats(io)), health: { ...syncClient.health(), license: license.status().state, lastCmd: license.lastCommand() } }))
  // Sotuvchining masofaviy buyruqlari
  license.onCommand(async type => {
    if (type === 'resync') await syncClient.resync(io)
    if (type === 'restart') setTimeout(() => process.exit(0), 500)   // kassa ilovasi / pm2 qayta ochadi
    if (type === 'update') io.emit('appUpdateCheck')                 // kassa / terminal ilovalari hozir tekshiradi
  })
}

io.on('connection', socket => {
  console.log(`🔌 Socket ulandi: ${socket.id}`)
  socket.on('disconnect', () => console.log(`🔌 Socket uzildi: ${socket.id}`))
})

// Serverning ochiq manzili (https://cafe.example.uz) — kelgan so'rovlardan aniqlanadi (nginx orqali).
// Litsenziya panelida "Kassani ulash" uchun. PUBLIC_URL bilan aniq berish ham mumkin.
let publicUrl = (process.env.PUBLIC_URL || '').replace(/\/+$/, '')
const LOCAL_HOST = /^(localhost|127\.|\[::1\]|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/
app.use((req, res, next) => {
  if (!publicUrl) {
    const host = req.get('x-forwarded-host') || req.get('host') || ''
    if (host && !LOCAL_HOST.test(host) && !/^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host))
      publicUrl = `${req.get('x-forwarded-proto') || 'https'}://${host}`   // domen — odatda nginx'da HTTPS
  }
  next()
})

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))

// ── Static uploads — absolute yo'l bilan ───────────────────────
// Bu eng muhim tuzatish: path.join ishlatib absolute yo'l beramiz
// nosniff + CSP: yuklangan fayl hech qachon sahifa/skript sifatida ishlamasin
app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders: res => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
  },
}))

// ── Sync ───────────────────────────────────────────────────────
// Kassa rejimi (SYNC_URL bor): birinchi sinxronlashgacha API yopiq.
// Cloud rejimi (SYNC_KEY bor, SYNC_URL yo'q): kassalar uchun /api/sync/*.
app.use(syncClient.requireInitialized)
app.get('/api/sync/status', (req, res) => res.json(syncClient.publicStatus()))

// ── Litsenziya (oylik obuna) ───────────────────────────────────
// To'lov muddati + muhlat o'tsa yoki sotuvchi to'xtatsa — API 402 qaytaradi
app.use('/api/license', license.router)
app.use(license.requireLicense)

// Kassalar uchun /api/sync/* — litsenziya tekshiruvidan KEYIN: bloklangan cloud kassalar bilan
// ma'lumot almashmaydi (faqat /api/sync/license va /ping ochiq — kassa holatni bilishi uchun)
if (process.env.SYNC_KEY && !process.env.SYNC_URL) app.use('/api/sync', require('./routes/sync'))

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'))
app.use('/api/users',       require('./routes/users'))
app.use('/api/products',    require('./routes/products'))
app.use('/api/categories',  require('./routes/categories'))
app.use('/api/ingredients', require('./routes/ingredients'))
app.use('/api/orders',      require('./routes/orders'))
app.use('/api/tables',      require('./routes/tables'))
app.use('/api/salaries',    require('./routes/salaries'))
app.use('/api/settings',    require('./routes/settings'))
app.use('/api/reservations', require('./routes/reservations'))
app.use('/api/print',        require('./routes/print'))
app.use('/api/sync-notices', require('./routes/syncNotices'))
const guestRoutes = require('./routes/guest')
app.use('/api/guest',        guestRoutes.guest)
app.use('/api/guest-orders', guestRoutes.staff)

// ── Health check ───────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }))

// ── Frontend (kassa/LAN rejimi: nginx'siz, ofitsant telefonlari shu yerdan ochadi) ──
if (process.env.SERVE_FRONTEND) {
  const DIST = path.resolve(process.env.SERVE_FRONTEND)
  app.use(express.static(DIST, { index: false }))
  app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

// ── 404 handler ────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Route topilmadi: ${req.method} ${req.path}` }))

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server xatosi:', err.message)
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500)
  // 500 xatolarda ichki tafsilotlar mijozga ko'rsatilmaydi
  res.status(status).json({ message: status < 500 ? err.message : 'Server xatosi' })
})

// ── MongoDB + start ────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/restopro')
  .then(async () => {
    console.log('✅ MongoDB ulandi')
    await syncEngine.migrate()
    // Cloud / lokal server: eski o'chirish belgilarini kuniga bir marta tozalash (kassa o'zinikini client.js da)
    if (!process.env.SYNC_URL) {
      const purge = () => syncEngine.purgeTombstonesHub()
        .then(n => n && console.log(`🧹 sync: ${n} ta eski o'chirish belgisi tozalandi`)).catch(() => {})
      purge(); setInterval(purge, 86400000).unref()
    }
    // Kassada admin va sozlamalar cloud'dan keladi — lokal yaratilsa to'qnashadi
    if (!process.env.SYNC_URL) await seedAdmin()
    if (!process.env.SYNC_URL) await require('./routes/categories').seedFromProducts()
      .catch(err => console.error('❌ bo\'limlar:', err.message))
    await license.start().catch(err => console.error('❌ litsenziya:', err.message))
    await require('./print').start().catch(err => console.error('❌ printer:', err.message))
    const PORT = process.env.PORT || 5000
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server: http://localhost:${PORT}`)
      console.log(`📁 Uploads: ${UPLOAD_DIR}`)
      syncClient.start(io).catch(err => console.error('❌ sync:', err.message))
    })
  })
  .catch(err => { console.error('❌ MongoDB xatosi:', err.message); process.exit(1) })

// ── Default admin yaratish ─────────────────────────────────────
// Parol ADMIN_PASSWORD dan olinadi, bo'lmasa tasodifiy yaratilib konsolga
// bir marta chiqariladi. Birinchi kirishda parolni almashtirish majburiy.
async function seedAdmin() {
  try {
    const bcrypt = require('bcryptjs')
    const exists = await User.findOne({ username: 'admin' })
    if (!exists) {
      const anyAdmin = await User.exists({ role: 'admin' })
      if (!anyAdmin) {
        const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url')
        const hashed = await bcrypt.hash(password, 10)
        await User.create({ name: 'Bosh Admin', username: 'admin', password: hashed, role: 'admin', mustChangePassword: true })
        console.log('👤 Admin yaratildi. Login: admin  Parol: ' + (process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD dan)' : password))
        console.log('   Birinchi kirishda parolni almashtirish so\'raladi.')
      }
    } else if (!exists.mustChangePassword && await bcrypt.compare('admin123', exists.password)) {
      // Eski o'rnatmalar: standart parol hali almashtirilmagan
      exists.mustChangePassword = true
      await exists.save()
      console.warn('⚠️  admin hali standart parolda — keyingi kirishda almashtirish majburiy.')
    }
    const Settings = require('./models/Settings')
    const s = await Settings.findById('main')
    if (!s) await Settings.create({ _id: 'main' })
  } catch (err) { console.error('Seed xatosi:', err.message) }
}

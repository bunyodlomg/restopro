require('dotenv').config()
const { JWT_SECRET } = require('./config')   // JWT_SECRET yo'q bo'lsa server to'xtaydi
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

const app    = express()
const server = http.createServer(app)

// Nginx orqasida req.ip haqiqiy mijoz IP'si bo'lishi uchun (login cheklovi)
app.set('trust proxy', 'loopback')
app.disable('x-powered-by')

// ── uploads papkasini yaratish ─────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  console.log('📁 uploads/ papkasi yaratildi')
}

// ── CORS ───────────────────────────────────────────────────────
const ALLOWED = process.env.CLIENT_URL?.split(',').map(s => s.trim()) || []
// ngrok/cloudflare tunnellari faqat ishlab chiqishda: ALLOW_TUNNELS=true
const ALLOW_TUNNELS = process.env.ALLOW_TUNNELS === 'true'
const corsOrigin = (origin, cb) => {
  // browser bo'lmagan so'rovlar (curl, Postman) yoki ngrok proxy (no Origin)
  if (!origin) return cb(null, true)
  if (ALLOWED.includes('*')) return cb(null, true)
  if (ALLOWED.includes(origin)) return cb(null, true)
  // Tunnel hostlari (ngrok, cloudflare)
  if (ALLOW_TUNNELS && /\.ngrok-free\.app$|\.ngrok-free\.dev$|\.ngrok\.app$|\.ngrok\.io$|\.trycloudflare\.com$/.test(new URL(origin).hostname)) {
    return cb(null, true)
  }
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
    const user = await User.findById(payload._id).select('role isActive')
    if (!user || !user.isActive) return next(new Error('unauthorized'))
    socket.data.user = { _id: user._id, role: user.role }
    next()
  } catch {
    next(new Error('unauthorized'))
  }
})

io.on('connection', socket => {
  console.log(`🔌 Socket ulandi: ${socket.id}`)
  socket.on('disconnect', () => console.log(`🔌 Socket uzildi: ${socket.id}`))
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

// ── Routes ─────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'))
app.use('/api/users',       require('./routes/users'))
app.use('/api/products',    require('./routes/products'))
app.use('/api/ingredients', require('./routes/ingredients'))
app.use('/api/orders',      require('./routes/orders'))
app.use('/api/tables',      require('./routes/tables'))
app.use('/api/salaries',    require('./routes/salaries'))
app.use('/api/settings',    require('./routes/settings'))

// ── Health check ───────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }))

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
    await seedAdmin()
    const PORT = process.env.PORT || 5000
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server: http://localhost:${PORT}`)
      console.log(`📁 Uploads: ${UPLOAD_DIR}`)
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

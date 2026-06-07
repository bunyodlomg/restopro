require('dotenv').config()
const express    = require('express')
const http       = require('http')
const { Server } = require('socket.io')
const mongoose   = require('mongoose')
const cors       = require('cors')
const path       = require('path')
const fs         = require('fs')

const app    = express()
const server = http.createServer(app)

// ── uploads papkasini yaratish ─────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  console.log('📁 uploads/ papkasi yaratildi')
}

// ── CORS — ngrok/tunnel hostlariga ham ruxsat ──────────────────
const ALLOWED = process.env.CLIENT_URL?.split(',').map(s => s.trim()) || []
const corsOrigin = (origin, cb) => {
  // browser bo'lmagan so'rovlar (curl, Postman) yoki ngrok proxy (no Origin)
  if (!origin) return cb(null, true)
  if (ALLOWED.includes('*')) return cb(null, true)
  if (ALLOWED.includes(origin)) return cb(null, true)
  // Tunnel hostlari (ngrok, cloudflare)
  if (/\.ngrok-free\.app$|\.ngrok-free\.dev$|\.ngrok\.app$|\.ngrok\.io$|\.trycloudflare\.com$/.test(new URL(origin).hostname)) {
    return cb(null, true)
  }
  // Localhost har qanday port
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
    return cb(null, true)
  }
  cb(new Error('CORS blocked: ' + origin))
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

io.on('connection', socket => {
  console.log(`🔌 Socket ulandi: ${socket.id}`)
  socket.on('disconnect', () => console.log(`🔌 Socket uzildi: ${socket.id}`))
})

// ── Middleware ─────────────────────────────────────────────────
app.use(cors({ origin: corsOrigin, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Static uploads — absolute yo'l bilan ───────────────────────
// Bu eng muhim tuzatish: path.join ishlatib absolute yo'l beramiz
app.use('/uploads', express.static(UPLOAD_DIR))

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
app.get('/health', (req, res) => res.json({
  status: 'ok',
  time: new Date(),
  uploadsDir: UPLOAD_DIR,
  uploadsDirExists: fs.existsSync(UPLOAD_DIR),
}))

// ── 404 handler ────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: `Route topilmadi: ${req.method} ${req.path}` }))

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Server xatosi:', err.message)
  res.status(err.status || 500).json({ message: err.message || 'Server xatosi' })
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
async function seedAdmin() {
  try {
    const User   = require('./models/User')
    const bcrypt = require('bcryptjs')
    const exists = await User.findOne({ username: 'admin' })
    if (!exists) {
      const hashed = await bcrypt.hash('admin123', 10)
      await User.create({ name: 'Bosh Admin', username: 'admin', password: hashed, role: 'admin' })
      console.log('👤 Default admin yaratildi: admin / admin123')
    }
    const Settings = require('./models/Settings')
    const s = await Settings.findById('main')
    if (!s) await Settings.create({ _id: 'main' })
  } catch (err) { console.error('Seed xatosi:', err.message) }
}

const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const User    = require('../models/User')
const auth    = require('../middleware/auth')
const limiter = require('../middleware/loginLimiter')
const crypto  = require('crypto')
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config')
const settingsCache = require('../utils/settingsCache')
const { isOnPremise } = require('../utils/onPremise')
const { STAFF_OFF } = require('../middleware/auth')

const pinHashOf = (salt, pin) => crypto.createHash('sha256').update(salt + ':' + pin).digest('hex')

// Muvaffaqiyatli kirish javobi (login va PIN uchun bir xil)
function issue(res, user) {
  const token = jwt.sign({ _id: user._id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
  res.json({
    token,
    user: {
      _id: user._id, name: user.name, username: user.username, role: user.role, phone: user.phone,
      mustChangePassword: !!user.mustChangePassword,
    },
  })
}

// PIN urinishlari: IP bo'yicha 5 ta xato → 5 daqiqa blok (4 raqam = 10 000 variant)
const pinFails = new Map()
setInterval(() => { const now = Date.now(); for (const [k, r] of pinFails) if (r.until < now && now - r.first > 300000) pinFails.delete(k) }, 600000).unref()

const MIN_PASSWORD = 6

// POST /api/auth/login
router.post('/login', limiter.check, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password)
      return res.status(400).json({ message: 'Login va parol kiritilishi shart' })

    const user = await User.findOne({ username: username.toLowerCase().trim() })
    const match = user && await bcrypt.compare(password, user.password)
    if (!match) {
      limiter.fail(req)
      return res.status(401).json({ message: 'Login yoki parol noto\'g\'ri' })
    }
    limiter.success(req)

    if (!user.isActive)
      return res.status(403).json({ message: 'Akkaunt bloklangan. Adminga murojaat qiling.' })
    if (user.role !== 'admin' && (await settingsCache.get()).staffAccessEnabled === false)
      return res.status(403).json({ message: STAFF_OFF })

    issue(res, user)
  } catch (err) {
    console.error('Login xatosi:', err)
    res.status(500).json({ message: 'Server xatosi' })
  }
})

// GET /api/auth/pin-available — PIN bilan kirish shu qurilmadan mumkinmi (restoran tarmog'i)
router.get('/pin-available', async (req, res) => {
  try { res.json({ available: await isOnPremise(req) }) }
  catch { res.json({ available: false }) }
})

// POST /api/auth/pin — monoblokda 4 raqamli PIN bilan kirish (faqat restoran ichidan)
router.post('/pin', async (req, res) => {
  try {
    if (!(await isOnPremise(req)))
      return res.status(403).json({ message: 'PIN bilan kirish faqat restoran tarmog\'idan mumkin' })
    const key = 'pin|' + req.ip
    const rec = pinFails.get(key)
    if (rec?.until > Date.now())
      return res.status(429).json({ message: `Juda ko'p xato. ${Math.ceil((rec.until - Date.now()) / 60000)} daqiqadan keyin urining.` })

    const pin = String(req.body?.pin || '')
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ message: 'PIN 4 ta raqamdan iborat' })

    const users = await User.find({ pinHash: { $ne: '' }, isActive: true })
    const user = users.find(u => u.pinHash?.length === 64 && crypto.timingSafeEqual(Buffer.from(pinHashOf(u.pinSalt, pin)), Buffer.from(u.pinHash)))
    if (!user) {
      const r = rec && Date.now() - rec.first < 300000 ? rec : { n: 0, first: Date.now(), until: 0 }
      r.n += 1
      if (r.n >= 5) { r.until = Date.now() + 300000; r.n = 0; r.first = Date.now() }
      pinFails.set(key, r)
      return res.status(401).json({ message: 'PIN noto\'g\'ri' })
    }
    pinFails.delete(key)
    if (user.role !== 'admin' && (await settingsCache.get()).staffAccessEnabled === false)
      return res.status(403).json({ message: STAFF_OFF })
    issue(res, user)
  } catch (err) {
    console.error('PIN xatosi:', err)
    res.status(500).json({ message: 'Server xatosi' })
  }
})

// GET /api/auth/me  — token tekshirish
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' })
    res.json(user)
  } catch (err) {
    res.status(500).json({ message: 'Server xatosi' })
  }
})

// PUT /api/auth/change-password
router.put('/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body
    if (!oldPassword || !newPassword)
      return res.status(400).json({ message: 'Eski va yangi parol kiritilishi shart' })
    if (String(newPassword).length < MIN_PASSWORD)
      return res.status(400).json({ message: `Yangi parol kamida ${MIN_PASSWORD} belgidan iborat bo'lsin` })
    if (oldPassword === newPassword)
      return res.status(400).json({ message: 'Yangi parol eskisidan farq qilishi kerak' })

    const user = await User.findById(req.user._id)
    const match = await bcrypt.compare(oldPassword, user.password)
    if (!match) return res.status(400).json({ message: 'Eski parol noto\'g\'ri' })
    user.password = await bcrypt.hash(String(newPassword), 10)
    user.mustChangePassword = false
    await user.save()
    res.json({ message: 'Parol o\'zgartirildi' })
  } catch (err) {
    res.status(500).json({ message: 'Server xatosi' })
  }
})

module.exports = router
module.exports.pinHashOf = pinHashOf

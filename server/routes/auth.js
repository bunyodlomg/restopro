const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const User    = require('../models/User')
const auth    = require('../middleware/auth')

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password)
      return res.status(400).json({ message: 'Login va parol kiritilishi shart' })

    const user = await User.findOne({ username: username.toLowerCase().trim() })
    if (!user)
      return res.status(401).json({ message: 'Login yoki parol noto\'g\'ri' })

    if (!user.isActive)
      return res.status(403).json({ message: 'Akkaunt bloklangan. Adminga murojaat qiling.' })

    const match = await bcrypt.compare(password, user.password)
    if (!match)
      return res.status(401).json({ message: 'Login yoki parol noto\'g\'ri' })

    const token = jwt.sign(
      { _id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    )

    res.json({
      token,
      user: {
        _id:      user._id,
        name:     user.name,
        username: user.username,
        role:     user.role,
        phone:    user.phone,
      }
    })
  } catch (err) {
    console.error('Login xatosi:', err)
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
    const user = await User.findById(req.user._id)
    const match = await bcrypt.compare(oldPassword, user.password)
    if (!match) return res.status(400).json({ message: 'Eski parol noto\'g\'ri' })
    user.password = await bcrypt.hash(newPassword, 10)
    await user.save()
    res.json({ message: 'Parol o\'zgartirildi' })
  } catch (err) {
    res.status(500).json({ message: 'Server xatosi' })
  }
})

module.exports = router

const router = require('express').Router()
const bcrypt = require('bcryptjs')
const User   = require('../models/User')
const auth   = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')

// GET /api/users
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 })
    res.json(users)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/users
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, username, password, role, phone, salary } = req.body
    if (!name || !username || !password)
      return res.status(400).json({ message: 'Ism, username va parol majburiy' })

    const exists = await User.findOne({ username: username.toLowerCase().trim() })
    if (exists) return res.status(400).json({ message: 'Bu username band' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name, username: username.toLowerCase().trim(),
      password: hashed, role: role || 'waiter',
      phone: phone || '', salary: salary || 0,
    })
    res.status(201).json(user)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server xatosi' })
  }
})

// PUT /api/users/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { password, ...rest } = req.body
    const update = { ...rest }
    if (password) update.password = await bcrypt.hash(password, 10)
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!user) return res.status(404).json({ message: 'Topilmadi' })
    res.json(user)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// DELETE /api/users/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ message: 'O\'zingizni o\'chira olmaysiz' })
    await User.findByIdAndDelete(req.params.id)
    res.json({ message: 'O\'chirildi' })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

module.exports = router

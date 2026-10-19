const router = require('express').Router()
const bcrypt = require('bcryptjs')
const User   = require('../models/User')
const auth   = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const crypto = require('crypto')
const { pinHashOf } = require('./auth')

// PIN: 4 raqam, xodimlar orasida takrorlanmas. '' → PIN o'chiriladi
async function pinUpdate(pin, userId) {
  if (pin === undefined) return {}
  pin = String(pin)
  if (pin === '') return { pinHash: '', pinSalt: '' }
  if (!/^\d{4}$/.test(pin)) throw Object.assign(new Error('PIN 4 ta raqamdan iborat bo\'lsin'), { status: 400 })
  if (['0000', '1111', '1234', '4321'].includes(pin)) throw Object.assign(new Error('Juda oddiy PIN — boshqasini tanlang'), { status: 400 })
  const others = await User.find({ pinHash: { $ne: '' }, _id: { $ne: userId } }).select('pinHash pinSalt')
  if (others.some(u => u.pinHash && pinHashOf(u.pinSalt, pin) === u.pinHash))
    throw Object.assign(new Error('Bu PIN boshqa xodimda bor — boshqasini tanlang'), { status: 400 })
  const pinSalt = crypto.randomBytes(8).toString('hex')
  return { pinSalt, pinHash: pinHashOf(pinSalt, pin) }
}

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
    const { name, username, password, role, phone, salary, pin } = req.body
    if (!name || !username || !password)
      return res.status(400).json({ message: 'Ism, username va parol majburiy' })
    if (String(password).length < 6)
      return res.status(400).json({ message: 'Parol kamida 6 belgidan iborat bo\'lsin' })
    if (role && !['admin', 'waiter'].includes(role))
      return res.status(400).json({ message: 'Noto\'g\'ri rol' })

    const exists = await User.findOne({ username: username.toLowerCase().trim() })
    if (exists) return res.status(400).json({ message: 'Bu username band' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name, username: username.toLowerCase().trim(),
      password: hashed, role: role || 'waiter',
      phone: phone || '', salary: salary || 0,
      ...(await pinUpdate(pin || undefined, null)),
    })
    res.status(201).json(user)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message })
    console.error(err)
    res.status(500).json({ message: 'Server xatosi' })
  }
})

// PUT /api/users/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, username, password, role, phone, salary, isActive, pin } = req.body
    const isSelf = req.params.id === req.user._id.toString()

    // Faqat ruxsat etilgan maydonlar yangilanadi
    const update = {}
    if (name     !== undefined) update.name     = String(name).trim()
    if (phone    !== undefined) update.phone    = String(phone)
    if (salary   !== undefined) update.salary   = +salary || 0
    if (username !== undefined) {
      update.username = String(username).toLowerCase().trim()
      const taken = await User.findOne({ username: update.username, _id: { $ne: req.params.id } })
      if (taken) return res.status(400).json({ message: 'Bu username band' })
    }
    if (role !== undefined) {
      if (!['admin', 'waiter'].includes(role)) return res.status(400).json({ message: 'Noto\'g\'ri rol' })
      if (isSelf && role !== 'admin') return res.status(400).json({ message: 'O\'zingizni admin rolidan chiqara olmaysiz' })
      update.role = role
    }
    if (isActive !== undefined) {
      if (isSelf && !isActive) return res.status(400).json({ message: 'O\'zingizni bloklay olmaysiz' })
      update.isActive = !!isActive
    }
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ message: 'Parol kamida 6 belgidan iborat bo\'lsin' })
      update.password = await bcrypt.hash(String(password), 10)
    }
    Object.assign(update, await pinUpdate(pin, req.params.id))
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
    if (!user) return res.status(404).json({ message: 'Topilmadi' })
    res.json(user)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message })
    res.status(500).json({ message: 'Server xatosi' })
  }
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

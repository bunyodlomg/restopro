const router = require('express').Router()
const Salary = require('../models/Salary')
const User   = require('../models/User')
const auth   = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')

// GET /api/salaries
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { month, userId } = req.query
    const filter = {}
    if (month)  filter.month  = month
    if (userId) filter.userId = userId
    const salaries = await Salary.find(filter)
      .populate('userId', 'name username role salary')
      .populate('paidBy', 'name')
      .sort({ paidAt: -1 })
    res.json(salaries)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// GET /api/salaries/users-summary — oylik xodimlar summasi (accordion uchun)
router.get('/users-summary', auth, adminOnly, async (req, res) => {
  try {
    const { month } = req.query
    const currentMonth = month || new Date().toISOString().slice(0, 7)
    const users    = await User.find({ role: 'waiter', isActive: true })
    const salaries = await Salary.find({ month: currentMonth })

    const summary = users.map(u => {
      const paid = salaries.filter(s => s.userId?.toString() === u._id.toString())
      const totalPaid = paid.reduce((s, p) => s + p.amount, 0)
      return {
        _id:        u._id,
        name:       u.name,
        username:   u.username,
        baseSalary: u.salary || 0,
        totalPaid,
        remaining:  Math.max(0, (u.salary || 0) - totalPaid),
        payments:   paid,
      }
    })
    res.json(summary)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/salaries
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { userId, amount, month, note } = req.body
    if (!userId || !amount) return res.status(400).json({ message: 'Xodim va miqdor majburiy' })

    const user = await User.findById(userId)
    if (!user) return res.status(404).json({ message: 'Xodim topilmadi' })

    const currentMonth = month || new Date().toISOString().slice(0, 7)

    // Oylik limitni tekshirish
    const existing = await Salary.find({ userId, month: currentMonth })
    const alreadyPaid = existing.reduce((s, p) => s + p.amount, 0)
    if (user.salary && alreadyPaid + (+amount) > user.salary) {
      // Ogohlantirish emas, faqat ma'lumot berish — to'lash ruxsat etiladi
    }

    const salary = await Salary.create({
      userId,
      userName: user.name,
      amount:   +amount,
      month:    currentMonth,
      note:     note || '',
      paidBy:   req.user._id,
      paidAt:   new Date(),
    })

    res.status(201).json(salary)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// DELETE /api/salaries/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await Salary.findByIdAndDelete(req.params.id)
    res.json({ message: "O'chirildi" })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

module.exports = router

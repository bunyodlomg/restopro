// ── Qarzdor mijozlar ────────────────────────────────────────────
const router   = require('express').Router()
const { isValidObjectId } = require('mongoose')
const Customer = require('../models/Customer')
const DebtTx   = require('../models/DebtTx')
const auth     = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const debts    = require('../utils/debts')

const text = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)
const by = req => req.user?.name || ''
const bad = (res, message) => res.status(400).json({ message })

// GET /api/debts/customers?q=&all=1 — qarzdorlar (all=1 — qarzi yo'qlar ham)
router.get('/customers', auth, adminOnly, async (req, res) => {
  try {
    const q = {}
    if (req.query.all !== '1') q.balance = { $gt: 0 }
    const s = text(req.query.q, 60)
    if (s) { const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); q.$or = [{ name: rx }, { phone: rx }] }
    const list = await Customer.find(q).sort({ balance: -1, name: 1 }).limit(500).lean()
    const total = (await Customer.aggregate([{ $match: { balance: { $gt: 0 } } }, { $group: { _id: null, sum: { $sum: '$balance' }, n: { $sum: 1 } } }]))[0]
    res.json({ customers: list, total: total?.sum || 0, count: total?.n || 0 })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/debts/customers — { name, phone, note, debt?, debtNote? } (mavjud qarzdorni qo'lda kiritish)
router.post('/customers', auth, adminOnly, async (req, res) => {
  try {
    const name = text(req.body.name, 80)
    if (!name) return bad(res, 'Mijoz ismini yozing')
    const phone = text(req.body.phone, 30)
    if (phone && await Customer.exists({ phone })) return bad(res, `${phone} raqamli mijoz allaqachon bor`)
    const c = await Customer.create({ name, phone, note: text(req.body.note, 200) })
    const amount = debts.money(req.body.debt)
    if (amount < 0) return bad(res, "Qarz manfiy bo'lishi mumkin emas")
    if (amount > 0) await debts.record(c._id, 'debt', amount, { note: text(req.body.debtNote, 200) || 'Avvalgi qarz', by: by(req) }, req.app.get('io'))
    req.app.get('io').emit('debtsChanged')
    res.status(201).json(await Customer.findById(c._id))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// PUT /api/debts/customers/:id — { name, phone, note } (qarz faqat harakat orqali o'zgaradi)
router.put('/customers/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const set = {}
    if (req.body.name !== undefined) { set.name = text(req.body.name, 80); if (!set.name) return bad(res, 'Mijoz ismini yozing') }
    if (req.body.phone !== undefined) set.phone = text(req.body.phone, 30)
    if (req.body.note !== undefined) set.note = text(req.body.note, 200)
    const c = await Customer.findByIdAndUpdate(req.params.id, { $set: set }, { new: true })
    if (!c) return res.status(404).json({ message: 'Topilmadi' })
    req.app.get('io').emit('debtsChanged')
    res.json(c)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// DELETE /api/debts/customers/:id — faqat qarzi yo'q mijoz
router.delete('/customers/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const c = await Customer.findById(req.params.id)
    if (!c) return res.status(404).json({ message: 'Topilmadi' })
    if (c.balance > 0) return bad(res, `${c.name}ning ${debts.money(c.balance).toLocaleString('ru-RU')} so'm qarzi bor — avval to'lovni qabul qiling`)
    await Customer.deleteOne({ _id: c._id })
    req.app.get('io').emit('debtsChanged')
    res.json({ message: "O'chirildi" })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// GET /api/debts/customers/:id/tx — harakatlar tarixi
router.get('/customers/:id/tx', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    res.json(await DebtTx.find({ customerId: req.params.id }).sort({ createdAt: -1 }).limit(300).lean())
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/debts/customers/:id/debt — qarz qo'shish { amount, note }
// POST /api/debts/customers/:id/pay  — to'lov qabul qilish { amount, note } (qarzdan ko'p emas)
for (const [path, type] of [['debt', 'debt'], ['pay', 'payment']]) {
  router.post(`/customers/:id/${path}`, auth, adminOnly, async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
      const amount = debts.money(req.body.amount)
      if (!(amount > 0)) return bad(res, 'Summani kiriting')
      if (type === 'payment') {
        const c = await Customer.findById(req.params.id).lean()
        if (!c) return res.status(404).json({ message: 'Topilmadi' })
        if (amount > c.balance) return bad(res, `Qarzi ${debts.money(c.balance).toLocaleString('ru-RU')} so'm — undan ko'p to'lov qabul qilinmaydi`)
      }
      const r = await debts.record(req.params.id, type, amount, { note: text(req.body.note, 200), by: by(req) }, req.app.get('io'))
      if (!r) return res.status(404).json({ message: 'Topilmadi' })
      res.status(201).json(r)
    } catch (err) { res.status(500).json({ message: err.message }) }
  })
}

module.exports = router

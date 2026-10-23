const router = require('express').Router()
const Table  = require('../models/Table')
const auth   = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const Settings = require('../models/Settings')
const { sectionsOf } = require('../utils/sections')

// GET /api/tables
router.get('/', auth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.category) filter.category = req.query.category
    const tables = await Table.find(filter).sort({ number: 1 })
    res.json(tables)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// GET /api/tables/qr — QR kodlar uchun: har stolga kalit (bo'lmasa yaratiladi) va mumkin bo'lgan manzillar
router.get('/qr', auth, adminOnly, async (req, res) => {
  try {
    const crypto = require('crypto')
    const tables = await Table.find({ category: { $ne: 'soboy' } }).sort({ category: 1, number: 1 })
    for (const t of tables) if (!t.qrToken) { t.qrToken = crypto.randomBytes(12).toString('base64url'); await t.save() }
    // Mijoz telefoni ochadigan manzil: kassada LAN IP, cloud'da domen
    const port = process.env.PORT || 5000
    const lan = Object.values(require('os').networkInterfaces()).flat()
      .filter(i => i && i.family === 'IPv4' && !i.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address))
      .map(i => `http://${i.address}:${port}`)
    const domains = (process.env.CLIENT_URL || '').split(',').map(x => x.trim()).filter(x => /^https:\/\//.test(x))
    res.json({
      tables: tables.map(t => ({ _id: t._id, number: t.number, category: t.category, qrToken: t.qrToken })),
      urls: [...new Set([...(process.env.SYNC_URL ? [] : domains), ...lan])],
    })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/tables/:id/qr-reset — QR kodni yangilash (eski QR ishlamay qoladi)
router.post('/:id/qr-reset', auth, adminOnly, async (req, res) => {
  try {
    const t = await Table.findByIdAndUpdate(req.params.id, { qrToken: require('crypto').randomBytes(12).toString('base64url') }, { new: true })
    if (!t) return res.status(404).json({ message: 'Topilmadi' })
    res.json({ _id: t._id, qrToken: t.qrToken })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/tables/bulk — bir nechta stol: { category, from, to } (masalan 1–32). Bor raqamlar o'tkaziladi
router.post('/bulk', auth, adminOnly, async (req, res) => {
  try {
    const { category } = req.body
    const from = Math.round(+req.body.from), to = Math.round(+req.body.to)
    if (!(from >= 1 && to >= from && to <= 9999)) return res.status(400).json({ message: "Raqamlar oralig'i noto'g'ri (1 — 9999)" })
    if (to - from + 1 > 200) return res.status(400).json({ message: 'Bir martada 200 tadan ko\'p stol yaratib bo\'lmaydi' })
    if (category === 'soboy' || !sectionsOf(await Settings.findById('main')).some(s => s.key === category))
      return res.status(400).json({ message: "Bunday bo'lim yo'q" })
    const have = new Set((await Table.find({ category, number: { $gte: from, $lte: to } }).select('number').lean()).map(t => t.number))
    const created = []
    for (let n = from; n <= to; n++) {
      if (have.has(n)) continue
      const t = await Table.create({ number: n, category })
      req.app.get('io').emit('tableCreated', t)
      created.push(t)
    }
    res.status(201).json({ created, skipped: have.size })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/tables
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { category, description } = req.body
    const number = Math.round(+req.body.number)
    if (!category) return res.status(400).json({ message: 'Raqam va kategoriya majburiy' })
    if (!(number >= 1 && number <= 9999)) return res.status(400).json({ message: 'Stol raqami 1 dan 9999 gacha bo\'lishi kerak' })
    if (category !== 'soboy' && !sectionsOf(await Settings.findById('main')).some(s => s.key === category))
      return res.status(400).json({ message: "Bunday bo'lim yo'q" })

    const exists = await Table.findOne({ number, category })
    if (exists) return res.status(400).json({ message: 'Bu raqamdagi stol allaqachon mavjud' })

    const table = await Table.create({ number, category, description })
    req.app.get('io').emit('tableCreated', table)
    res.status(201).json(table)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

// PUT /api/tables/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    // Holat (band/bo'sh) faqat buyurtmalar orqali o'zgaradi
    const update = {}
    if (req.body.number      !== undefined) update.number      = +req.body.number
    if (req.body.description !== undefined) update.description = String(req.body.description).slice(0, 200)
    // Boshqa bo'limga o'tkazish (masalan zal → 2-etaj)
    if (req.body.category !== undefined) {
      if (req.body.category !== 'soboy' && !sectionsOf(await Settings.findById('main')).some(s => s.key === req.body.category))
        return res.status(400).json({ message: "Bunday bo'lim yo'q" })
      update.category = req.body.category
    }
    const num = update.number, cat = update.category
    if (num !== undefined || cat !== undefined) {
      const cur = await Table.findById(req.params.id)
      if (cur && cat !== undefined && cat !== cur.category && cur.status === 'busy')
        return res.status(400).json({ message: "Band stolni boshqa bo'limga o'tkazib bo'lmaydi — avval hisobni yoping" })
      if (cur && await Table.exists({ _id: { $ne: cur._id }, number: num ?? cur.number, category: cat ?? cur.category }))
        return res.status(400).json({ message: "Bu bo'limda shu raqamli stol bor" })
    }
    const table = await Table.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    if (!table) return res.status(404).json({ message: 'Topilmadi' })
    req.app.get('io').emit('tableUpdated', table)
    res.json(table)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// DELETE /api/tables/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const table = await Table.findByIdAndDelete(req.params.id)
    if (!table) return res.status(404).json({ message: 'Topilmadi' })
    req.app.get('io').emit('tableDeleted', req.params.id)
    res.json({ message: 'O\'chirildi' })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

module.exports = router

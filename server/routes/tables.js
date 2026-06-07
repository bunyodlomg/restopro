const router = require('express').Router()
const Table  = require('../models/Table')
const auth   = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')

// GET /api/tables
router.get('/', auth, async (req, res) => {
  try {
    const filter = {}
    if (req.query.category) filter.category = req.query.category
    const tables = await Table.find(filter).sort({ number: 1 })
    res.json(tables)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/tables
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { number, category, description } = req.body
    if (!number || !category) return res.status(400).json({ message: 'Raqam va kategoriya majburiy' })

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
router.put('/:id', auth, async (req, res) => {
  try {
    const table = await Table.findByIdAndUpdate(req.params.id, req.body, { new: true })
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

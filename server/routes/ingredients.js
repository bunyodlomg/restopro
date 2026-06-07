const router     = require('express').Router()
const Ingredient = require('../models/Ingredient')
const Purchase   = require('../models/Purchase')
const auth       = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')

// GET /api/ingredients
router.get('/', auth, async (req, res) => {
  try {
    const list = await Ingredient.find().sort({ name: 1 })
    res.json(list)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// GET /api/ingredients/low — kam qolganlar
router.get('/low', auth, adminOnly, async (req, res) => {
  try {
    const list = await Ingredient.find({ $expr: { $lte: ['$quantity', '$minQty'] } })
    res.json(list)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/ingredients
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, unit, quantity, minQty, price } = req.body
    if (!name) return res.status(400).json({ message: 'Nomi majburiy' })
    const item = await Ingredient.create({ name, unit, quantity, minQty, price })

    // Boshlang'ich zaxira — chiqim sifatida qayd etish
    const qty = +quantity || 0
    const pr  = +price    || 0
    if (qty > 0 && pr > 0) {
      await Purchase.create({
        ingredientId:   item._id,
        ingredientName: item.name,
        quantity:       qty,
        unit:           item.unit,
        unitPrice:      pr,
        totalCost:      Math.round(qty * pr),
        note:           "Boshlang'ich zaxira",
        createdBy:      req.user._id,
      })
    }
    res.status(201).json(item)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/ingredients/:id/restock — ombor to'ldirish (xarid qayd etiladi)
router.post('/:id/restock', auth, adminOnly, async (req, res) => {
  try {
    const qty = +req.body.quantity  || 0
    const pr  = +req.body.unitPrice || 0
    if (qty <= 0) return res.status(400).json({ message: "Miqdor 0 dan katta bo'lishi kerak" })

    const item = await Ingredient.findById(req.params.id)
    if (!item) return res.status(404).json({ message: 'Topilmadi' })

    item.quantity += qty
    if (pr > 0) item.price = pr        // oxirgi xarid narxi saqlanadi
    await item.save()

    const purchase = await Purchase.create({
      ingredientId:   item._id,
      ingredientName: item.name,
      quantity:       qty,
      unit:           item.unit,
      unitPrice:      pr,
      totalCost:      Math.round(qty * pr),
      note:           req.body.note || '',
      createdBy:      req.user._id,
    })
    res.status(201).json({ ingredient: item, purchase })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// PUT /api/ingredients/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const item = await Ingredient.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!item) return res.status(404).json({ message: 'Topilmadi' })
    res.json(item)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// DELETE /api/ingredients/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    await Ingredient.findByIdAndDelete(req.params.id)
    res.json({ message: 'O\'chirildi' })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

module.exports = router

const router     = require('express').Router()
const { isValidObjectId } = require('mongoose')
const Ingredient = require('../models/Ingredient')
const Purchase   = require('../models/Purchase')
const StockMove  = require('../models/StockMove')
const Product    = require('../models/Product')
const auth       = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const stock      = require('../utils/stock')
const { UNITS, norm, convert } = require('../utils/units')

// Qoldiq faqat harakat orqali o'zgaradi (kirim / hisobdan chiqarish / inventarizatsiya / buyurtma sarfi) —
// har o'zgarish StockMove'da iz qoldiradi, xaridlar chiqimga (Purchase) yoziladi.

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : NaN }
const text = (v, max = 200) => String(v ?? '').trim().slice(0, max)
const by = req => req.user?.name || ''
const bad = (res, message) => res.status(400).json({ message })

// GET /api/ingredients
router.get('/', auth, async (req, res) => {
  try {
    const list = await Ingredient.find().sort({ name: 1 }).lean()
    res.json(list.map(i => ({ ...i, unit: norm(i.unit) })))
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// GET /api/ingredients/low — kam qolgan va tugaganlar
router.get('/low', auth, adminOnly, async (req, res) => {
  try {
    const list = await Ingredient.find({ $or: [{ quantity: { $lte: 0 } }, { $expr: { $and: [{ $gt: ['$minQty', 0] }, { $lte: ['$quantity', '$minQty'] }] } }] }).sort({ quantity: 1 }).lean()
    res.json(list)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// GET /api/ingredients/moves?ingredientId=&type=&from=YYYY-MM-DD&to=YYYY-MM-DD — harakatlar tarixi
router.get('/moves', auth, adminOnly, async (req, res) => {
  try {
    const q = {}
    if (isValidObjectId(req.query.ingredientId)) q.ingredientId = req.query.ingredientId
    if (['in', 'out', 'waste', 'adjust'].includes(req.query.type)) q.type = req.query.type
    if (req.query.from || req.query.to) {
      q.createdAt = {}
      if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '')) q.createdAt.$gte = new Date(req.query.from + 'T00:00:00')
      if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) q.createdAt.$lte = new Date(req.query.to + 'T23:59:59.999')
    }
    const limit = Math.min(500, Math.max(1, +req.query.limit || 200))
    res.json(await StockMove.find(q).sort({ createdAt: -1 }).limit(limit).lean())
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/ingredients — { name, unit, minQty, price, quantity?, asPurchase? }
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const name = text(req.body.name, 80)
    const unit = norm(req.body.unit || 'kg')
    if (!name) return bad(res, 'Nomi majburiy')
    if (!UNITS.includes(unit)) return bad(res, "O'lchov birligi noto'g'ri")
    const minQty = Math.max(0, num(req.body.minQty) || 0)
    const price  = Math.max(0, num(req.body.price) || 0)
    const qty    = num(req.body.quantity) || 0
    if (qty < 0) return bad(res, "Qoldiq manfiy bo'lishi mumkin emas")
    if (await Ingredient.exists({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }))
      return bad(res, `«${name}» omborda allaqachon bor`)

    const item = await Ingredient.create({ name, unit, quantity: 0, minQty, price })
    const io = req.app.get('io')
    if (qty > 0) {
      // Boshlang'ich zaxira: xarid bo'lsa — chiqimga; avvaldan bor tovar bo'lsa — faqat inventarizatsiya
      const asPurchase = req.body.asPurchase !== false && String(req.body.asPurchase) !== 'false' && price > 0
      await stock.apply(item._id, qty, { type: asPurchase ? 'in' : 'adjust', unitPrice: price, note: "Boshlang'ich zaxira", by: by(req) }, io)
      if (asPurchase) await Purchase.create({
        ingredientId: item._id, ingredientName: name, quantity: qty, unit, unitPrice: price,
        totalCost: Math.round(qty * price), note: "Boshlang'ich zaxira", createdBy: req.user._id,
      })
    }
    res.status(201).json(await Ingredient.findById(item._id))
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// POST /api/ingredients/:id/restock — kirim (xarid): { quantity, unitPrice | totalCost, note }
router.post('/:id/restock', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const qty = num(req.body.quantity)
    if (!(qty > 0)) return bad(res, "Miqdor 0 dan katta bo'lishi kerak")
    let unitPrice = num(req.body.unitPrice) || 0
    const total = num(req.body.totalCost)
    if (!unitPrice && total > 0) unitPrice = total / qty            // «jami summa» bilan kiritilgan bo'lsa
    if (unitPrice < 0) return bad(res, "Narx manfiy bo'lishi mumkin emas")
    const note = text(req.body.note)

    const item = await stock.restock(req.params.id, qty, unitPrice, { note, by: by(req) }, req.app.get('io'))
    if (!item) return res.status(404).json({ message: 'Topilmadi' })
    const purchase = unitPrice > 0 ? await Purchase.create({
      ingredientId: item._id, ingredientName: item.name, quantity: qty, unit: item.unit, unitPrice: Math.round(unitPrice),
      totalCost: total > 0 ? Math.round(total) : Math.round(qty * unitPrice), note, createdBy: req.user._id,
    }) : null
    res.status(201).json({ ingredient: item, purchase })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/ingredients/:id/writeoff — hisobdan chiqarish (buzildi, to'kildi): { quantity, note }
router.post('/:id/writeoff', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const qty = num(req.body.quantity)
    if (!(qty > 0)) return bad(res, "Miqdor 0 dan katta bo'lishi kerak")
    const item = await stock.apply(req.params.id, -qty, { type: 'waste', note: text(req.body.note) || 'Hisobdan chiqarildi', by: by(req) }, req.app.get('io'))
    if (!item) return res.status(404).json({ message: 'Topilmadi' })
    res.json(item)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/ingredients/:id/count — inventarizatsiya: sanalgan haqiqiy qoldiq { actual, note }
router.post('/:id/count', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const actual = num(req.body.actual)
    if (!(actual >= 0)) return bad(res, "Haqiqiy qoldiqni kiriting (0 yoki undan ko'p)")
    const cur = await Ingredient.findById(req.params.id).lean()
    if (!cur) return res.status(404).json({ message: 'Topilmadi' })
    const diff = Math.round((actual - cur.quantity) * 1e6) / 1e6
    if (!diff) return res.json(cur)
    const item = await stock.apply(cur._id, diff, { type: 'adjust', note: text(req.body.note) || 'Inventarizatsiya', by: by(req) }, req.app.get('io'))
    res.json(item)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// PUT /api/ingredients/:id — nomi, birligi, minimum, narxi. Qoldiq bu yerda o'zgarmaydi (kirim/inventarizatsiya)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const cur = await Ingredient.findById(req.params.id)
    if (!cur) return res.status(404).json({ message: 'Topilmadi' })
    const set = {}
    if (req.body.name !== undefined) { set.name = text(req.body.name, 80); if (!set.name) return bad(res, 'Nomi majburiy') }
    if (req.body.minQty !== undefined) set.minQty = Math.max(0, num(req.body.minQty) || 0)
    if (req.body.price !== undefined) set.price = Math.max(0, num(req.body.price) || 0)
    if (req.body.unit !== undefined && norm(req.body.unit) !== norm(cur.unit)) {
      const unit = norm(req.body.unit)
      if (!UNITS.includes(unit)) return bad(res, "O'lchov birligi noto'g'ri")
      const k = convert(1, cur.unit, unit)   // masalan kg → g: 1000
      if (k === null && cur.quantity !== 0) return bad(res, `${cur.unit} → ${unit} o'tkazib bo'lmaydi: avval qoldiqni inventarizatsiya bilan 0 ga tenglang`)
      set.unit = unit
      if (k !== null) {
        // Qoldiq, minimum va narx yangi birlikda (1 kg = 1000 g; narx 1 g uchun)
        set.quantity = cur.quantity * k
        set.minQty = (set.minQty ?? cur.minQty) * k
        set.price = (set.price ?? cur.price) / k
      }
    }
    const item = await Ingredient.findByIdAndUpdate(cur._id, { $set: set }, { new: true })
    req.app.get('io').emit('stockChanged')
    res.json(item)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// DELETE /api/ingredients/:id — retseptlardan ham olib tashlanadi (yopishda yo'q ingredient xato bermasin)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const r = await Product.updateMany({ 'ingredients.ingredient': req.params.id }, { $pull: { ingredients: { ingredient: req.params.id } } })
    await Ingredient.findByIdAndDelete(req.params.id)
    req.app.get('io').emit('stockChanged')
    res.json({ message: "O'chirildi", recipes: r.modifiedCount || 0 })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

module.exports = router

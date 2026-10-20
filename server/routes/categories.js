const router   = require('express').Router()
const Category = require('../models/Category')
const Product  = require('../models/Product')
const Settings = require('../models/Settings')
const auth     = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const settingsCache = require('../utils/settingsCache')

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Katta-kichik harfga qaramay bir xil nom ("ichimliklar" = "Ichimliklar")
const byName = name => Category.findOne({ name: new RegExp(`^${escapeRe(name)}$`, 'i') })

function cleanName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ')
  if (!name) throw Object.assign(new Error('Bo\'lim nomini kiriting'), { status: 400 })
  if (name.length > 40) throw Object.assign(new Error('Bo\'lim nomi 40 belgidan oshmasin'), { status: 400 })
  return name
}

const fail = (res, err) => res.status(err.status || 500).json({ message: err.status ? err.message : 'Server xatosi' })

// ── GET /api/categories — bo'limlar va har biridagi taomlar soni ──
router.get('/', auth, async (req, res) => {
  try {
    const [cats, counts] = await Promise.all([
      Category.find().sort({ name: 1 }).lean(),
      Product.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }]),
    ])
    const count = Object.fromEntries(counts.map(c => [c._id, c.n]))
    res.json(cats.map(c => ({ _id: c._id, name: c.name, products: count[c.name] || 0 })))
  } catch (err) { fail(res, err) }
})

// ── POST /api/categories ──────────────────────────────────────
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const name = cleanName(req.body.name)
    if (await byName(name)) return res.status(400).json({ message: 'Bunday bo\'lim allaqachon bor' })
    const cat = await Category.create({ name })
    res.status(201).json({ _id: cat._id, name: cat.name, products: 0 })
  } catch (err) { fail(res, err) }
})

// ── PUT /api/categories/:id — nomini o'zgartirish ─────────────
// Shu bo'limdagi taomlar va printerlarning bo'lim ro'yxati ham yangi nomga o'tadi.
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const name = cleanName(req.body.name)
    const cat = await Category.findById(req.params.id)
    if (!cat) return res.status(404).json({ message: 'Bo\'lim topilmadi' })
    const old = cat.name
    if (name === old) return res.json({ _id: cat._id, name, products: await Product.countDocuments({ category: old }) })
    const dup = await byName(name)
    if (dup && String(dup._id) !== String(cat._id)) return res.status(400).json({ message: 'Bunday bo\'lim allaqachon bor' })

    cat.name = name
    await cat.save()
    await Product.updateMany({ category: old }, { $set: { category: name } })

    const settings = await Settings.findById('main')
    if (settings?.printers?.some(p => p.categories.includes(old))) {
      settings.printers.forEach(p => { p.categories = p.categories.map(c => (c === old ? name : c)) })
      await settings.save()
      settingsCache.invalidate()
    }

    res.json({ _id: cat._id, name, products: await Product.countDocuments({ category: name }) })
  } catch (err) { fail(res, err) }
})

// ── DELETE /api/categories/:id — faqat bo'sh bo'lim ───────────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const cat = await Category.findById(req.params.id)
    if (!cat) return res.status(404).json({ message: 'Bo\'lim topilmadi' })
    const n = await Product.countDocuments({ category: cat.name })
    if (n) return res.status(400).json({ message: `Bu bo'limda ${n} ta taom bor. Avval ularni boshqa bo'limga o'tkazing.` })
    await Category.deleteOne({ _id: cat._id })
    res.json({ message: 'O\'chirildi' })
  } catch (err) { fail(res, err) }
})

// Bo'limlar ro'yxati paydo bo'lishidan oldin taomlarga qo'lda yozilgan bo'limlarni ro'yxatga qo'shish.
// Faqat cloud / lokal rejimda (kassa bo'limlarni cloud'dan oladi — ikki marta yaratilmasin).
async function seedFromProducts() {
  const names = (await Product.distinct('category')).map(n => String(n || '').trim()).filter(Boolean)
  let added = 0
  for (const name of names) {
    if (await byName(name)) continue
    await Category.create({ name })
    added++
  }
  if (added) console.log(`🗂️  Bo'limlar: taomlardan ${added} ta bo'lim ro'yxatga qo'shildi`)
}

module.exports = router
module.exports.byName = byName
module.exports.seedFromProducts = seedFromProducts

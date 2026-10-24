const router  = require('express').Router()
const path    = require('path')
const fs      = require('fs')
const multer  = require('multer')
const { imageFilter } = require('../utils/uploadFilters')
const Product = require('../models/Product')
const Category = require('../models/Category')
const { byName } = require('./categories')
const auth    = require('../middleware/auth')

// Taom bo'limi faqat "Bo'limlar" ro'yxatidan (yozilish farqi bo'lsa ro'yxatdagi nom olinadi)
const categoryOf = raw => (String(raw || '').trim() ? byName(String(raw).trim()) : null)
const { adminOnly } = require('../middleware/auth')

// ── Uploads papkasini avtomatik yaratish ──────────────────────
const { UPLOAD_DIR } = require('../config')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  console.log('📁 uploads/ papkasi yaratildi:', UPLOAD_DIR)
}

// ── Multer konfiguratsiya ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `product_${Date.now()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: imageFilter,
})

// ── Eski rasmni o'chirish (xavfsiz) ──────────────────────────
function removeOldImage(imagePath) {
  if (!imagePath) return
  // faqat /uploads/... yo'llarini o'chir, to'liq yo'l emas
  if (!/^\/?uploads\//.test(imagePath)) return
  // basename — papkadan tashqariga chiqib bo'lmaydi
  const abs = path.join(UPLOAD_DIR, path.basename(imagePath))
  if (fs.existsSync(abs)) {
    try { fs.unlinkSync(abs) } catch (e) { console.warn('Rasm o\'chirilmadi:', e.message) }
  }
}

// ── GET /api/products ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {}
    if (req.query.category) filter.category = req.query.category
    if (req.query.active !== 'false') filter.isActive = true
    const products = await Product.find(filter)
      .populate('ingredients.ingredient', 'name unit quantity')
      .sort({ position: 1, category: 1, name: 1 })
    res.json(products)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET /api/products/categories ─────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    // Bo'limlar ro'yxati + ro'yxatda yo'q, lekin taomlarda qolgan eski nomlar (sync kelguncha)
    const [listed, used] = await Promise.all([Category.distinct('name'), Product.distinct('category', { isActive: true })])
    res.json([...new Set([...listed, ...used])].filter(Boolean).sort())
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// ── GET /api/products/:id ─────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id)
      .populate('ingredients.ingredient', 'name unit quantity')
    if (!p) return res.status(404).json({ message: 'Topilmadi' })
    res.json(p)
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// ── POST /api/products ────────────────────────────────────────
router.post('/', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, price, category, ingredients } = req.body

    if (!name?.trim())  return res.status(400).json({ message: 'Nomi majburiy' })
    if (!price)         return res.status(400).json({ message: 'Narxi majburiy' })
    const cat = await categoryOf(category)
    if (!cat) return res.status(400).json({ message: 'Bo\'limni ro\'yxatdan tanlang' })

    let parsedIngredients = []
    if (ingredients) {
      try {
        parsedIngredients = JSON.parse(ingredients)
          .filter(i => i.ingredient && i.quantity)
      } catch {}
    }

    // Yangi taom ro'yxat oxiriga tushadi
    const last = await Product.findOne().sort({ position: -1 }).select('position').lean()
    const product = await Product.create({
      position:    (last?.position || 0) + 1,
      name:        name.trim(),
      price:       +price,
      category:    cat.name,
      image:       req.file ? `/uploads/${req.file.filename}` : '',
      ingredients: parsedIngredients,
    })

    res.status(201).json(product)
  } catch (err) {
    // Multer xatosi
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: "Rasm hajmi 5MB dan katta bo'lmasin" })
    }
    res.status(500).json({ message: err.message })
  }
})

// ── PUT /api/products/reorder ─────────────────────────────────
// body: { ids: [...] } — taomlarning yangi tartibi (to'liq ro'yxat). Faqat o'rni o'zgarganlar
// yoziladi; har biri alohida updateOne — sync plugin _seq qo'yishi uchun (bulkWrite hook'siz).
router.put('/reorder', auth, adminOnly, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : []
    if (!ids.length) return res.status(400).json({ message: "Ro'yxat bo'sh" })
    const current = await Product.find({ _id: { $in: ids } }).select('position').lean()
    const pos = Object.fromEntries(current.map(p => [String(p._id), p.position]))
    let changed = 0
    for (const [i, id] of ids.entries()) {
      if (!(id in pos) || pos[id] === i) continue
      await Product.updateOne({ _id: id }, { $set: { position: i } })
      changed++
    }
    res.json({ changed })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── PUT /api/products/:id ─────────────────────────────────────
router.put('/:id', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, price, category, ingredients, isActive } = req.body

    const existing = await Product.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Topilmadi' })

    const update = {}
    if (name?.trim())           update.name     = name.trim()
    if (price !== undefined)    update.price    = +price
    // Bo'lim o'zgarmagan bo'lsa tekshirilmaydi (ro'yxatga hali tushmagan eski nom ham saqlanadi)
    if (category?.trim() && category.trim() !== existing.category) {
      const cat = await categoryOf(category)
      if (!cat) return res.status(400).json({ message: 'Bo\'limni ro\'yxatdan tanlang' })
      update.category = cat.name
    }
    if (isActive !== undefined) update.isActive = isActive === 'true' || isActive === true

    // Yangi rasm yuklansa — eski rasmni o'chir
    if (req.file) {
      removeOldImage(existing.image)
      update.image = `/uploads/${req.file.filename}`
    }

    if (ingredients !== undefined) {
      try {
        update.ingredients = JSON.parse(ingredients)
          .filter(i => i.ingredient && i.quantity)
      } catch { update.ingredients = [] }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id, update, { new: true }
    ).populate('ingredients.ingredient', 'name unit quantity')

    res.json(product)
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: "Rasm hajmi 5MB dan katta bo'lmasin" })
    }
    res.status(500).json({ message: err.message })
  }
})

// ── DELETE /api/products/:id ──────────────────────────────────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ message: 'Topilmadi' })

    // Rasmni ham o'chiramiz
    removeOldImage(product.image)

    await Product.findByIdAndDelete(req.params.id)
    res.json({ message: "O'chirildi" })
  } catch { res.status(500).json({ message: 'Server xatosi' }) }
})

// ── Multer error handler ───────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message?.includes('rasm')) {
    return res.status(400).json({ message: err.message })
  }
  next(err)
})

module.exports = router

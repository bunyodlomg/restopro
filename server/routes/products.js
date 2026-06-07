const router  = require('express').Router()
const path    = require('path')
const fs      = require('fs')
const multer  = require('multer')
const Product = require('../models/Product')
const auth    = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')

// ── Uploads papkasini avtomatik yaratish ──────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
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
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Faqat rasm fayllar qabul qilinadi!'), false)
  },
})

// ── Eski rasmni o'chirish (xavfsiz) ──────────────────────────
function removeOldImage(imagePath) {
  if (!imagePath) return
  // faqat /uploads/... yo'llarini o'chir, to'liq yo'l emas
  const rel = imagePath.startsWith('/') ? imagePath : `/${imagePath}`
  const abs = path.join(__dirname, '..', rel)
  // Faqat uploads papkasi ichidagi faylni o'chir
  if (!abs.startsWith(UPLOAD_DIR)) return
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
      .sort({ category: 1, name: 1 })
    res.json(products)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ── GET /api/products/categories ─────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const cats = await Product.distinct('category', { isActive: true })
    res.json(cats.filter(Boolean).sort())
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

    let parsedIngredients = []
    if (ingredients) {
      try {
        parsedIngredients = JSON.parse(ingredients)
          .filter(i => i.ingredient && i.quantity)
      } catch {}
    }

    const product = await Product.create({
      name:        name.trim(),
      price:       +price,
      category:    category?.trim() || 'Asosiy',
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

// ── PUT /api/products/:id ─────────────────────────────────────
router.put('/:id', auth, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const { name, price, category, ingredients, isActive } = req.body

    const existing = await Product.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Topilmadi' })

    const update = {}
    if (name?.trim())           update.name     = name.trim()
    if (price !== undefined)    update.price    = +price
    if (category?.trim())       update.category = category.trim()
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

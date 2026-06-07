const router   = require('express').Router()
const path     = require('path')
const fs       = require('fs')
const Settings = require('../models/Settings')
const auth     = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const multer   = require('multer')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `logo_${Date.now()}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 2 * 1024 * 1024 } })

const soundStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `sound_${req.params.type}_${Date.now()}${ext}`)
  },
})
const soundUpload = multer({
  storage: soundStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true)
    else cb(new Error('Faqat audio fayllar ruxsat etiladi'))
  },
})

async function getOrCreate() {
  let s = await Settings.findById('main')
  if (!s) s = await Settings.create({ _id: 'main' })
  return s
}

// GET /api/settings
router.get('/', auth, async (req, res) => {
  try { res.json(await getOrCreate()) }
  catch (err) { res.status(500).json({ message: err.message }) }
})

// PUT /api/settings
router.put('/', auth, adminOnly, upload.single('logo'), async (req, res) => {
  try {
    const { brandName, brandLogo, serviceFeeEnabled, serviceFeePercent } = req.body
    const update = { updatedBy: req.user._id }
    if (brandName         !== undefined) update.brandName         = brandName
    if (brandLogo         !== undefined) update.brandLogo         = brandLogo
    if (serviceFeeEnabled !== undefined) update.serviceFeeEnabled = serviceFeeEnabled === 'true' || serviceFeeEnabled === true
    if (serviceFeePercent !== undefined) update.serviceFeePercent = +serviceFeePercent
    if (req.file)                        update.brandLogo         = `/uploads/${req.file.filename}`

    // Chek dizayni — FormData orqali JSON satr ko'rinishida keladi
    if (req.body.receipt !== undefined) {
      try {
        const r = typeof req.body.receipt === 'string'
          ? JSON.parse(req.body.receipt) : req.body.receipt
        update.receipt = {
          headerText:   String(r.headerText   ?? '').slice(0, 120),
          footerText:   String(r.footerText   ?? '').slice(0, 120),
          showLogo:     !!r.showLogo,
          showWaiter:   !!r.showWaiter,
          showDateTime: !!r.showDateTime,
          paperWidth:   [58, 80].includes(+r.paperWidth) ? +r.paperWidth : 58,
          fontSize:     Math.min(20, Math.max(8, +r.fontSize || 12)),
        }
      } catch { /* noto'g'ri JSON — e'tiborsiz qoldiramiz */ }
    }

    const s = await Settings.findByIdAndUpdate('main', update, { new: true, upsert: true })
    res.json(s)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// PUT /api/settings/sound/:type — maxsus tovush yuklash
const SOUND_TYPES = ['tick','nav','confirm','success','warn','newOrder']
router.put('/sound/:type', auth, adminOnly, soundUpload.single('sound'), async (req, res) => {
  try {
    if (!SOUND_TYPES.includes(req.params.type)) return res.status(400).json({ message: "Noto'g'ri tovush turi" })
    if (!req.file) return res.status(400).json({ message: 'Fayl topilmadi' })
    const s = await Settings.findByIdAndUpdate('main', {
      [`sounds.${req.params.type}`]: `/uploads/${req.file.filename}`
    }, { new: true, upsert: true })
    res.json(s)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// DELETE /api/settings/sound/:type — standart tovushga qaytarish
router.delete('/sound/:type', auth, adminOnly, async (req, res) => {
  try {
    if (!SOUND_TYPES.includes(req.params.type)) return res.status(400).json({ message: "Noto'g'ri tovush turi" })
    const old = await getOrCreate()
    const oldPath = old.sounds?.[req.params.type]
    if (oldPath) {
      const fullPath = path.join(UPLOAD_DIR, path.basename(oldPath))
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    }
    const s = await Settings.findByIdAndUpdate('main', {
      [`sounds.${req.params.type}`]: ''
    }, { new: true, upsert: true })
    res.json(s)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/settings/soboy-next
router.post('/soboy-next', auth, async (req, res) => {
  try {
    const s = await Settings.findByIdAndUpdate(
      'main',
      { $inc: { soboyCounter: 1 } },
      { new: true, upsert: true }
    )
    res.json({ number: s.soboyCounter })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router

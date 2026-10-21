// Sync o'zi hal qilgan ziddiyatlar haqida xabarlar (admin ekranida banner)
const router = require('express').Router()
const auth = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const SyncNotice = require('../models/SyncNotice')

// GET /api/sync-notices — o'qilmaganlar
router.get('/', auth, adminOnly, async (req, res, next) => {
  try { res.json(await SyncNotice.find({ read: false }).sort({ createdAt: -1 }).limit(20).lean()) }
  catch (err) { next(err) }
})

// POST /api/sync-notices/read — hammasini o'qildi deb belgilash (kassa va cloud'da ham)
router.post('/read', auth, adminOnly, async (req, res, next) => {
  try {
    await SyncNotice.updateMany({ read: false }, { $set: { read: true } })
    req.app.get('io').emit('syncApplied', { colls: ['syncnotices'] })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router

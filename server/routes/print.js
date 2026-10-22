// ── Chop etish API ──────────────────────────────────────────────
const router   = require('express').Router()
const mongoose = require('mongoose')
const Order    = require('../models/Order')
const PrintJob = require('../models/PrintJob')
const auth     = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const Settings = require('../models/Settings')
const print    = require('../print')
const escpos   = require('../print/escpos')

const view = j => ({ _id: j._id, kind: j.kind, title: j.title, printer: j.printer?.name || '', status: j.status, error: j.error, createdAt: j.createdAt, printedAt: j.printedAt })

// GET /api/print/status — shu server printerga o'zi yuboradimi (kassa) yoki kassaga uzatadimi (cloud)
router.get('/status', auth, (req, res) => res.json({ agent: print.AGENT }))

// POST /api/print/receipt/:orderId — mijoz chekini chek printeriga
router.post('/receipt/:orderId', auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.orderId)) return res.status(400).json({ message: "Noto'g'ri buyurtma" })
    const order = await Order.findById(req.params.orderId).lean()
    if (!order) return res.status(404).json({ message: 'Buyurtma topilmadi' })
    const jobs = await print.queueReceipt(order)
    if (!jobs.length) return res.status(409).json({ code: 'NO_PRINTER', message: 'Chek printeri sozlanmagan: Sozlamalar → Printerlar' })
    res.json({ agent: print.AGENT, jobs: jobs.map(view) })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/print/preview — chek namunasi (sozlamalar sahifasi): printer chiqaradigan qatorlarning o'zi.
// body: { order, paperWidth, brandName?, receipt? } — hali saqlanmagan sozlamalar ham ko'rinadi
router.post('/preview', auth, adminOnly, async (req, res) => {
  try {
    const saved = (await Settings.findById('main').lean()) || {}
    const { order = {}, paperWidth, brandName, receipt } = req.body || {}
    const settings = { ...saved, ...(brandName !== undefined && { brandName }), receipt: { ...saved.receipt, ...receipt } }
    res.json(escpos.receiptPreview(order, settings, paperWidth))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// POST /api/print/test/:printerId — sinov varag'i
router.post('/test/:printerId', auth, adminOnly, async (req, res) => {
  try { res.json({ agent: print.AGENT, jobs: (await print.queueTest(req.params.printerId)).map(view) }) }
  catch (err) { res.status(err.status || 500).json({ message: err.message }) }
})

// GET /api/print/jobs?ids=a,b — vazifalar holati (chiqdimi?)
// GET /api/print/jobs          — oxirgi 30 ta (sozlamalarda ko'rsatish uchun)
router.get('/jobs', auth, async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').filter(mongoose.isValidObjectId).slice(0, 20)
    const q = ids.length ? PrintJob.find({ _id: { $in: ids } }) : PrintJob.find().sort({ createdAt: -1 }).limit(30)
    res.json((await q.select('-data').lean()).map(view))
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// GET /api/print/devices — kassa kompyuteriga ulangan (USB) Windows printerlari
router.get('/devices', auth, adminOnly, async (req, res) => {
  if (!print.AGENT) return res.json({ available: false, devices: [] })
  try { res.json({ available: true, devices: await print.listDevices() }) }
  catch (err) { res.json({ available: true, devices: [], error: err.message }) }
})

module.exports = router

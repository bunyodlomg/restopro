// ── QR menyu: mijoz stoldagi QR kodni skanerlab buyurtma beradi ──
// Faqat restoran Wi-Fi'idan (utils/onPremise). Mijoz buyurtmasi darhol
// oshxonaga bormaydi: xodim "Qabul qilish" bosgach oddiy buyurtmaga qo'shiladi.
const router     = require('express').Router()
const Table      = require('../models/Table')
const Product    = require('../models/Product')
const Order      = require('../models/Order')
const GuestOrder = require('../models/GuestOrder')
const auth       = require('../middleware/auth')
const settingsCache = require('../utils/settingsCache')
const { isOnPremise, normIp } = require('../utils/onPremise')
const { placeOrder } = require('./orders')

const MAX_LINES = 30
const MAX_QTY = 20
const MAX_OPEN_PER_TABLE = 3

// Oddiy cheklov: bitta IP 20 soniyada bir marta buyurtma yubora oladi
const lastPost = new Map()
setInterval(() => { const t = Date.now() - 60000; for (const [k, v] of lastPost) if (v < t) lastPost.delete(k) }, 60000).unref()

async function guestGate(req, res, next) {
  try {
    const s = await settingsCache.get()
    if (!s.qrMenuEnabled) return res.status(403).json({ code: 'QR_OFF', message: 'QR menyu hozir o\'chirilgan' })
    if (!(await isOnPremise(req)))
      return res.status(403).json({ code: 'NOT_ON_WIFI', message: 'Buyurtma berish uchun restoran Wi-Fi tarmog\'iga ulaning' })
    const token = String(req.params.token || '')
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return res.status(404).json({ message: 'QR kod eskirgan' })
    const table = await Table.findOne({ qrToken: token })
    if (!table) return res.status(404).json({ code: 'BAD_QR', message: 'QR kod eskirgan. Ofitsantdan yordam so\'rang.' })
    req.table = table
    req.settings = s
    next()
  } catch (err) { next(err) }
}

// GET /api/guest/t/:token — stol, brend va menyu
router.get('/t/:token', guestGate, async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).select('name price category image').sort({ category: 1, name: 1 })
    const s = req.settings
    res.json({
      table: { number: req.table.number, category: req.table.category },
      brand: { name: s.brandName || 'RestoPro', logo: s.brandLogo || '' },
      serviceFeePercent: s.serviceFeeEnabled ? s.serviceFeePercent : 0,
      products,
      bill: await tableBill(req.table),
    })
  } catch (err) { next(err) }
})

// Stolning ochiq hisobi (yopilguncha): qabul qilingan taomlar + hali tasdiqlanmagan mijoz buyurtmalari.
// Mijoz telefonida "Hisobim" bo'lib ko'rinadi — oldingi buyurtmalari ham, jami summa ham.
async function tableBill(table) {
  const [order, waiting] = await Promise.all([
    Order.findOne({ tableId: table._id, status: { $in: ['pending', 'ready'] } }).sort({ createdAt: 1 }).lean(),
    GuestOrder.find({ tableId: table._id, status: 'new' }).sort({ createdAt: 1 }).lean(),
  ])
  const items = (order?.items || []).map(i => ({ name: i.name, price: i.price, quantity: i.quantity }))
  const extras = (order?.extras || []).map(e => ({ name: e.comment || "Qo'shimcha", price: e.extraFee || 0 }))
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0) + extras.reduce((s, e) => s + e.price, 0)
  return {
    open: !!order,
    openedAt: order?.createdAt || null,
    items, extras,
    serviceFee: order?.serviceFee || 0,
    total: subtotal + (order?.serviceFee || 0),
    waiting: waiting.flatMap(g => g.items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity }))),
  }
}

// GET /api/guest/t/:token/bill — hisobni yangilash (mijoz sahifasi kuzatadi)
router.get('/t/:token/bill', guestGate, async (req, res, next) => {
  try { res.json(await tableBill(req.table)) } catch (err) { next(err) }
})

// POST /api/guest/t/:token/orders — { items: [{ productId, quantity }], note }
router.post('/t/:token/orders', guestGate, async (req, res, next) => {
  try {
    const ip = normIp(req.ip)
    if (Date.now() - (lastPost.get(ip) || 0) < 20000)
      return res.status(429).json({ message: 'Biroz kuting — buyurtmangiz yuborilmoqda' })
    const open = await GuestOrder.countDocuments({ tableId: req.table._id, status: 'new' })
    if (open >= MAX_OPEN_PER_TABLE)
      return res.status(429).json({ message: 'Oldingi buyurtmalar hali qabul qilinmadi. Ofitsantni kuting.' })

    const raw = Array.isArray(req.body?.items) ? req.body.items.slice(0, MAX_LINES) : []
    const ids = raw.map(i => i.productId).filter(id => /^[a-f0-9]{24}$/i.test(String(id)))
    const products = await Product.find({ _id: { $in: ids }, isActive: true })
    const items = []
    for (const r of raw) {
      const p = products.find(x => String(x._id) === String(r.productId))
      const q = Number(r.quantity)
      if (!p || !Number.isInteger(q) || q < 1 || q > MAX_QTY) continue
      items.push({ productId: p._id, name: p.name, price: p.price, quantity: q })
    }
    if (!items.length) return res.status(400).json({ message: 'Taom tanlang' })

    lastPost.set(ip, Date.now())
    const g = await GuestOrder.create({
      tableId: req.table._id, tableNumber: req.table.number, category: req.table.category,
      items, note: String(req.body?.note || '').slice(0, 200), ip,
    })
    req.app.get('io').emit('guestOrder', g)
    res.status(201).json({ _id: g._id, status: g.status })
  } catch (err) { next(err) }
})

// GET /api/guest/t/:token/orders/:id — holat (mijoz sahifasi kuzatadi)
router.get('/t/:token/orders/:id', guestGate, async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(404).json({ message: 'Topilmadi' })
    const g = await GuestOrder.findOne({ _id: req.params.id, tableId: req.table._id }).select('status items note createdAt')
    if (!g) return res.status(404).json({ message: 'Topilmadi' })
    res.json(g)
  } catch (err) { next(err) }
})

// ── Xodimlar uchun: kelgan mijoz buyurtmalari ─────────────────
const staff = require('express').Router()

staff.get('/', auth, async (req, res, next) => {
  try {
    const status = ['new', 'accepted', 'rejected'].includes(req.query.status) ? req.query.status : 'new'
    res.json(await GuestOrder.find({ status }).sort({ createdAt: -1 }).limit(100))
  } catch (err) { next(err) }
})

staff.post('/:id/accept', auth, async (req, res, next) => {
  try {
    // Atomar: ikki xodim bir vaqtda bossa ham bir marta qo'shiladi
    const g = await GuestOrder.findOneAndUpdate({ _id: req.params.id, status: 'new' }, { status: 'accepted', handledBy: req.user.name }, { new: true })
    if (!g) return res.status(409).json({ message: 'Bu buyurtma allaqachon ko\'rib chiqilgan' })
    try {
      const { order } = await placeOrder(req.app.get('io'), {
        tableId: g.tableId, tableNumber: g.tableNumber, category: g.category,
        waiterName: req.user.name, items: g.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        note: g.note ? `Mijoz: ${g.note}` : '',
      }, req.user)
      g.orderId = order._id; await g.save()
    } catch (err) {
      g.status = 'new'; g.handledBy = ''; await g.save()
      throw err
    }
    req.app.get('io').emit('guestOrderHandled', { _id: g._id, status: g.status })
    res.json(g)
  } catch (err) { err.status ? res.status(err.status).json({ message: err.message }) : next(err) }
})

staff.post('/:id/reject', auth, async (req, res, next) => {
  try {
    const g = await GuestOrder.findOneAndUpdate({ _id: req.params.id, status: 'new' }, { status: 'rejected', handledBy: req.user.name }, { new: true })
    if (!g) return res.status(409).json({ message: 'Bu buyurtma allaqachon ko\'rib chiqilgan' })
    req.app.get('io').emit('guestOrderHandled', { _id: g._id, status: g.status })
    res.json(g)
  } catch (err) { next(err) }
})

module.exports = { guest: router, staff }

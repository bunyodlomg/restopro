// ── Bron (stol/xona) ─────────────────────────────────────────
// Mijoz telefon qiladi → admin qo'lda kiritadi. Ofitsantlar ro'yxatni ko'radi.
const router      = require('express').Router()
const Reservation = require('../models/Reservation')
const Table       = require('../models/Table')
const auth        = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')

const STATUSES = ['booked', 'arrived', 'cancelled', 'noshow']
const emit = req => req.app.get('io').emit('reservationsChanged')

function clean(body) {
  const out = {}
  if (body.startAt !== undefined) {
    const d = new Date(body.startAt)
    if (isNaN(d)) throw Object.assign(new Error('Sana/vaqt noto\'g\'ri'), { status: 400 })
    out.startAt = d
  }
  if (body.duration !== undefined) out.duration = Math.min(720, Math.max(15, parseInt(body.duration, 10) || 120))
  if (body.guests   !== undefined) out.guests   = Math.min(500, Math.max(1, parseInt(body.guests, 10) || 1))
  if (body.name     !== undefined) out.name     = String(body.name).trim().slice(0, 80)
  if (body.phone    !== undefined) out.phone    = String(body.phone).trim().slice(0, 30)
  if (body.note     !== undefined) out.note     = String(body.note).slice(0, 300)
  if (body.deposit  !== undefined) out.deposit  = Math.max(0, Math.round(Number(body.deposit) || 0))
  if (body.status   !== undefined) {
    if (!STATUSES.includes(body.status)) throw Object.assign(new Error('Holat noto\'g\'ri'), { status: 400 })
    out.status = body.status
  }
  return out
}

// Bir stolga bir vaqtda ikki bron tushmasin
async function overlaps(tableId, startAt, duration, exceptId) {
  const start = new Date(startAt).getTime()
  const end = start + duration * 60000
  const near = await Reservation.find({
    tableId, status: 'booked', _id: { $ne: exceptId },
    startAt: { $gte: new Date(start - 12 * 3600000), $lte: new Date(end) },
  })
  return near.find(r => r.startAt.getTime() < end && r.startAt.getTime() + r.duration * 60000 > start)
}

// GET /api/reservations?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', auth, async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(req.query.from + 'T00:00:00') : new Date(new Date().setHours(0, 0, 0, 0))
    const to   = req.query.to   ? new Date(req.query.to + 'T23:59:59.999') : new Date(from.getTime() + 30 * 86400000)
    res.json(await Reservation.find({ startAt: { $gte: from, $lte: to } }).sort({ startAt: 1 }).limit(1000))
  } catch (err) { next(err) }
})

router.post('/', auth, adminOnly, async (req, res, next) => {
  try {
    const data = clean(req.body)
    const table = await Table.findById(req.body.tableId)
    if (!table) return res.status(400).json({ message: 'Stol tanlang' })
    if (!data.name) return res.status(400).json({ message: 'Mijoz ismini kiriting' })
    if (!data.startAt) return res.status(400).json({ message: 'Sana va vaqtni kiriting' })
    const dup = await overlaps(table._id, data.startAt, data.duration || 120)
    if (dup) return res.status(409).json({ message: `Bu vaqtda ${table.category === 'xona' ? 'xona' : 'stol'} band: ${dup.name}, ${dup.startAt.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}` })
    const r = await Reservation.create({ ...data, tableId: table._id, tableNumber: table.number, category: table.category, createdBy: req.user.name })
    emit(req); res.status(201).json(r)
  } catch (err) { err.status ? res.status(err.status).json({ message: err.message }) : next(err) }
})

router.put('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    const data = clean(req.body)
    const cur = await Reservation.findById(req.params.id)
    if (!cur) return res.status(404).json({ message: 'Topilmadi' })
    if (req.body.tableId && String(req.body.tableId) !== String(cur.tableId)) {
      const t = await Table.findById(req.body.tableId)
      if (!t) return res.status(400).json({ message: 'Stol topilmadi' })
      Object.assign(data, { tableId: t._id, tableNumber: t.number, category: t.category })
    }
    const next_ = { ...cur.toObject(), ...data }
    if (next_.status === 'booked') {
      const dup = await overlaps(next_.tableId, next_.startAt, next_.duration, cur._id)
      if (dup) return res.status(409).json({ message: `Bu vaqtda band: ${dup.name}` })
    }
    Object.assign(cur, data); await cur.save()
    emit(req); res.json(cur)
  } catch (err) { err.status ? res.status(err.status).json({ message: err.message }) : next(err) }
})

// Ofitsant ham "keldi" deb belgilay oladi
router.post('/:id/arrived', auth, async (req, res, next) => {
  try {
    const r = await Reservation.findByIdAndUpdate(req.params.id, { status: 'arrived' }, { new: true })
    if (!r) return res.status(404).json({ message: 'Topilmadi' })
    emit(req); res.json(r)
  } catch (err) { next(err) }
})

router.delete('/:id', auth, adminOnly, async (req, res, next) => {
  try {
    await Reservation.findByIdAndDelete(req.params.id)
    emit(req); res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router

// ── Qarzlar: mijoz balansi faqat $inc bilan, har o'zgarish DebtTx izi bilan ──
const Customer = require('../models/Customer')
const DebtTx   = require('../models/DebtTx')

const money = n => Math.round(Number(n) || 0)

// type: 'debt' (+) | 'payment' (−)
async function record(customerId, type, amount, { orderId = null, note = '', by = '' } = {}, io) {
  amount = money(amount)
  if (!(amount > 0)) return null
  const c = await Customer.findByIdAndUpdate(customerId, { $inc: { balance: type === 'debt' ? amount : -amount }, $set: { lastAt: new Date() } }, { new: true })
  if (!c) return null
  const tx = await DebtTx.create({ customerId: c._id, customerName: c.name, type, amount, orderId, note: String(note).slice(0, 200), by })
  io?.emit('debtsChanged')
  return { customer: c, tx }
}

// Buyurtma o'chirilganda (test buyurtmalari): unga bog'langan qarz bekor qilinadi
async function undoOrder(orderId, io) {
  const txs = await DebtTx.find({ orderId, type: 'debt' }).lean()
  for (const t of txs) await Customer.findByIdAndUpdate(t.customerId, { $inc: { balance: -t.amount } })
  if (txs.length) { await DebtTx.deleteMany({ _id: { $in: txs.map(t => t._id) } }); io?.emit('debtsChanged') }
  return txs.length
}

module.exports = { record, undoOrder, money }

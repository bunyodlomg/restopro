// ── Bir stolda ikkita ochiq buyurtma — birlashtirish (faqat cloud'da) ──
// Kassa va cloud bir-biridan bexabar (bir necha soniya ichida yoki offline) bir stolga
// buyurtma ochsa, sync'dan keyin stolda ikkita ochiq hisob paydo bo'ladi.
// Cloud kassadan kelgan buyurtmalarni qo'llagach, eng birinchi ochilganiga qolganlarini qo'shadi;
// natija sync orqali kassaga qaytadi. Faqat bitta tugunda bajarilgani uchun ikki tomon
// bir-birining birlashtirishini bekor qilib aylanib qolmaydi.
// Oshxona talonlari qayta chiqarilmaydi — har bir tomon o'z taomlarini allaqachon chop etgan.

const Order = require('../models/Order')
const Table = require('../models/Table')

const OPEN_STATUSES = ['pending', 'ready']

async function mergeDuplicateOrders(touched) {
  const ids = touched.filter(t => t.coll === 'orders' && !t.deleted).map(t => t.id)
  if (!ids.length) return 0

  const tableIds = await Order.distinct('tableId', {
    _id: { $in: ids }, status: { $in: OPEN_STATUSES }, tableId: { $ne: null }, category: { $ne: 'soboy' },
  })

  let merged = 0
  for (const tableId of tableIds) {
    const open = await Order.find({ tableId, status: { $in: OPEN_STATUSES } }).sort({ createdAt: 1, _id: 1 })
    if (open.length < 2) continue
    const [keep, ...dups] = open

    for (const dup of dups) {
      for (const item of dup.items) {
        const same = keep.items.find(i => i.productId?.toString() === item.productId?.toString() && i.price === item.price)
        if (same) same.quantity += item.quantity
        else keep.items.push({ productId: item.productId, name: item.name, price: item.price, quantity: item.quantity })
      }
      for (const e of dup.extras) keep.extras.push({ extraFee: e.extraFee, comment: e.comment })
      for (const c of dup.clientIds) if (!keep.clientIds.includes(c)) keep.clientIds.push(c)
      if (dup.note && dup.note !== keep.note) keep.note = keep.note ? `${keep.note}; ${dup.note}` : dup.note
      if (dup.status === 'pending') keep.status = 'pending'
      keep.serviceFee = (keep.serviceFee || 0) + (dup.serviceFee || 0)

      dup.status = 'cancelled'
      dup.closedAt = new Date()
      dup.mergedInto = keep._id
      await dup.save()
      merged++
    }

    keep.totalPrice = keep.items.reduce((s, i) => s + i.price * i.quantity, 0)
    await keep.save()
    await Table.updateOne({ _id: tableId }, { $set: { status: 'busy', currentOrder: keep._id } })
    console.log(`🔀 sync: stol ${keep.tableNumber} (${keep.category}) — ${dups.length} ta buyurtma ${keep._id} ga qo'shildi`)
  }
  return merged
}

module.exports = { mergeDuplicateOrders }

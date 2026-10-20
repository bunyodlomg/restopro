// Sync orqali kelgan o'zgarishlar haqida ochiq ekranlarni xabardor qilish
function notifyApplied(io, result, { quiet = false } = {}) {
  if (!io || !result?.touched?.length) return
  const colls = [...new Set(result.touched.map(t => t.coll))]
  io.emit('syncApplied', { colls })

  // Ofitsant sessiyasi boshqa tugunda o'zgargan (u yerda kirildi / chiqildi / admin yopdi)
  const userIds = result.touched.filter(t => t.coll === 'sessions').map(t => t.id)
  if (userIds.length) {
    require('../utils/sessions').kickStaleSessions(io, userIds)
      .catch(err => console.error('Sessiya:', err.message))
  }

  // Boshqa tugunda ochilgan yangi buyurtma — bu yerda ham ovoz + bildirishnoma (newOrder)
  const newOrders = quiet ? [] : result.touched.filter(t => t.coll === 'orders' && t.created).map(t => t.id)
  if (newOrders.length) {
    require('../models/Order').find({ _id: { $in: newOrders }, status: { $in: ['pending', 'ready'] } })
      .then(orders => orders.forEach(o => io.emit('newOrder', o)))
      .catch(err => console.error('newOrder:', err.message))
  }
}

module.exports = { notifyApplied }

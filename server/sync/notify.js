// Sync orqali kelgan o'zgarishlar haqida ochiq ekranlarni xabardor qilish
function notifyApplied(io, result) {
  if (!io || !result?.touched?.length) return
  const colls = [...new Set(result.touched.map(t => t.coll))]
  io.emit('syncApplied', { colls })

  // Ofitsant boshqa tugunda (kassa/cloud) kirgan bo'lsa — bu yerdagi eski sessiyani chiqarish
  const userIds = result.touched.filter(t => t.coll === 'users').map(t => t.id)
  if (userIds.length) {
    require('../utils/sessions').kickStaleSessions(io, userIds)
      .catch(err => console.error('Sessiya:', err.message))
  }
}

module.exports = { notifyApplied }

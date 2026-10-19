// Sync orqali kelgan o'zgarishlar haqida ochiq ekranlarni xabardor qilish
function notifyApplied(io, result) {
  if (!io || !result?.touched?.length) return
  const colls = [...new Set(result.touched.map(t => t.coll))]
  io.emit('syncApplied', { colls })
}

module.exports = { notifyApplied }

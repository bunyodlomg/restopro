// Sozlamalarni har so'rovda bazadan o'qimaslik uchun qisqa kesh (5 soniya).
// Sozlamalar o'zgarganda invalidate() chaqiriladi.
const Settings = require('../models/Settings')

let cached = null
let at = 0
const TTL = 5000

async function get() {
  if (cached && Date.now() - at < TTL) return cached
  const doc = await Settings.findById('main')
  cached = doc?.toObject ? doc.toObject() : (doc || {})
  at = Date.now()
  return cached
}
const invalidate = () => { cached = null }

module.exports = { get, invalidate }

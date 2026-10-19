// ── Muhit o'zgaruvchilarini tekshirish ────────────────────────
// Server xavfsiz bo'lmagan sozlamalar bilan ishga tushmasligi kerak.

const WEAK_SECRETS = [
  'secret',
  'restopro_super_secret_key_2025_change_this',
]

const JWT_SECRET = process.env.JWT_SECRET || ''

if (JWT_SECRET.length < 32 || WEAK_SECRETS.includes(JWT_SECRET)) {
  console.error('❌ JWT_SECRET o\'rnatilmagan yoki juda oddiy (kamida 32 belgi kerak).')
  console.error('   Yangi kalit yaratish:  openssl rand -hex 32')
  console.error('   Natijani server/.env faylidagi JWT_SECRET= ga yozing.')
  process.exit(1)
}

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
}

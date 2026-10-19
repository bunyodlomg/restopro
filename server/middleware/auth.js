const jwt  = require('jsonwebtoken')
const User = require('../models/User')
const { JWT_SECRET } = require('../config')

// Parol almashtirilmaguncha faqat shu yo'llarga ruxsat beriladi
const PASSWORD_CHANGE_ALLOWED = ['/api/auth/me', '/api/auth/change-password']

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ message: 'Token topilmadi' })

  let payload
  try {
    payload = jwt.verify(header.split(' ')[1], JWT_SECRET)
  } catch {
    return res.status(401).json({ message: 'Token yaroqsiz yoki muddati tugagan' })
  }

  try {
    // Bloklangan yoki o'chirilgan xodim tokeni darhol ishlamay qolishi uchun
    // foydalanuvchi har so'rovda bazadan tekshiriladi (rol ham bazadan olinadi).
    const user = await User.findById(payload._id).select('name role isActive mustChangePassword')
    if (!user)
      return res.status(401).json({ message: 'Foydalanuvchi topilmadi' })
    if (!user.isActive)
      return res.status(401).json({ message: 'Akkaunt bloklangan. Adminga murojaat qiling.' })

    if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(req.originalUrl.split('?')[0]))
      return res.status(403).json({ message: 'Avval parolni o\'zgartiring', code: 'PASSWORD_CHANGE_REQUIRED' })

    req.user = { _id: user._id, role: user.role, name: user.name }
    next()
  } catch (err) {
    next(err)
  }
}

// Faqat admin uchun
module.exports.adminOnly = function(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Faqat admin uchun' })
  next()
}

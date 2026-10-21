const jwt  = require('jsonwebtoken')
const User = require('../models/User')
const { JWT_SECRET } = require('../config')
const settingsCache = require('../utils/settingsCache')
const { sessionValid, getSession, touchSession, SESSION_REPLACED } = require('../utils/sessions')

const STAFF_OFF = 'Xodimlar uchun kirish admin tomonidan vaqtincha o\'chirilgan'

// Parol almashtirilmaguncha faqat shu yo'llarga ruxsat beriladi
const PASSWORD_CHANGE_ALLOWED = ['/api/auth/me', '/api/auth/change-password']

module.exports = async function authMiddleware(req, res, next) {
  // Sotuvchi bloklagan qurilma (frontend har so'rovda x-device yuboradi)
  if (require('../license').deviceBlocked(req.get('x-device')))
    return res.status(403).json({ message: 'Bu qurilma sotuvchi tomonidan bloklangan', code: 'DEVICE_BLOCKED' })

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

    // Ofitsant: faqat hozirgi faol qurilmadagi token ishlaydi
    if (user.role !== 'admin') {
      const session = await getSession(user._id)
      if (!sessionValid(user.role, session, payload.sid))
        return res.status(401).json({ message: SESSION_REPLACED, code: 'SESSION_REPLACED' })
      if (session) touchSession(user._id, payload.sid, session).catch(() => {})
    }

    // Admin barcha xodimlar kirishini bitta tugma bilan o'chirishi mumkin
    if (user.role !== 'admin' && (await settingsCache.get()).staffAccessEnabled === false)
      return res.status(401).json({ message: STAFF_OFF, code: 'STAFF_DISABLED' })

    if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(req.originalUrl.split('?')[0]))
      return res.status(403).json({ message: 'Avval parolni o\'zgartiring', code: 'PASSWORD_CHANGE_REQUIRED' })

    req.user = { _id: user._id, role: user.role, name: user.name, sid: payload.sid }
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

module.exports.STAFF_OFF = STAFF_OFF

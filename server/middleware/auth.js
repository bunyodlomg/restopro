const jwt = require('jsonwebtoken')

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ message: 'Token topilmadi' })

  const token = header.split(' ')[1]
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret')
    next()
  } catch {
    return res.status(401).json({ message: 'Token yaroqsiz yoki muddati tugagan' })
  }
}

// Faqat admin uchun
module.exports.adminOnly = function(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ message: 'Faqat admin uchun' })
  next()
}

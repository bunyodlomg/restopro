// ── Ofitsant sessiyalari: bitta akkaunt — bitta qurilma ─────────
// Admin bir nechta joyda ochiq tura oladi (kassa + telefon), cheklov faqat ofitsantga.

const crypto = require('crypto')
const User   = require('../models/User')

const SESSION_REPLACED = 'Bu akkaunt bilan boshqa qurilmadan kirildi'

const singleSession = role => role !== 'admin'

// Token sessiyasi hali amaldami? (sessionId bo'sh — eski token, yangilanishdan oldingi)
const sessionValid = (user, sid) => !singleSession(user.role) || !user.sessionId || sid === user.sessionId

// Yangi kirish: yangi sessionId (oldingi qurilma tokeni yaroqsiz bo'ladi)
async function startSession(user) {
  if (!singleSession(user.role)) return undefined
  const sid = crypto.randomBytes(12).toString('hex')
  await User.updateOne({ _id: user._id }, { $set: { sessionId: sid } })
  return sid
}

// Eskirgan sessiyadagi ochiq socketlarni chiqarish (shu serverda kirilganda yoki sync'dan kelganda)
async function kickStaleSessions(io, userIds) {
  if (!io) return
  for (const id of userIds) {
    const user = await User.findById(id).select('role sessionId').lean()
    const sockets = await io.in(`user:${id}`).fetchSockets()
    for (const s of sockets) {
      if (user && sessionValid(user, s.data.sid)) continue
      s.emit('sessionReplaced', { message: SESSION_REPLACED })
      s.disconnect(true)
    }
  }
}

module.exports = { SESSION_REPLACED, sessionValid, startSession, kickStaleSessions }

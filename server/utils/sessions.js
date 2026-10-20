// ── Ofitsant sessiyalari: bitta akkaunt — bitta qurilma ─────────
// Ofitsant bir qurilmada faol bo'lsa, boshqa qurilmadan kira olmaydi (birinchisi ishlayveradi).
// Qurilma yopilsa / chiqilsa / admin sessiyani yopsa — akkaunt bo'shaydi.
// Admin bir nechta joyda ochiq tura oladi (kassa + telefon), cheklov faqat ofitsantga.

const crypto  = require('crypto')
const Session = require('../models/Session')

const SESSION_REPLACED = 'Sessiya tugadi: bu akkaunt bilan boshqa qurilmadan kirildi yoki admin sessiyani yopdi'
const SESSION_ACTIVE   = 'Bu akkaunt boshqa qurilmada ochiq. Avval o\'sha qurilmada chiqing yoki admin sessiyani yopsin.'

// Socket ulangan yoki so'rov yuborayotgan qurilma faol hisoblanadi; yopilgan qurilma shuncha vaqtdan keyin bo'shaydi
const ACTIVE_MS    = 3 * 60 * 1000
const HEARTBEAT_MS = 60 * 1000

const singleSession = role => role !== 'admin'

// Token sessiyasi amaldami? sid'siz (eski) token faqat sessiya hali ochilmagan bo'lsa o'tadi
function sessionValid(role, session, sid) {
  if (!singleSession(role)) return true
  return session ? session.sid === sid : !sid
}

const getSession = userId => Session.findById(userId).lean()

// Kirish: boshqa qurilmada faol sessiya bo'lsa — rad etiladi (null qaytadi)
async function startSession(user, deviceId) {
  if (!singleSession(user.role)) return { sid: undefined }
  deviceId = String(deviceId || '').slice(0, 64)
  const cur = await getSession(user._id)
  const busyElsewhere = cur && (!deviceId || cur.deviceId !== deviceId) &&
    Date.now() - new Date(cur.seenAt).getTime() < ACTIVE_MS
  if (busyElsewhere) return null

  const sid = crypto.randomBytes(12).toString('hex')
  await Session.findOneAndUpdate({ _id: user._id }, { $set: { sid, deviceId, seenAt: new Date() } }, { upsert: true })
  // Umumiy qurilmada (terminal) avvalgi ofitsant sessiyasi shu qurilma bilan birga yopiladi
  const others = deviceId ? await Session.find({ deviceId, _id: { $ne: user._id } }).select('_id').lean() : []
  if (others.length) await Session.deleteMany({ _id: { $in: others.map(o => o._id) } })
  return { sid, closed: others.map(o => o._id) }
}

async function endSession(userId, sid) {
  if (sid) await Session.deleteOne({ _id: userId, sid })
}

// Faollik belgisi (tez-tez yozmaslik uchun daqiqasiga bir marta)
async function touchSession(userId, sid, session) {
  if (session && Date.now() - new Date(session.seenAt).getTime() < HEARTBEAT_MS) return
  await Session.updateOne({ _id: userId, sid }, { $set: { seenAt: new Date() } })
}

// Eskirgan sessiyadagi ochiq socketlarni chiqarish (shu yerda kirilganda yoki sync'dan kelganda)
async function kickStaleSessions(io, userIds) {
  if (!io) return
  for (const id of userIds) {
    const sockets = await io.in(`user:${id}`).fetchSockets()
    if (!sockets.length) continue
    const session = await getSession(id)
    for (const s of sockets) {
      if (sessionValid(s.data.user?.role, session, s.data.sid)) continue
      s.emit('sessionReplaced', { message: SESSION_REPLACED })
      s.disconnect(true)
    }
  }
}

// Socket ulanib turgan ofitsantlar faol: seenAt yangilanadi (sync orqali boshqa tugun ham biladi)
function startHeartbeat(io) {
  setInterval(async () => {
    try {
      const active = new Map()
      for (const s of await io.fetchSockets()) {
        if (s.data.sid && singleSession(s.data.user?.role)) active.set(String(s.data.user._id), s.data.sid)
      }
      for (const [userId, sid] of active) await touchSession(userId, sid, null)
    } catch (err) { console.error('Sessiya:', err.message) }
  }, HEARTBEAT_MS).unref()
}

module.exports = {
  SESSION_REPLACED, SESSION_ACTIVE, ACTIVE_MS, sessionValid, getSession,
  startSession, endSession, touchSession, kickStaleSessions, startHeartbeat,
}

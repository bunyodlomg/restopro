// So'rov restoran ichidan (Wi-Fi) kelganmi?
//  - kassa (LAN) rejimi: shaxsiy tarmoq manzillari (192.168.x.x, 10.x.x.x, ...)
//  - cloud server: admin Sozlamalarda kiritgan restoran Wi-Fi tashqi IP manzillari
// QR menyu va PIN bilan kirish faqat shu holatda ishlaydi.
const settingsCache = require('./settingsCache')

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^::1$/, /^f[cd][0-9a-f]{2}:/i, /^fe80:/i]

const normIp = ip => String(ip || '').replace(/^::ffff:/, '')
const isPrivate = ip => PRIVATE.some(r => r.test(normIp(ip)))

async function isOnPremise(req) {
  const ip = normIp(req.ip)
  if (isPrivate(ip)) return true
  const s = await settingsCache.get()
  return (s.wifiIps || []).includes(ip)
}

module.exports = { isOnPremise, isPrivate, normIp }

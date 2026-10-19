// ── Login urinishlarini cheklash (brute-force himoyasi) ───────
// IP + username bo'yicha: MAX_FAILS marta noto'g'ri urinishdan keyin
// LOCK_MS davomida bloklanadi. Xotirada saqlanadi (bitta server uchun yetarli).

const MAX_FAILS = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCK_MS   = 15 * 60 * 1000

const attempts = new Map()   // key → { fails, first, lockedUntil }

const keyOf = (req) => `${req.ip}|${String(req.body?.username || '').toLowerCase().trim()}`

function check(req, res, next) {
  const rec = attempts.get(keyOf(req))
  if (rec?.lockedUntil && rec.lockedUntil > Date.now()) {
    const min = Math.ceil((rec.lockedUntil - Date.now()) / 60000)
    return res.status(429).json({ message: `Juda ko'p noto'g'ri urinish. ${min} daqiqadan keyin qayta urining.` })
  }
  next()
}

function fail(req) {
  const key = keyOf(req)
  const now = Date.now()
  let rec = attempts.get(key)
  if (!rec || now - rec.first > WINDOW_MS) rec = { fails: 0, first: now, lockedUntil: 0 }
  rec.fails += 1
  if (rec.fails >= MAX_FAILS) rec.lockedUntil = now + LOCK_MS
  attempts.set(key, rec)
}

function success(req) {
  attempts.delete(keyOf(req))
}

// Eski yozuvlarni tozalash — xotira cheksiz o'smasligi uchun
setInterval(() => {
  const now = Date.now()
  for (const [k, r] of attempts)
    if (now - r.first > WINDOW_MS && (!r.lockedUntil || r.lockedUntil < now)) attempts.delete(k)
}, 10 * 60 * 1000).unref()

module.exports = { check, fail, success }

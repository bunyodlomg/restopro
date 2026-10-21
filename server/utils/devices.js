// ── Qurilmalar ro'yxati (sotuvchi panelida ko'rinadi, alohida bloklash mumkin) ──
// Har ekran (brauzer / telefon / ofitsant terminali / kassa oynasi) localStorage'da o'z ID'siga ega
// (frontend/src/utils/terminal.js → deviceId). Kirishda va socket ulanganda shu yerga yoziladi.
// Faqat shu tugunda (kassa yoki cloud) saqlanadi — sync qilinmaydi; sotuvchiga statistikada boradi.

const mongoose = require('mongoose')

const coll = () => mongoose.connection.collection('devices')
const APPS = ['kassa', 'terminal', 'web']
const KEEP_DAYS = 30
const seen = new Map()   // tez-tez yozmaslik: qurilma → oxirgi yozilgan vaqt

async function touch(id, { app, user, role, ip, ua, ver, upd, updErr } = {}) {
  id = String(id || '').slice(0, 64)
  if (!id) return
  const now = Date.now()
  const key = `${id}|${user || ''}|${ver || ''}|${upd || ''}`
  if (now - (seen.get(key) || 0) < 60000) return
  seen.set(key, now)
  await coll().updateOne({ _id: id }, {
    $set: {
      app: APPS.includes(app) ? app : 'web', lastSeen: new Date(now),
      ...(user ? { user: String(user).slice(0, 40), role: String(role || '').slice(0, 20) } : {}),
      ...(ip ? { ip: String(ip).slice(0, 45) } : {}),
      ...(ua ? { ua: shortUa(ua) } : {}),
      ...(ver ? { ver: String(ver).slice(0, 20), upd: String(upd || '').slice(0, 20), updErr: String(updErr || '').slice(0, 120) } : {}),
    },
  }, { upsert: true })
}

// "Chrome · Android" kabi qisqa ko'rinish
function shortUa(ua) {
  ua = String(ua)
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  const br = /Electron/.test(ua) ? 'Ilova' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [br, os].filter(Boolean).join(' · ').slice(0, 40)
}

// Sotuvchiga: oxirgi 30 kunda ko'ringan, eng yangi 25 tasi (ixcham)
async function list(limit = 25) {
  const since = new Date(Date.now() - KEEP_DAYS * 86400000)
  const rows = await coll().find({ lastSeen: { $gt: since } }).sort({ lastSeen: -1 }).limit(limit).toArray()
  return rows.map(d => ({ i: d._id, a: d.app, u: d.user || '', r: d.role || '', d: d.ua || '', s: d.lastSeen, v: d.ver || '', us: d.upd || '', ue: d.updErr || '' }))
}

module.exports = { touch, list }

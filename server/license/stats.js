// ── Litsenziya serveriga holat hisoboti ───────────────────────
// Sotuvchi admin panelida ko'rinadi: qurilmalar (online/offline), ulangan ekranlar,
// ofitsantlar soni va hozir ishlayotganlari. Faqat raqamlar — mijoz ma'lumotlari yuborilmaydi.

const mongoose = require('mongoose')

const nodes = () => mongoose.connection.collection('sync_nodes')

// Ulangan ekranlar: qurilma bo'yicha (bitta brauzer bir nechta socket ochadi)
async function devices(io) {
  const seen = { kassa: new Set(), terminal: new Set(), web: new Set() }
  if (io) {
    for (const s of await io.fetchSockets()) {
      const app = seen[s.data.app] ? s.data.app : 'web'
      seen[app].add(s.data.device || s.id)
    }
  }
  return Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.size]))
}

async function localStats(io) {
  const User = mongoose.model('User')
  const Session = mongoose.model('Session')
  const { ACTIVE_MS } = require('../utils/sessions')
  const [waiters, admins, waitersOnline, dev] = await Promise.all([
    User.countDocuments({ role: { $ne: 'admin' }, isActive: true }),
    User.countDocuments({ role: 'admin', isActive: true }),
    Session.countDocuments({ seenAt: { $gt: new Date(Date.now() - ACTIVE_MS) } }),
    devices(io),
  ])
  return { waiters, admins, waitersOnline, devices: dev }
}

// Cloud: o'zi + unga ulangan kassalar (sync orqali tanilgan)
async function report(io) {
  const own = await localStats(io)
  const list = await nodes().find().sort({ lastSeen: -1 }).limit(20).toArray()
  return {
    ...own,
    nodes: list.map(n => ({ id: n._id, version: n.version || '', lastSeen: n.lastSeen, devices: n.stats?.devices || {}, health: n.stats?.health })),
  }
}

// Kassa cloud'ga murojaat qildi — "oxirgi aloqa" va uning ekranlari
async function recordNode(id, { version, stats } = {}) {
  if (!id) return
  const set = { lastSeen: new Date() }
  if (version) set.version = String(version).slice(0, 20)
  if (stats) {
    try {
      const s = typeof stats === 'string' ? JSON.parse(stats) : stats
      set.stats = {
        devices: Object.fromEntries(Object.entries(s?.devices || {}).slice(0, 10).map(([k, v]) => [String(k).slice(0, 20), Math.max(0, +v || 0)])),
        health: cleanHealth(s?.health),
      }
    } catch {}
  }
  await nodes().updateOne({ _id: String(id).slice(0, 40) }, { $set: set }, { upsert: true })
}

// Kassa sog'ligi (sync navbati, ziddiyatlar, soat farqi, litsenziya holati) — faqat raqam va qisqa matn
const int = v => Math.round(Math.max(-1e9, Math.min(1e9, Number(v) || 0)))
const short = (v, max) => (v == null ? null : String(v).slice(0, max))
function cleanHealth(h) {
  if (!h || typeof h !== 'object') return undefined
  return {
    online: !!h.online, initialized: !!h.initialized, pending: int(h.pending), conflicts: int(h.conflicts), merged: int(h.merged),
    clockOffset: int(h.clockOffset), lastSyncAt: h.lastSyncAt && !isNaN(new Date(h.lastSyncAt)) ? new Date(h.lastSyncAt).toISOString() : null,
    lastError: short(h.lastError, 120), license: short(h.license, 20), lastCmd: short(h.lastCmd, 40),
  }
}

module.exports = { localStats, report, recordNode, cleanHealth }

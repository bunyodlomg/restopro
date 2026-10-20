// ── Sync mijozi (kassa / Electron tomonida) ───────────────────
// Real vaqtga yaqin: cloud'dagi o'zgarish "long-poll" (/api/sync/wait) orqali darhol keladi,
// kassadagi o'zgarish 1 soniya ichida yuboriladi. Har SYNC_INTERVAL soniyada zaxira tekshiruv.
// Internet bo'lmasa hech narsa buzilmaydi: hammasi lokal ishlayveradi,
// ulanish tiklanganda navbatdagi o'zgarishlar avtomatik yuboriladi.

const fs       = require('fs')
const path     = require('path')
const mongoose = require('mongoose')
const engine   = require('./engine')
const { notifyApplied } = require('./notify')

const SYNC_URL    = (process.env.SYNC_URL || '').replace(/\/+$/, '')
const SYNC_KEY    = process.env.SYNC_KEY || ''
const REMOTE_ID   = process.env.SYNC_REMOTE_ID || 'cloud'
const INTERVAL_MS = Math.max(5, parseInt(process.env.SYNC_INTERVAL, 10) || 15) * 1000
const { UPLOAD_DIR } = require('../config')
const TIMEOUT_MS  = 20000

const stateColl = () => mongoose.connection.collection('sync_state')

const status = {
  enabled: !!SYNC_URL,
  online: false,
  initialized: false,     // kamida bir marta to'liq olingan (pull) — undan oldin API yopiq
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  pending: 0,             // hali yuborilmagan lokal o'zgarishlar
  conflicts: [],
}

async function getState() {
  return { pushed: 0, pulled: 0, ...(await stateColl().findOne({ _id: 'client' })) }
}
async function saveState(patch) {
  await stateColl().updateOne({ _id: 'client' }, { $set: patch }, { upsert: true })
}

async function request(method, urlPath, { body, type, raw } = {}) {
  const res = await fetch(SYNC_URL + urlPath, {
    method,
    headers: { 'x-sync-key': SYNC_KEY, ...(type ? { 'content-type': type } : {}) },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (method === 'HEAD') return res.status
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${(await res.text()).slice(0, 200)}`)
  return raw ? Buffer.from(await res.arrayBuffer()) : engine.decode(await res.text())
}

// Lokal fayllarni cloud'ga yuklash (cloud'da yo'qlarini)
async function pushFiles(items) {
  for (const name of engine.uploadRefs(items)) {
    const file = path.join(UPLOAD_DIR, name)
    if (!fs.existsSync(file)) continue
    if (await request('HEAD', `/api/sync/file/${name}`) === 200) continue
    await request('PUT', `/api/sync/file/${name}`, { body: fs.readFileSync(file), type: 'application/octet-stream' })
  }
}

// Cloud'dagi fayllarni yuklab olish (lokalda yo'qlarini)
async function pullFiles(items) {
  for (const name of engine.uploadRefs(items)) {
    const file = path.join(UPLOAD_DIR, name)
    if (fs.existsSync(file)) continue
    try {
      const res = await fetch(`${SYNC_URL}/uploads/${name}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.ok) fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    } catch { /* keyingi safar */ }
  }
}

async function push() {
  let { pushed } = await getState()
  for (;;) {
    const { items, cursor, more } = await engine.collectChanges(pushed, REMOTE_ID)
    if (!items.length) break
    await pushFiles(items)
    const r = await request('POST', '/api/sync/push', {
      body: engine.encode({ node: engine.NODE_ID, items }), type: 'application/ejson',
    })
    if (r.conflicts?.length) addConflicts(r.conflicts.map(c => ({ ...c, side: 'cloud' })))
    pushed = cursor
    await saveState({ pushed })
    if (!more) break
  }
}

async function pull(io) {
  let { pulled } = await getState()
  for (;;) {
    const { items, cursor, more } = await request('GET', `/api/sync/pull?since=${pulled}&node=${encodeURIComponent(engine.NODE_ID)}`)
    if (items.length) {
      await pullFiles(items)
      const result = await engine.applyChanges(items)
      if (result.conflicts.length) addConflicts(result.conflicts.map(c => ({ ...c, side: 'kassa' })))
      // Birinchi to'liq yuklashda eski ochiq buyurtmalar uchun ovoz chalinmasin
      notifyApplied(io, result, { quiet: !status.initialized })
      // Cloud'da yaratilgan chek/talon — kutmasdan printerga
      if (result.touched.some(t => t.coll === 'printjobs')) require('../print').kick()
    }
    pulled = cursor
    await saveState({ pulled })
    if (!more) break
  }
}

function addConflicts(list) {
  status.conflicts = [...list.map(c => ({ ...c, at: new Date() })), ...status.conflicts].slice(0, 50)
  for (const c of list) console.warn(`⚠️  sync ziddiyati (${c.side}) ${c.coll}/${c.id}: ${c.error}`)
}

async function countPending() {
  const { pushed } = await getState()
  let n = 0
  for (const name of engine.MODELS) {
    n += await mongoose.model(name).collection.countDocuments({ _seq: { $gt: pushed }, _origin: { $ne: REMOTE_ID } })
  }
  n += await mongoose.connection.collection('sync_tombstones').countDocuments({ _seq: { $gt: pushed }, _origin: { $ne: REMOTE_ID } })
  return n
}

let again = false
async function tick(io) {
  if (status.syncing) { again = true; return }   // hozirgi tugagach yana bir marta
  status.syncing = true
  try {
    await push()
    await pull(io)
    const wasOffline = !status.online
    status.online = true
    status.lastSyncAt = new Date()
    status.lastError = null
    if (!status.initialized) {
      status.initialized = true
      await saveState({ initialized: true })
      console.log('✅ sync: birinchi sinxronlash tugadi')
    }
    if (wasOffline) io?.emit('syncStatus', publicStatus())
  } catch (err) {
    const wasOnline = status.online
    status.online = false
    status.lastError = err.cause?.code || err.name === 'TimeoutError' ? 'Internet yo\'q' : err.message
    if (wasOnline) { console.warn('📴 sync: offline —', status.lastError); io?.emit('syncStatus', publicStatus()) }
  } finally {
    status.pending = await countPending().catch(() => status.pending)
    lastLocalSeq = await localSeq().catch(() => lastLocalSeq)
    status.syncing = false
    if (again) { again = false; setImmediate(() => tick(io)) }
  }
}

// ── Darhol sinxronlash ─────────────────────────────────────────
const localSeq = async () => (await mongoose.connection.collection('sync_counters').findOne({ _id: 'seq' }))?.v || 0
let lastLocalSeq = 0

// Kassada nimadir yozildi (buyurtma, chek holati) — 1 soniya ichida cloud'ga
function watchLocal(io) {
  setInterval(async () => {
    try { if (!status.syncing && (await localSeq()) !== lastLocalSeq) tick(io) } catch {}
  }, 1000).unref()
}

// Cloud'da o'zgarish bo'lishi bilan javob keladi (long-poll) — darhol olamiz
async function watchRemote(io) {
  let seq = 0
  for (;;) {
    try {
      const res = await fetch(`${SYNC_URL}/api/sync/wait?seq=${seq}`, { headers: { 'x-sync-key': SYNC_KEY }, signal: AbortSignal.timeout(40000) })
      if (res.status === 404) return   // eski cloud versiyasi — faqat davriy sync
      if (!res.ok) throw new Error(String(res.status))
      const { seq: next } = await res.json()
      if (next !== seq) { seq = next; tick(io) }
    } catch {
      await new Promise(r => setTimeout(r, 5000))   // internet yo'q — biroz kutib qayta
    }
  }
}

function publicStatus() {
  return {
    enabled: status.enabled, online: status.online, initialized: status.initialized,
    lastSyncAt: status.lastSyncAt, lastError: status.lastError,
    pending: status.pending, conflicts: status.conflicts.length,
  }
}

async function start(io) {
  if (!SYNC_URL) return
  if (SYNC_KEY.length < 32) throw new Error('SYNC_KEY kamida 32 belgi bo\'lishi kerak')
  status.initialized = !!(await getState()).initialized
  console.log(`🔁 sync: ${SYNC_URL} (har ${INTERVAL_MS / 1000}s)`)
  tick(io)
  setInterval(() => tick(io), INTERVAL_MS).unref()
  watchLocal(io)
  watchRemote(io)
}

// Hech qachon cloud bilan sinxronlanmagan kassada API yopiq turadi:
// aks holda lokal standart sozlamalar/admin cloud'dagilar bilan to'qnashadi.
function requireInitialized(req, res, next) {
  if (!status.enabled || status.initialized) return next()
  if (req.path === '/health' || req.path.startsWith('/api/sync/')) return next()
  res.status(503).json({
    message: 'Birinchi sinxronlash kutilmoqda — kompyuterni internetga ulang',
    code: 'SYNC_NOT_INITIALIZED',
  })
}

module.exports = { start, tick, publicStatus, requireInitialized, status }

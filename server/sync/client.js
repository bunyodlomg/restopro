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
const { setClockOffset } = require('./plugin')

const SYNC_URL    = (process.env.SYNC_URL || '').replace(/\/+$/, '')
const SYNC_KEY    = process.env.SYNC_KEY || ''
const INTERVAL_MS = Math.max(5, parseInt(process.env.SYNC_INTERVAL, 10) || 15) * 1000
const { UPLOAD_DIR } = require('../config')
const TIMEOUT_MS  = 20000

const stateColl = () => mongoose.connection.collection('sync_state')
// Har bir hujjatning cloud bilan oxirgi kelishilgan versiyasi — ikki tomonda bir vaqtda
// o'zgarganda birlashtirish uchun asos (engine.decide / resolve.js)
const shadowColl = () => mongoose.connection.collection('sync_shadow')
const SHADOW_DAYS = 14   // shundan beri o'zgarmagan hujjatlarning asosi kerak emas

const status = {
  enabled: !!SYNC_URL,
  online: false,
  initialized: false,     // kamida bir marta to'liq olingan (pull) — undan oldin API yopiq
  syncing: false,
  lastSyncAt: null,
  lastError: null,
  pending: 0,             // hali yuborilmagan lokal o'zgarishlar
  merged: 0,              // ikki tomonda o'zgarib, birlashtirilgan hujjatlar
  clockOffset: 0,         // cloud soati - kassa soati (ms)
  conflicts: 0,           // qo'llab bo'lmagan yozuvlar (sync_retry) — keyin qayta uriniladi
}

async function getState() {
  return { pushed: 0, pulled: 0, ...(await stateColl().findOne({ _id: 'client' })) }
}
async function saveState(patch) {
  await stateColl().updateOne({ _id: 'client' }, { $set: patch }, { upsert: true })
}

async function saveShadows(list) {
  if (!list.length) return
  await shadowColl().bulkWrite(list.map(({ coll, doc }) => ({
    replaceOne: { filter: { _id: { c: coll, i: doc._id } }, replacement: { doc, at: new Date() }, upsert: true },
  })), { ordered: false })
}
async function attachBases(items) {
  const docs = items.filter(it => it.t === 'doc')
  if (!docs.length) return
  const found = await shadowColl().find({ $or: docs.map(it => ({ _id: { c: it.coll, i: it.doc._id } })) }).toArray()
  const byKey = new Map(found.map(s => [`${s._id.c}:${s._id.i}`, s.doc]))
  for (const it of docs) {
    const base = byKey.get(`${it.coll}:${it.doc._id}`)
    if (base) it.base = base
  }
}

// ── Soat farqi: kassa _mtime'ni cloud vaqti bilan yozadi ──
// Har sync javobida cloud vaqti (x-time) keladi; eng tez javobdagi o'lchov eng aniq.
let bestRtt = Infinity
async function measureClock(res, startedAt) {
  const serverTime = Number(res.headers.get('x-time'))
  if (!serverTime) return
  const end = Date.now()
  const rtt = end - startedAt
  if (rtt > 3000 || rtt > bestRtt * 2) return
  bestRtt = Math.min(bestRtt, rtt)
  const offset = serverTime + rtt / 2 - end
  setClockOffset(offset)
  if (Math.abs(offset - (status.clockOffset || 0)) > 1000) {
    if (Math.abs(offset) > 60000) console.warn(`🕒 sync: kassa soati cloud'dan ${Math.round(offset / 1000)} s farq qiladi — tuzatib yozilmoqda`)
    status.clockOffset = Math.round(offset)
    await saveState({ clockOffset: status.clockOffset }).catch(() => {})
  }
}

async function request(method, urlPath, { body, type, raw } = {}) {
  const startedAt = Date.now()
  const res = await fetch(SYNC_URL + urlPath, {
    method,
    headers: { 'x-sync-key': SYNC_KEY, 'x-node': engine.NODE_ID, ...(type ? { 'content-type': type } : {}) },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  await measureClock(res, startedAt)
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

// ── Qo'llab bo'lmagan yozuvlar (sync_retry) — keyingi safar qayta uriniladi, yo'qolmaydi ──
// push: cloud qabul qilmagan kassa hujjati (kursor o'tib ketgan — qayta yuboriladi)
// pull: kassaga yozib bo'lmagan cloud hujjati (odatda cloud ziddiyatni hal qilgach o'tadi)
const retryColl = () => mongoose.connection.collection('sync_retry')
async function settleRetries(side, items, conflicts) {
  const ids = items.filter(it => it.t === 'doc').map(it => ({ c: it.coll, i: it.doc._id }))
  if (ids.length) await retryColl().deleteMany({ _id: { $in: ids.map(k => ({ ...k, s: side })) } })
  for (const c of conflicts || []) {
    const it = items.find(x => x.t === 'doc' && x.coll === c.coll && String(x.doc._id) === c.id)
    if (!it) continue
    await retryColl().replaceOne({ _id: { c: c.coll, i: it.doc._id, s: side } },
      { side, coll: c.coll, error: String(c.error).slice(0, 300), at: new Date(), ...(side === 'pull' ? { item: it } : {}) }, { upsert: true })
    console.warn(`⚠️  sync: ${c.coll}/${c.id} ${side === 'push' ? "cloud qabul qilmadi" : "kassaga yozilmadi"} — keyin qayta uriniladi: ${c.error}`)
  }
}
async function pushRetries() {
  const list = await retryColl().find({ side: 'push' }).toArray()
  const out = []
  for (const r of list) {
    const doc = await mongoose.connection.collection(r._id.c).findOne({ _id: r._id.i })
    if (doc) out.push({ t: 'doc', coll: r._id.c, seq: doc._seq, doc })
    else await retryColl().deleteOne({ _id: r._id })   // o'chirilgan — yuborish shart emas
  }
  return out
}

async function push() {
  let { pushed } = await getState()
  let retry = await pushRetries()
  for (;;) {
    const { items: fresh, cursor, more } = await engine.collectChanges(pushed, null, engine.NODE_ID)
    const same = (a, b) => a.coll === b.coll && String(a.doc?._id) === String(b.doc?._id)
    const items = [...fresh, ...retry.filter(r => !fresh.some(f => same(f, r)))]
    retry = []
    if (!items.length) break
    await pushFiles(items)
    await attachBases(items)
    const r = await request('POST', '/api/sync/push', {
      body: engine.encode({ node: engine.NODE_ID, items }), type: 'application/ejson',
    })
    await settleRetries('push', items, r.conflicts)
    // Cloud endi shu versiyani biladi — keyingi o'zgarish shunga nisbatan birlashtiriladi
    await saveShadows(items.filter(it => it.t === 'doc' && !r.conflicts?.some(c => c.id === String(it.doc._id)))
      .map(it => ({ coll: it.coll, doc: it.doc })))
    pushed = cursor
    await saveState({ pushed })
    if (!more) break
  }
}

async function pull(io) {
  let { pulled, pushed } = await getState()
  for (;;) {
    const { items, cursor, more, reset } = await request('GET', `/api/sync/pull?since=${pulled}&node=${encodeURIComponent(engine.NODE_ID)}`)
    if (reset) {
      // Kassa uzoq o'chiq turgan: cloud eski o'chirish belgilarini tozalagan — boshidan olamiz
      console.log("🔁 sync: kassa uzoq ulanmagan — to'liq qayta sinxronlash")
      pulled = 0
      await saveState({ pulled, cleanup: true })
      continue
    }
    if (items.length) await applyPulled(io, items, pushed)
    pulled = cursor
    await saveState({ pulled })
    if (!more) break
  }
  // Avval yozib bo'lmaganlar — odatda cloud ziddiyatni hal qilib, qayta nomlangan hujjat endi keldi
  const retry = (await retryColl().find({ side: 'pull' }).toArray()).map(r => r.item).filter(Boolean)
  if (retry.length) await applyPulled(io, retry, pushed)
  if ((await getState()).cleanup) {
    await removeOrphans(pushed)
    await saveState({ cleanup: false })
  }
}

// To'liq qayta sinxronlashdan keyin: cloud'da yo'q (u yerda o'chirilgan) hujjatlarni kassadan ham olib tashlash.
// Kassada yaratilganlariga tegilmaydi — ma'lumot yo'qolmasin (cloud qabul qila olmagan bo'lishi mumkin).
async function removeOrphans(pushed) {
  let removed = 0
  for (const name of engine.MODELS) {
    const coll = mongoose.model(name).collection
    const { ids } = await request('GET', `/api/sync/ids?coll=${coll.collectionName}`)
    const remote = new Set(ids.map(String))
    const local = await coll.find({}, { projection: { _id: 1, _origin: 1, _seq: 1 } }).toArray()
    const orphans = local.filter(d => !remote.has(String(d._id)) && d._origin !== engine.NODE_ID).map(d => d._id)
    if (!orphans.length) continue
    await coll.deleteMany({ _id: { $in: orphans } })   // to'g'ridan-to'g'ri: o'chirish belgisi yozilmaydi (cloud'da allaqachon yo'q)
    await shadowColl().deleteMany({ _id: { $in: orphans.map(i => ({ c: coll.collectionName, i })) } })
    removed += orphans.length
  }
  if (removed) console.log(`🧹 sync: cloud'da o'chirilgan ${removed} ta yozuv kassadan ham olib tashlandi`)
}

async function applyPulled(io, items, pushed) {
  await pullFiles(items)
  const shadows = []
  const result = await engine.applyChanges(items, {
    edge: { pushed, baseOf: async (coll, id) => (await shadowColl().findOne({ _id: { c: coll, i: id } }))?.doc },
    onApplied: (coll, doc) => { shadows.push({ coll, doc }) },
  })
  await saveShadows(shadows)
  await settleRetries('pull', items, result.conflicts)
  status.merged += result.merged
  // Birinchi to'liq yuklashda eski ochiq buyurtmalar uchun ovoz chalinmasin
  notifyApplied(io, result, { quiet: !status.initialized })
  // Cloud'da yaratilgan chek/talon — kutmasdan printerga
  if (result.touched.some(t => t.coll === 'printjobs')) require('../print').kick()
}

async function countPending() {
  const { pushed } = await getState()
  let n = 0
  for (const name of engine.MODELS) {
    n += await mongoose.model(name).collection.countDocuments({ _seq: { $gt: pushed }, _origin: engine.NODE_ID })
  }
  n += await mongoose.connection.collection('sync_tombstones').countDocuments({ _seq: { $gt: pushed }, _origin: engine.NODE_ID })
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
    status.conflicts = await retryColl().countDocuments().catch(() => status.conflicts)
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
      const res = await fetch(`${SYNC_URL}/api/sync/wait?seq=${seq}`, { headers: { 'x-sync-key': SYNC_KEY, 'x-node': engine.NODE_ID }, signal: AbortSignal.timeout(40000) })
      if (res.status === 404) return   // eski cloud versiyasi — faqat davriy sync
      if (!res.ok) throw new Error(String(res.status))
      const { seq: next } = await res.json()
      if (next !== seq) { seq = next; tick(io) }
    } catch {
      await new Promise(r => setTimeout(r, 5000))   // internet yo'q — biroz kutib qayta
    }
  }
}

// Sotuvchi buyrug'i: cloud'dagi hamma narsani qaytadan olish (kassada tafovut bo'lsa).
// Avval lokal o'zgarishlar yuboriladi (tick push'dan boshlanadi), so'ng since=0 dan pull —
// kassa cloud bilan to'liq tenglashadi, yuborilmagan lokal o'zgarishlar birlashtiriladi.
async function resync(io) {
  if (!SYNC_URL) return
  await saveState({ pulled: 0, cleanup: true })
  console.log("🔁 sync: to'liq qayta sinxronlash (sotuvchi buyrug'i)")
  await tick(io)
}

// Sotuvchi panelida ko'rinadigan sog'lik ko'rsatkichlari
function health() {
  return {
    online: status.online, initialized: status.initialized, pending: status.pending,
    lastSyncAt: status.lastSyncAt, conflicts: status.conflicts, merged: status.merged,
    clockOffset: status.clockOffset, lastError: status.online ? null : status.lastError,
  }
}

function publicStatus() {
  return {
    enabled: status.enabled, online: status.online, initialized: status.initialized,
    lastSyncAt: status.lastSyncAt, lastError: status.lastError,
    pending: status.pending, conflicts: status.conflicts,
    merged: status.merged, clockOffset: status.clockOffset,
  }
}

async function start(io) {
  if (!SYNC_URL) return
  if (SYNC_KEY.length < 32) throw new Error('SYNC_KEY kamida 32 belgi bo\'lishi kerak')
  const st = await getState()
  status.initialized = !!st.initialized
  if (st.clockOffset) { status.clockOffset = st.clockOffset; setClockOffset(st.clockOffset) }
  // Eski asoslarni tozalash (kuniga bir marta)
  const purge = async () => {
    await shadowColl().deleteMany({ at: { $lt: new Date(Date.now() - SHADOW_DAYS * 86400000) } }).catch(() => {})
    await engine.purgeTombstonesEdge((await getState()).pushed).catch(() => {})
  }
  purge(); setInterval(purge, 86400000).unref()
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

module.exports = { start, tick, pull, resync, health, publicStatus, requireInitialized, status }

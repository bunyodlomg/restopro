// ── Sync: o'zgarishlarni yig'ish va qo'llash ──────────────────
// Ikkala tugunda (kassa va cloud) bir xil ishlaydi.
// Ziddiyat qoidasi: ikki tomonda o'zgargan hujjat birlashtiriladi (resolve.js);
// asos (base) bo'lmasa — _mtime kattaroq yutadi (teng bo'lsa — _origin bo'yicha).

const mongoose = require('mongoose')
const { EJSON } = mongoose.mongo.BSON
const { NODE_ID, nextSeq, recordTombstones, tombstones, counters, syncNow } = require('./plugin')
const { merge3, sameData, sameVersion } = require('./resolve')
const { resolveUnique } = require('./unique')
require('../models/SyncNotice')

// Sinxronlanadigan modellar
const MODELS = ['User', 'Session', 'Category', 'Product', 'Ingredient', 'Order', 'Table', 'Salary', 'Purchase', 'Settings', 'Reservation', 'GuestOrder', 'PrintJob', 'SyncNotice']
const BATCH = 500

const models = () => MODELS.map(name => mongoose.model(name))
const modelByColl = coll => models().find(m => m.collection.collectionName === coll)

// Hujjat b'dan yangiroqmi?
function newer(a, b) {
  const ta = new Date(a._mtime || 0).getTime()
  const tb = new Date(b._mtime || 0).getTime()
  if (ta !== tb) return ta > tb
  return String(a._origin || '') > String(b._origin || '')
}

// Eski (sync'dan oldingi) hujjatlarga belgi qo'yish — bir marta
async function migrate() {
  for (const M of models()) {
    const missing = await M.collection.find({ _seq: { $exists: false } }, { projection: { _id: 1, updatedAt: 1 } }).toArray()
    if (!missing.length) continue
    const last = await nextSeq(missing.length)
    await M.collection.bulkWrite(missing.map((d, i) => ({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { _seq: last - missing.length + 1 + i, _mtime: d.updatedAt || new Date(), _origin: NODE_ID } },
      },
    })))
    console.log(`🔁 sync: ${M.modelName} — ${missing.length} ta eski hujjat belgilandi`)
  }
}

// since dan keyingi o'zgarishlar (exceptOrigin tugunida qilinganlaridan tashqari)
// exceptOrigin — shu tugunnikini bermaslik (cloud → kassa: kassaning o'zinikini qaytarmaydi)
// onlyOrigin — faqat shu tugunniki (kassa → cloud: faqat kassada yozilgani; cloud'dan kelganini
// qaytarib yubormaydi — aks holda ikki va undan ko'p kassada hujjatlar cheksiz aylanib qoladi)
async function collectChanges(since, exceptOrigin, onlyOrigin) {
  const filter = { _seq: { $gt: since } }
  if (onlyOrigin) filter._origin = onlyOrigin
  else if (exceptOrigin) filter._origin = { $ne: exceptOrigin }

  const items = []
  for (const M of models()) {
    const docs = await M.collection.find(filter).sort({ _seq: 1 }).limit(BATCH).toArray()
    for (const doc of docs) items.push({ t: 'doc', coll: M.collection.collectionName, seq: doc._seq, doc })
  }
  const tombs = await tombstones().find(filter).sort({ _seq: 1 }).limit(BATCH).toArray()
  for (const tb of tombs) items.push({ t: 'del', coll: tb.coll, seq: tb._seq, id: tb.docId, _mtime: tb._mtime, _origin: tb._origin })

  // Barcha kolleksiyalardan eng kichik BATCH tasi — kursor bo'shliqsiz siljishi uchun
  items.sort((a, b) => a.seq - b.seq)
  const batch = items.slice(0, BATCH)
  const cursor = batch.length ? batch[batch.length - 1].seq : since
  return { items: batch, cursor, more: items.length > BATCH || batch.length === BATCH }
}

// ── Kelgan hujjatni joriysi bilan solishtirib, nima yozilishini hal qilish ──
// → { write, merged } yoki null (o'tkazib yuborish)
//
// Cloud (hub): kassa doc bilan birga base'ni yuboradi (kassa oxirgi marta cloud bilan kelishgan versiya).
//   joriy == base → kassa o'zgarishi to'g'ridan-to'g'ri; aks holda uch tomonlama birlashtirish,
//   natija cloud nomidan yoziladi — shu bilan kassaga ham qaytadi.
// Kassa (edge): cloud — haqiqat manbai. Lokal hujjatda hali yuborilmagan o'zgarish bo'lsa,
//   shadow'ga nisbatan birlashtiriladi va kassa nomidan yoziladi (keyingi push'da cloud'ga ketadi).
// base yo'q (eski kassa versiyasi / juda eski hujjat) — avvalgidek yangirog'i yutadi.
function decide(coll, cur, doc, { base, edge }) {
  if (!cur) return { write: doc }
  // Aynan shu versiya allaqachon bor (qaytib kelgan nusxa) — qayta yozilmaydi, yangi _seq olmaydi
  if (sameVersion(cur, doc)) return null
  if (edge) {
    const unpushed = cur._origin === NODE_ID && cur._seq > edge.pushed
    if (!unpushed) return { write: doc }
    if (!base) return newer(doc, cur) ? { write: doc } : null
    return mergedWrite(coll, base, cur, doc)
  }
  if (!base) return newer(doc, cur) ? { write: doc } : null
  if (sameVersion(cur, base)) return { write: doc }
  return mergedWrite(coll, base, cur, doc)
}

function mergedWrite(coll, base, cur, doc) {
  const m = merge3(coll, base, cur, doc, newer(doc, cur))
  if (sameData(m, cur)) return null   // kelgan o'zgarish allaqachon bor
  if (sameData(m, doc)) return { write: doc }
  return { write: { ...m, _mtime: syncNow(), _origin: NODE_ID }, merged: true }
}

// Boshqa tugundan kelgan o'zgarishlarni qo'llash.
// opts.edge = { pushed, baseOf } — kassa tomonida (cloud'dan kelganini qo'llash)
// opts.onApplied(coll, doc) — kassa shadow'ni yangilashi uchun
async function applyChanges(items, opts = {}) {
  const result = { applied: 0, skipped: 0, merged: 0, conflicts: [], touched: [] }
  for (const it of items) {
    const M = modelByColl(it.coll)
    if (!M) { result.skipped++; continue }
    const coll = M.collection

    if (it.t === 'del') {
      const cur = await coll.findOne({ _id: it.id }, { projection: { _mtime: 1, _origin: 1 } })
      if (cur && newer(cur, it)) { result.skipped++; continue }   // keyin tahrirlangan — saqlab qolamiz
      if (cur) await coll.deleteOne({ _id: it.id })
      await recordTombstones(it.coll, [it.id], it._mtime, it._origin)
      result.applied++
      result.touched.push({ coll: it.coll, id: String(it.id), deleted: true })
      continue
    }

    const doc = it.doc
    const cur = await coll.findOne({ _id: doc._id })
    // Kassada asos — o'zining shadow'i (cloud bilan oxirgi kelishilgan versiya)
    const base = opts.edge ? cur && await opts.edge.baseOf?.(it.coll, doc._id) : it.base
    const d = decide(it.coll, cur, doc, { base, edge: opts.edge })
    if (!d) {
      result.skipped++
      if (opts.edge) await opts.onApplied?.(it.coll, doc)   // cloud versiyasi — keyingi birlashtirish uchun asos
      continue
    }

    // Bu bazada yangi _seq beramiz; _origin saqlanadi — qaytib jo'natilmasligi uchun
    // (birlashtirilgan bo'lsa — shu tugun nomidan, boshqa tomonga ham borishi uchun)
    const local = { ...d.write, _seq: await nextSeq() }
    try {
      await coll.replaceOne({ _id: doc._id }, local, { upsert: true })
      await opts.onApplied?.(it.coll, doc)
      result.applied++
      if (d.merged) {
        result.merged++
        console.log(`🔀 sync: ${it.coll}/${doc._id} — ikki tomondagi o'zgarishlar birlashtirildi`)
      }
      result.touched.push({ coll: it.coll, id: String(doc._id), created: !cur })
    } catch (e) {
      let err = e
      // Unique ziddiyati: ikkala tomonda bir xil login / stol raqami yaratilgan.
      // Cloud o'zi hal qiladi (kelganini qayta nomlaydi); kassa javobni kutadi (opts.onConflict — keyin qayta urinadi)
      const fixed = !opts.edge && await resolveUnique(it.coll, coll, local, err).catch(() => null)
      if (fixed) {
        try {
          await coll.replaceOne({ _id: doc._id }, { ...fixed.doc, _mtime: syncNow(), _origin: NODE_ID, _seq: await nextSeq() }, { upsert: true })
          await mongoose.model('SyncNotice').create({ text: fixed.notice, coll: it.coll, docId: String(doc._id) })
          console.log(`🔧 sync: ${fixed.notice}`)
          result.applied++
          result.touched.push({ coll: it.coll, id: String(doc._id), created: !cur }, { coll: 'syncnotices' })
          continue
        } catch (err2) { err = err2 }
      }
      result.conflicts.push({ coll: it.coll, id: String(doc._id), error: err.message, item: it })
    }
  }
  return result
}

// ── Uzatish formati: ObjectId va Date'lar saqlanishi uchun EJSON ──
const encode = obj => EJSON.stringify(obj, { relaxed: false })
const decode = str => EJSON.parse(str, { relaxed: false })

// Hujjatlar ichidagi /uploads/... fayl yo'llari (rasm, logo, tovush)
function uploadRefs(items) {
  const refs = new Set()
  const walk = v => {
    if (typeof v === 'string') { if (/^\/uploads\/[\w.-]+$/.test(v)) refs.add(v.slice('/uploads/'.length)) }
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object' && !(v instanceof Date) && !v._bsontype) Object.values(v).forEach(walk)
  }
  for (const it of items) if (it.t === 'doc') walk(it.doc)
  return [...refs]
}

// ── O'chirish belgilarini (tombstone) tozalash ─────────────────
// Har o'chirish sync_tombstones'da qoladi — vaqt o'tib baza kattalashmasin.
// Cloud: 180 kundan eskilarini o'chiradi va chegarani (purged) eslab qoladi. Undan oldingi joydan
// davom etmoqchi bo'lgan kassa (uzoq o'chiq turgan) to'liq qayta sinxronlanadi (routes/sync.js → reset).
const DAY = 86400000
const HUB_TOMB_DAYS = 180
async function purgeTombstonesHub() {
  const cutoff = new Date(Date.now() - HUB_TOMB_DAYS * DAY)
  const last = await tombstones().find({ _mtime: { $lt: cutoff } }).sort({ _seq: -1 }).limit(1).next()
  if (!last) return 0
  await counters().updateOne({ _id: 'purged' }, { $max: { v: last._seq } }, { upsert: true })
  return (await tombstones().deleteMany({ _seq: { $lte: last._seq }, _mtime: { $lt: cutoff } })).deletedCount
}
const purgedHorizon = async () => (await counters().findOne({ _id: 'purged' }))?.v || 0

// Kassa: cloud'ga allaqachon yuborilgan yoki cloud'dan kelgan, 30 kundan eski belgilar kerak emas
async function purgeTombstonesEdge(pushed, days = 30) {
  const cutoff = new Date(Date.now() - days * DAY)
  return (await tombstones().deleteMany({ _mtime: { $lt: cutoff }, $or: [{ _origin: { $ne: NODE_ID } }, { _seq: { $lte: pushed } }] })).deletedCount
}

module.exports = { purgeTombstonesHub, purgeTombstonesEdge, purgedHorizon, MODELS, migrate, collectChanges, applyChanges, encode, decode, uploadRefs, newer, NODE_ID }

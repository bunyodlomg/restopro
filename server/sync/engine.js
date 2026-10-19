// ── Sync: o'zgarishlarni yig'ish va qo'llash ──────────────────
// Ikkala tugunda (kassa va cloud) bir xil ishlaydi.
// Ziddiyat qoidasi: _mtime kattaroq yutadi (teng bo'lsa — _origin bo'yicha).

const mongoose = require('mongoose')
const { EJSON } = mongoose.mongo.BSON
const { NODE_ID, nextSeq, recordTombstones, tombstones } = require('./plugin')

// Sinxronlanadigan modellar
const MODELS = ['User', 'Product', 'Ingredient', 'Order', 'Table', 'Salary', 'Purchase', 'Settings', 'Reservation', 'GuestOrder']
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
async function collectChanges(since, exceptOrigin) {
  const filter = { _seq: { $gt: since } }
  if (exceptOrigin) filter._origin = { $ne: exceptOrigin }

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

// Boshqa tugundan kelgan o'zgarishlarni qo'llash
async function applyChanges(items) {
  const result = { applied: 0, skipped: 0, conflicts: [], touched: [] }
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
    const cur = await coll.findOne({ _id: doc._id }, { projection: { _mtime: 1, _origin: 1 } })
    if (cur && !newer(doc, cur)) { result.skipped++; continue }

    // Bu bazada yangi _seq beramiz; _origin saqlanadi — qaytib jo'natilmasligi uchun
    const local = { ...doc, _seq: await nextSeq() }
    try {
      await coll.replaceOne({ _id: doc._id }, local, { upsert: true })
      result.applied++
      result.touched.push({ coll: it.coll, id: String(doc._id) })
    } catch (err) {
      // Odatda unique ziddiyati: masalan ikkala tomonda bir xil username yaratilgan
      result.conflicts.push({ coll: it.coll, id: String(doc._id), error: err.message })
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

module.exports = { MODELS, migrate, collectChanges, applyChanges, encode, decode, uploadRefs, newer, NODE_ID }

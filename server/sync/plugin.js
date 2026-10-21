// ── Sync: har bir yozuvga belgi qo'yish ───────────────────────
// Har bir o'zgarishda hujjatga uchta maydon yoziladi:
//   _seq    — shu bazadagi o'sib boruvchi o'zgarish raqami ("nima o'zgardi?" so'rovi uchun)
//   _mtime  — o'zgarish vaqti (ziddiyatda oxirgi o'zgarish yutadi)
//   _origin — o'zgarish qaysi tugunda (kassa / cloud) qilingani
// O'chirishlar sync_tombstones kolleksiyasiga yoziladi.
//
// Bu fayl modellar yuklanishidan OLDIN require qilinishi kerak.

const mongoose = require('mongoose')

const NODE_ID = process.env.NODE_ID || 'cloud'

// Kassa soati cloud soatidan farq qilishi mumkin (noto'g'ri sozlangan Windows soati).
// _mtime ziddiyatda kim yutishini hal qiladi — shuning uchun kassa cloud vaqti bilan yozadi
// (farq sync javoblaridan o'lchanadi: client.js → setClockOffset).
let clockOffset = 0
const setClockOffset = ms => { clockOffset = Math.round(ms) || 0 }
const syncNow = () => new Date(Date.now() + clockOffset)

const counters   = () => mongoose.connection.collection('sync_counters')
const tombstones = () => mongoose.connection.collection('sync_tombstones')

async function nextSeq(n = 1) {
  const r = await counters().findOneAndUpdate(
    { _id: 'seq' }, { $inc: { v: n } }, { upsert: true, returnDocument: 'after' }
  )
  return (r.value ?? r).v   // mongodb drayver versiyasiga qarab
}

// Update obyektiga sync maydonlarini qo'shish
function stampUpdate(update, fields) {
  if (!update) return { $set: fields }
  const hasOps = Object.keys(update).some(k => k.startsWith('$'))
  if (!hasOps) return { ...update, ...fields }
  return { ...update, $set: { ...(update.$set || {}), ...fields } }
}

function syncPlugin(schema) {
  schema.add({
    _seq:    { type: Number, index: true },
    _mtime:  { type: Date },
    _origin: { type: String },
  })

  schema.pre('save', async function () {
    this._seq    = await nextSeq()
    this._mtime  = syncNow()
    this._origin = NODE_ID
  })

  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], async function () {
    const fields = { _seq: await nextSeq(), _mtime: syncNow(), _origin: NODE_ID }
    this.setUpdate(stampUpdate(this.getUpdate(), fields))
  })

  // O'chirishdan oldin qaysi hujjatlar o'chishini eslab qolamiz
  schema.pre(['findOneAndDelete', 'deleteOne', 'deleteMany'], { document: false, query: true }, async function () {
    const docs = await this.model.find(this.getFilter()).select('_id').lean()
    this._syncDeletedIds = docs.map(d => d._id)
  })
  schema.post(['findOneAndDelete', 'deleteOne', 'deleteMany'], { document: false, query: true }, async function () {
    const ids = this._syncDeletedIds || []
    if (!ids.length) return
    await recordTombstones(this.model.collection.collectionName, ids, syncNow(), NODE_ID)
  })
}

async function recordTombstones(coll, ids, mtime, origin) {
  const last = await nextSeq(ids.length)
  const ops = ids.map((id, i) => ({
    updateOne: {
      filter: { coll, docId: id },
      update: { $set: { coll, docId: id, _seq: last - ids.length + 1 + i, _mtime: mtime, _origin: origin } },
      upsert: true,
    },
  }))
  await tombstones().bulkWrite(ops)
}

mongoose.plugin(syncPlugin)

module.exports = { NODE_ID, nextSeq, recordTombstones, counters, tombstones, syncNow, setClockOffset }

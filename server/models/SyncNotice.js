const { Schema, model } = require('mongoose')

// Sync o'zi hal qilgan ziddiyat haqida restoran adminiga xabar
// (masalan: ikki joyda bir xil login yaratilgan — biri qayta nomlandi). Kassa va cloud'da bir xil.
const SyncNoticeSchema = new Schema({
  text: { type: String, required: true },
  coll: { type: String, default: '' },
  docId: { type: String, default: '' },
  read: { type: Boolean, default: false },
}, { timestamps: true })

module.exports = model('SyncNotice', SyncNoticeSchema)

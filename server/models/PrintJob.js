const { Schema, model } = require('mongoose')

// Chop etish navbati. Vazifa istalgan tugunda (cloud yoki kassa) yaratiladi,
// sync orqali kassaga yetadi va kassa uni restoran tarmog'idagi printerga yuboradi.
const PrintJobSchema = new Schema({
  kind:      { type: String, enum: ['receipt', 'order', 'test'], required: true },
  printerId: { type: String, default: '' },
  printer:   { type: Schema.Types.Mixed, default: {} },   // yaratilgan paytdagi printer sozlamasi
  title:     { type: String, default: '' },               // "Stol 3 — Oshxona" (ro'yxatda ko'rsatish uchun)
  data:      { type: Buffer },                            // tayyor ESC/POS baytlar
  status:    { type: String, enum: ['pending', 'printing', 'done', 'error', 'expired'], default: 'pending', index: true },
  attempts:  { type: Number, default: 0 },
  error:     { type: String, default: '' },
  printedAt: { type: Date, default: null },
}, { timestamps: true })

module.exports = model('PrintJob', PrintJobSchema)

const { Schema, model } = require('mongoose')

// Qarzdor mijoz. balance — hozirgi qarzi (so'm); faqat $inc bilan o'zgaradi (kassa va cloud
// bir vaqtda yozsa ham sync ikkalasini qo'shadi). Har o'zgarish izi — DebtTx.
const CustomerSchema = new Schema({
  name:    { type: String, required: true, trim: true },
  phone:   { type: String, default: '', trim: true },
  note:    { type: String, default: '' },
  balance: { type: Number, default: 0 },
  lastAt:  { type: Date, default: null },     // oxirgi qarz / to'lov
}, { timestamps: true })

module.exports = model('Customer', CustomerSchema)

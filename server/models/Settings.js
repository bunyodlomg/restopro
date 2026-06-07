const { Schema, model } = require('mongoose')

// ─── Chek (receipt) dizayni ───────────────────────────────────
const ReceiptSchema = new Schema({
  headerText:   { type: String,  default: '' },                       // nom ostidagi qator (manzil/telefon)
  footerText:   { type: String,  default: "Rahmat! Yana keling 🍽" },
  showLogo:     { type: Boolean, default: true },                     // yuqorida emoji-logo
  showWaiter:   { type: Boolean, default: true },                     // ofitsant ismi
  showDateTime: { type: Boolean, default: true },                     // sana/vaqt
  paperWidth:   { type: Number,  default: 58 },                       // mm: 58 yoki 80
  fontSize:     { type: Number,  default: 12 },                       // px
}, { _id: false })

const SoundsSchema = new Schema({
  tick:     { type: String, default: '' },
  nav:      { type: String, default: '' },
  confirm:  { type: String, default: '' },
  success:  { type: String, default: '' },
  warn:     { type: String, default: '' },
  newOrder: { type: String, default: '' },
}, { _id: false })

const SettingsSchema = new Schema({
  // Yagona hujjat (singleton)
  _id: { type: String, default: 'main' },

  brandName:   { type: String, default: 'RestoPro' },
  brandLogo:   { type: String, default: '🍽' },      // emoji yoki fayl yo'li

  // Xizmat haqi (service fee) — soboy kategoriyasiga qo'llanilmaydi
  serviceFeeEnabled: { type: Boolean, default: false },
  serviceFeePercent: { type: Number,  default: 10 },   // foiz

  // Chek dizayni — Sozlamalardan boshqariladi
  receipt: { type: ReceiptSchema, default: () => ({}) },

  // Maxsus tovush fayllari
  sounds: { type: SoundsSchema, default: () => ({}) },

  // Soboy oxirgi tartib raqami (kunlik reset emas, umumiy)
  soboyCounter: { type: Number, default: 0 },

  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = model('Settings', SettingsSchema)

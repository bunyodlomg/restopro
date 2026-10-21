const { Schema, model } = require('mongoose')

// ─── Chek (receipt) dizayni ───────────────────────────────────
const ReceiptSchema = new Schema({
  headerText:   { type: String,  default: '' },                       // nom ostidagi qator (manzil/telefon)
  footerText:   { type: String,  default: 'Rahmat! Yana keling' },
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

// ─── Printerlar (kassa, ofitsant, oshxona, shashlikchi ...) ─────
// Har bir printerga faqat o'ziga tegishli narsa chiqadi:
//   receipt — mijoz cheki ("Chek" tugmasi)
//   orders  — yangi buyurtma talonlari (categories bo'sh bo'lsa barcha taomlar)
const PrinterSchema = new Schema({
  name:       { type: String, default: 'Printer', trim: true },
  conn:       { type: String, enum: ['network', 'usb'], default: 'network' },
  ip:         { type: String, default: '' },
  port:       { type: Number, default: 9100 },
  device:     { type: String, default: '' },      // USB: Windows'dagi printer nomi (kassa kompyuterida)
  paperWidth: { type: Number, default: 80 },      // 58 yoki 80 mm
  receipt:    { type: Boolean, default: false },
  orders:     { type: Boolean, default: false },
  categories: { type: [String], default: [] },
  enabled:    { type: Boolean, default: true },
})

const SettingsSchema = new Schema({
  // Yagona hujjat (singleton)
  _id: { type: String, default: 'main' },

  brandName:   { type: String, default: 'RestoPro' },
  brandLogo:   { type: String, default: '' },        // yuklangan rasm yo'li (/uploads/...) yoki bo'sh
  // Kassa / ofitsant ilovalari ikonkasi: '' — standart, 'logo' — restoran logotipi, '/uploads/...' — alohida rasm
  appIcon:     { type: String, default: '' },

  // Stol bo'limlari: zal, xona, ko'cha + restoranning o'zi qo'shganlari (2-etaj, lux ...). Bo'sh — standart uchtasi
  tableSections: { type: [{ _id: false, key: String, label: String }], default: undefined },
  // QR kartochka dizayni: light / dark / brand, sarlavha va pastki yozuv
  qrDesign: { theme: { type: String, default: 'light' }, title: { type: String, default: '' }, subtitle: { type: String, default: '' } },

  // Xizmat haqi (service fee) — soboy kategoriyasiga qo'llanilmaydi
  serviceFeeEnabled: { type: Boolean, default: false },
  serviceFeePercent: { type: Number,  default: 10 },   // foiz

  // Chek dizayni — Sozlamalardan boshqariladi
  receipt: { type: ReceiptSchema, default: () => ({}) },

  // Maxsus tovush fayllari
  sounds: { type: SoundsSchema, default: () => ({}) },

  printers: { type: [PrinterSchema], default: [] },

  // Xodimlar (admin bo'lmaganlar) tizimga kira oladimi — bitta tugma bilan hammasini o'chirish
  staffAccessEnabled: { type: Boolean, default: true },

  // QR menyu: mijoz stoldagi QR kodni skanerlab buyurtma beradi (faqat restoran Wi-Fi'idan)
  qrMenuEnabled: { type: Boolean, default: false },
  qrBaseUrl:     { type: String,  default: '' },     // QR ichidagi manzil (bo'sh = avtomatik)
  // Cloud serverda: restoran Wi-Fi'ining tashqi IP manzillari (kassada LAN avtomatik ruxsat)
  wifiIps:       { type: [String], default: [] },

  // Soboy oxirgi tartib raqami (kunlik reset emas, umumiy)
  soboyCounter: { type: Number, default: 0 },

  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = model('Settings', SettingsSchema)

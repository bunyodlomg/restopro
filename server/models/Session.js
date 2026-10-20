const { Schema, model } = require('mongoose')

// Ofitsantning faol sessiyasi: bitta akkaunt — bitta qurilma.
// _id = foydalanuvchi ID'si (har ofitsantga bitta yozuv). Sync orqali kassa va cloud'da bir xil,
// shuning uchun bir tugunda faol bo'lgan ofitsant ikkinchisida ham kira olmaydi.
// User hujjatidan alohida: tez-tez yangilanadigan seenAt admin tahrirlarini (parol va h.k.) bosib ketmasin.
const SessionSchema = new Schema({
  _id:      { type: Schema.Types.ObjectId, ref: 'User' },
  sid:      { type: String, required: true },     // tokendagi sessiya kaliti
  deviceId: { type: String, default: '' },        // qurilma (brauzer/ilova) belgisi
  seenAt:   { type: Date, default: Date.now },    // oxirgi faollik — ancha eskirgan sessiya bo'sh hisoblanadi
}, { timestamps: true })

module.exports = model('Session', SessionSchema)

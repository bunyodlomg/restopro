const { Schema, model } = require('mongoose')

// Ombor harakati — har bir kirim/chiqim izi: qoldiq qayerdan kelgani tekshirilsin.
//   in     — kirim (xarid; chiqimga Purchase sifatida ham yoziladi)
//   out    — buyurtma yopilganda retsept bo'yicha sarf (tannarx)
//   waste  — hisobdan chiqarish (buzildi, to'kildi)
//   adjust — inventarizatsiya: sanalgan haqiqiy qoldiqqa tenglash
const StockMoveSchema = new Schema({
  ingredientId:   { type: Schema.Types.ObjectId, ref: 'Ingredient', index: true },
  ingredientName: { type: String, default: '' },
  unit:           { type: String, default: '' },
  type:           { type: String, required: true, enum: ['in', 'out', 'waste', 'adjust'] },
  quantity:       { type: Number, required: true },   // ishorali: kirim +, chiqim −
  unitPrice:      { type: Number, default: 0 },
  cost:           { type: Number, default: 0 },       // |quantity| × narx (so'm)
  orderId:        { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  note:           { type: String, default: '' },
  by:             { type: String, default: '' },
}, { timestamps: true })

StockMoveSchema.index({ createdAt: -1 })

module.exports = model('StockMove', StockMoveSchema)

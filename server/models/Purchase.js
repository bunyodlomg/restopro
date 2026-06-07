const { Schema, model } = require('mongoose')

// Ingredient xaridi — har bir ombor to'ldirish chiqim sifatida qayd etiladi
const PurchaseSchema = new Schema({
  ingredientId:   { type: Schema.Types.ObjectId, ref: 'Ingredient' },
  ingredientName: { type: String },
  quantity:       { type: Number, default: 0 },     // sotib olingan miqdor
  unit:           { type: String, default: '' },
  unitPrice:      { type: Number, default: 0 },     // 1 birlik narxi
  totalCost:      { type: Number, required: true }, // umumiy xarajat (so'm)
  note:           { type: String, default: '' },
  createdBy:      { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = model('Purchase', PurchaseSchema)

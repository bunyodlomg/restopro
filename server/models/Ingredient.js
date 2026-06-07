const { Schema, model } = require('mongoose')

const IngredientSchema = new Schema({
  name:     { type: String, required: true, trim: true },
  unit:     { type: String, default: 'kg', enum: ['kg', 'g', 'l', 'ml', 'dona', 'litr', 'paket'] },
  quantity: { type: Number, default: 0 },       // joriy miqdor
  minQty:   { type: Number, default: 0 },       // minimum chegara (ogohlantirish uchun)
  price:    { type: Number, default: 0 },       // 1 birlik narxi (so'm)
}, { timestamps: true })

module.exports = model('Ingredient', IngredientSchema)

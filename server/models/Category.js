const { Schema, model } = require('mongoose')

// Taom bo'limlari (Milliy taomlar, Ichimliklar ...). Admin "Taomlar" sahifasida boshqaradi,
// taom yaratishda shu ro'yxatdan tanlanadi.
// Taom bo'limni nomi bilan saqlaydi (Product.category) — printerlar ham nom bo'yicha taqsimlaydi,
// shuning uchun nom o'zgarsa taomlar va printer sozlamalari ham yangilanadi (routes/categories.js).
const CategorySchema = new Schema({
  name: { type: String, required: true, trim: true },
}, { timestamps: true })

module.exports = model('Category', CategorySchema)

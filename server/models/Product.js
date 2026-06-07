const { Schema, model } = require('mongoose')

const ProductSchema = new Schema({
  name:     { type: String, required: true, trim: true },
  price:    { type: Number, required: true, min: 0 },
  category: { type: String, default: 'Asosiy', trim: true },
  image:    { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  ingredients: [{
    ingredient:  { type: Schema.Types.ObjectId, ref: 'Ingredient' },
    quantity:    { type: Number, default: 0 },
    recipeUnit:  { type: String, default: '' }, // taomda ishlatilgan birlik (g, ml, ...)
  }],
}, { timestamps: true })

module.exports = model('Product', ProductSchema)

const { Schema, model } = require('mongoose')

const OrderSchema = new Schema({
  tableId:     { type: Schema.Types.ObjectId, ref: 'Table' },
  tableNumber: { type: Number },
  category:    { type: String },   // zal, xona, ko'cha, soboy
  waiterName:  { type: String, default: '' },
  waiterId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },

  status:  { type: String, default: 'pending', enum: ['pending', 'ready', 'closed', 'cancelled'] },

  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    name:      { type: String },
    price:     { type: Number },
    quantity:  { type: Number, default: 1 },
  }],

  // Qo'shimcha to'lovlar (xizmat haqi, yetkazib berish va h.k.)
  extras: [{
    extraFee: { type: Number, default: 0 },
    comment:  { type: String, default: '' },
  }],

  // Hisoblab chiqilgan jami narx (saqlash tezlikni oshiradi)
  totalPrice:  { type: Number, default: 0 },
  serviceFee:  { type: Number, default: 0 },

  note:        { type: String, default: '' },    // oshpazga izoh
  closedAt:    { type: Date,   default: null },
}, { timestamps: true })

// Jami hisoblaydigan virtual field
OrderSchema.virtual('grandTotal').get(function() {
  const items  = this.items.reduce((s, i) => s + i.price * i.quantity, 0)
  const extras = this.extras.reduce((s, e) => s + (e.extraFee || 0), 0)
  return items + extras + (this.serviceFee || 0)
})

module.exports = model('Order', OrderSchema)

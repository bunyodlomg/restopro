const { Schema, model } = require('mongoose')

// Mijozning QR menyu orqali yuborgan buyurtmasi. Xodim tasdiqlagach
// oddiy buyurtmaga (Order) qo'shiladi — tasdiqlanmaguncha oshxonaga bormaydi.
const GuestOrderSchema = new Schema({
  tableId:     { type: Schema.Types.ObjectId, ref: 'Table', required: true },
  tableNumber: { type: Number },
  category:    { type: String },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    name:      { type: String },
    price:     { type: Number },
    quantity:  { type: Number, default: 1 },
  }],
  note:        { type: String, default: '' },
  status:      { type: String, default: 'new', enum: ['new', 'accepted', 'rejected'] },
  orderId:     { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  handledBy:   { type: String, default: '' },
  ip:          { type: String, default: '' },
}, { timestamps: true })

GuestOrderSchema.index({ status: 1, createdAt: -1 })

module.exports = model('GuestOrder', GuestOrderSchema)

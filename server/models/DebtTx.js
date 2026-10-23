const { Schema, model } = require('mongoose')

// Qarz harakati: debt — qarzga yozildi (buyurtma yoki qo'lda), payment — mijoz to'ladi
const DebtTxSchema = new Schema({
  customerId:   { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  customerName: { type: String, default: '' },
  type:         { type: String, required: true, enum: ['debt', 'payment'] },
  amount:       { type: Number, required: true, min: 0 },
  orderId:      { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  note:         { type: String, default: '' },
  by:           { type: String, default: '' },
}, { timestamps: true })

DebtTxSchema.index({ createdAt: -1 })

module.exports = model('DebtTx', DebtTxSchema)

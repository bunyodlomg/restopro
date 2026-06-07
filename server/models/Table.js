const { Schema, model } = require('mongoose')

const TableSchema = new Schema({
  number:      { type: Number, required: true },
  category:    { type: String, required: true, enum: ["zal", "xona", "ko'cha", "soboy"] },
  status:      { type: String, default: 'free', enum: ['free', 'busy'] },
  description: { type: String, default: '' },
  currentOrder:{ type: Schema.Types.ObjectId, ref: 'Order', default: null },
}, { timestamps: true })

// Bir kategoriyada bir xil raqam bo'lmasligi uchun
TableSchema.index({ number: 1, category: 1 }, { unique: true })

module.exports = model('Table', TableSchema)

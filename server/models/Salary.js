const { Schema, model } = require('mongoose')

const SalarySchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName:  { type: String },
  amount:    { type: Number, required: true },       // to'langan summa
  month:     { type: String },                       // "2025-06" format
  note:      { type: String, default: '' },
  paidAt:    { type: Date, default: Date.now },
  paidBy:    { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

module.exports = model('Salary', SalarySchema)

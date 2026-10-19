const { Schema, model } = require('mongoose')

// Bron: mijoz telefon qiladi, admin qo'lda kiritadi
const ReservationSchema = new Schema({
  tableId:     { type: Schema.Types.ObjectId, ref: 'Table', required: true },
  tableNumber: { type: Number },
  category:    { type: String },                  // zal, xona, ko'cha
  startAt:     { type: Date, required: true },    // kelish vaqti
  duration:    { type: Number, default: 120 },    // daqiqa
  guests:      { type: Number, default: 2 },
  name:        { type: String, required: true, trim: true },
  phone:       { type: String, default: '', trim: true },
  note:        { type: String, default: '' },
  deposit:     { type: Number, default: 0 },      // oldindan to'lov (so'm)
  status:      { type: String, default: 'booked', enum: ['booked', 'arrived', 'cancelled', 'noshow'] },
  createdBy:   { type: String, default: '' },
}, { timestamps: true })

ReservationSchema.index({ startAt: 1 })

module.exports = model('Reservation', ReservationSchema)

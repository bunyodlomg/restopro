const { Schema, model } = require('mongoose')

const UserSchema = new Schema({
  name:      { type: String, required: true, trim: true },
  username:  { type: String, required: true, unique: true, trim: true, lowercase: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ['admin', 'waiter'], default: 'waiter' },
  phone:     { type: String, default: '' },
  salary:    { type: Number, default: 0 },   // oylik maoshi (so'm)
  hiredAt:   { type: Date,   default: Date.now },
  isActive:  { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },  // birinchi kirishda parolni almashtirish
  // Monoblokda 4 raqamli PIN bilan kirish. sha256(salt + pin) — kassa va cloud'da bir xil ishlaydi
  pinHash:   { type: String, default: '' },
  pinSalt:   { type: String, default: '' },
}, { timestamps: true })

UserSchema.methods.toJSON = function() {
  const obj = this.toObject()
  delete obj.password
  obj.hasPin = !!obj.pinHash
  delete obj.pinHash
  delete obj.pinSalt
  delete obj.sessionId   // eski versiyadan qolgan maydon (sessiyalar endi Session modelida)
  return obj
}

module.exports = model('User', UserSchema)

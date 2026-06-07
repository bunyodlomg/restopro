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
}, { timestamps: true })

UserSchema.methods.toJSON = function() {
  const obj = this.toObject()
  delete obj.password
  return obj
}

module.exports = model('User', UserSchema)

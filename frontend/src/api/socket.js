import { io } from 'socket.io-client'
import { API_URL } from '../config.js'

// Server socket ulanishida tokenni talab qiladi.
// auth funksiya ko'rinishida — har qayta ulanishda yangi token olinadi.
export function createSocket(opts = {}) {
  return io(API_URL, {
    ...opts,
    auth: cb => cb({ token: localStorage.getItem('rp_token') || '' }),
  })
}

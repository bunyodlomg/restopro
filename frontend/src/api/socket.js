import { io } from 'socket.io-client'
import { API_URL } from '../config.js'
import { appKind, deviceId, appInfo } from '../utils/terminal.js'

// Server socket ulanishida tokenni talab qiladi.
// auth funksiya ko'rinishida — har qayta ulanishda yangi token olinadi.
// app/device — litsenziya statistikasi uchun (qaysi ilovadan, nechta qurilma ulangan).
export function createSocket(opts = {}) {
  const s = io(API_URL, {
    ...opts,
    auth: cb => cb({ token: localStorage.getItem('rp_token') || '', app: appKind() || 'web', device: deviceId(), ...appInfo() }),
  })
  // Sotuvchi shu qurilmani bloklagan — LicenseGate bloklash ekranini ko'rsatadi
  const blocked = () => window.dispatchEvent(new Event('rp-device-blocked'))
  s.on('deviceBlocked', blocked)
  s.on('connect_error', err => { if (err?.message === 'device_blocked') { blocked(); s.disconnect() } })
  return s
}

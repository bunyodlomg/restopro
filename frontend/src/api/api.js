import axios from 'axios'
import { API_URL } from '../config.js'
import { deviceId } from '../utils/terminal.js'

const API = axios.create({ baseURL: API_URL })

API.interceptors.request.use((config) => {
  // ngrok bepul tunnel ogohlantirishini AJAX'da o'tkazib yuborish
  config.headers['ngrok-skip-browser-warning'] = '1'
  config.headers['x-device'] = deviceId()   // sotuvchi alohida qurilmani bloklashi mumkin
  const token = localStorage.getItem('rp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let _redirecting = false

API.interceptors.response.use(
  (res) => res,
  (err) => {
    // Obuna to'xtatilgan / muddati o'tgan — butun ilova bloklash ekraniga o'tadi
    // Yumshoq blok (LICENSE_READONLY) — ilova ishlaydi, banner chiqadi; xabar so'rov xatosi sifatida ko'rinadi
    if (err.response?.status === 402 && ['LICENSE_BLOCKED', 'LICENSE_READONLY'].includes(err.response.data?.code)) {
      window.dispatchEvent(new CustomEvent('rp-license', { detail: err.response.data.license }))
      return Promise.reject(err)
    }
    if (err.response?.status === 403 && err.response.data?.code === 'DEVICE_BLOCKED') {
      window.dispatchEvent(new Event('rp-device-blocked'))
      return Promise.reject(err)
    }
    // Server parolni almashtirishni talab qilmoqda
    if (err.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED' && window.location.pathname !== '/change-password') {
      try {
        const u = JSON.parse(localStorage.getItem('rp_user') || 'null')
        if (u) localStorage.setItem('rp_user', JSON.stringify({ ...u, mustChangePassword: true }))
      } catch {}
      window.location.href = '/change-password'
      return Promise.reject(err)
    }
    if (err.response?.status === 401 && !_redirecting && !err.config?.skipAuthRedirect) {
      _redirecting = true
      // Login sahifasida nima uchun chiqarilgani ko'rsatiladi
      if (err.response.data?.code === 'SESSION_REPLACED') sessionStorage.setItem('rp_logout_reason', err.response.data.message)
      localStorage.removeItem('rp_token')
      localStorage.removeItem('rp_user')
      window.location.href = '/login'
      // Reset flag after navigation
      setTimeout(() => { _redirecting = false }, 3000)
    }
    return Promise.reject(err)
  }
)

export default API

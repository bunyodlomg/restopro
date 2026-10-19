import axios from 'axios'
import { API_URL } from '../config.js'

const API = axios.create({ baseURL: API_URL })

API.interceptors.request.use((config) => {
  // ngrok bepul tunnel ogohlantirishini AJAX'da o'tkazib yuborish
  config.headers['ngrok-skip-browser-warning'] = '1'
  const token = localStorage.getItem('rp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let _redirecting = false

API.interceptors.response.use(
  (res) => res,
  (err) => {
    // Obuna to'xtatilgan / muddati o'tgan — butun ilova bloklash ekraniga o'tadi
    if (err.response?.status === 402 && err.response.data?.code === 'LICENSE_BLOCKED') {
      window.dispatchEvent(new CustomEvent('rp-license', { detail: err.response.data.license }))
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
    if (err.response?.status === 401 && !_redirecting) {
      _redirecting = true
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

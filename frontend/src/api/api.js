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

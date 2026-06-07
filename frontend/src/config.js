import { BRAND } from './brand.js'

// VITE_API_URL bo'sh bo'lsa — same-origin (Vite proxy orqali backendga).
// MUHIM: localhost fallback ishlatilmaydi — aks holda boshqa qurilmadan
// kirilganda so'rov o'sha qurilmaning localhost'iga ketib, login ishlamaydi.
export const API_URL = import.meta.env.VITE_API_URL || BRAND.apiUrl || ''

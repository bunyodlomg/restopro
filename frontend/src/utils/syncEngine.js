// ============================================================
//  Sinxronlash dvigateli — navbatdagi buyurtmalarni serverga
//  yuboradi. Online bo'lganda, ilova ochilganda va davriy ishlaydi.
// ============================================================
import API from '../api/api.js'
import { listQueue, removeFromQueue, markAttempt } from './offlineQueue.js'

let _syncing = false

function isNetworkError(err) {
  // Javob umuman kelmasa — tarmoq uzilgan
  return !err?.response || err.code === 'ERR_NETWORK' || err.message === 'Network Error'
}

export async function syncQueue() {
  if (_syncing || typeof navigator !== 'undefined' && !navigator.onLine) return
  _syncing = true
  let sent = 0
  try {
    const items = await listQueue()
    for (const item of items) {
      try {
        await API.post('/api/orders', item.payload)
        await removeFromQueue(item.clientId)
        sent++
      } catch (err) {
        // Yana offline bo'lib qoldik yoki obuna to'xtatilgan (402) — qolganini keyingi safarga qoldiramiz
        // (obuna faollashgach buyurtmalar yuboriladi)
        if (isNetworkError(err) || err.response?.status === 402) break
        // 409 = server bu clientId'ni allaqachon qabul qilgan (idempotency) → o'chiramiz
        if (err.response?.status === 409) {
          await removeFromQueue(item.clientId)
          sent++
          continue
        }
        // Boshqa server xatosi (validatsiya va h.k.) — belgilab qo'yamiz, navbatda qoladi
        await markAttempt(item.clientId, err.response?.data?.message || err.message)
      }
    }
  } finally {
    _syncing = false
  }
  return sent
}

let _started = false
export function initSync() {
  if (_started || typeof window === 'undefined') return
  _started = true
  window.addEventListener('online', () => { syncQueue() })
  if (navigator.onLine) syncQueue()
  // Tarmoq "online" hodisasini o'tkazib yuborgan holatlar uchun zaxira
  setInterval(() => { if (navigator.onLine) syncQueue() }, 30000)
}

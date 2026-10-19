import { useState, useEffect } from 'react'
import { queueCount, onQueueChange } from '../utils/offlineQueue.js'

// Navbatdagi (yuborilmagan) buyurtmalar sonini kuzatuvchi hook
export function useQueueCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let alive = true
    const refresh = () => queueCount().then(c => { if (alive) setCount(c) }).catch(() => {})
    refresh()
    const off = onQueueChange(refresh)
    return () => { alive = false; off() }
  }, [])
  return count
}

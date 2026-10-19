// ============================================================
//  Offline buyurtma navbati — IndexedDB (idb) orqali
//  Internet yo'qda buyurtmalar shu yerda saqlanadi, ulanish
//  tiklanganda syncEngine ularni serverga yuboradi.
// ============================================================
import { openDB } from 'idb'

const DB_NAME = 'restopro-offline'
const STORE = 'order-queue'
const VERSION = 1

let _dbPromise
function db() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'clientId' })
        }
      },
    })
  }
  return _dbPromise
}

// ── O'zgarishlarni kuzatish (UI yangilanishi uchun) ───────────
const listeners = new Set()
function emit() {
  listeners.forEach(fn => { try { fn() } catch { /* noop */ } })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offline-queue-changed'))
  }
}
export function onQueueChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ── Klient tomonida noyob ID (idempotency kaliti) ─────────────
export function genClientId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// ── Navbatga qo'shish ─────────────────────────────────────────
export async function enqueueOrder(payload) {
  const clientId = payload.clientId || genClientId()
  const rec = {
    clientId,
    payload: { ...payload, clientId },
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
  }
  const d = await db()
  await d.put(STORE, rec)
  emit()
  return rec
}

export async function listQueue() {
  const d = await db()
  const all = await d.getAll(STORE)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeFromQueue(clientId) {
  const d = await db()
  await d.delete(STORE, clientId)
  emit()
}

export async function queueCount() {
  const d = await db()
  return d.count(STORE)
}

export async function markAttempt(clientId, error) {
  const d = await db()
  const rec = await d.get(STORE, clientId)
  if (rec) {
    rec.attempts += 1
    rec.lastError = error || null
    await d.put(STORE, rec)
    emit()
  }
}

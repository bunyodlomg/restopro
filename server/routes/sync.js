// ── Sync API (cloud tomonida) ─────────────────────────────────
// Kassa (Electron) shu endpointlar orqali o'zgarishlarni yuboradi va oladi.
// Faqat server/.env da SYNC_KEY o'rnatilgan bo'lsa ishlaydi.

const router  = require('express').Router()
const express = require('express')
const crypto  = require('crypto')
const fs      = require('fs')
const path    = require('path')
const engine  = require('../sync/engine')
const { notifyApplied } = require('../sync/notify')

const { UPLOAD_DIR } = require('../config')
const SAFE_FILE  = /^[\w-]+\.(png|jpe?g|webp|gif|mp3|wav|ogg|m4a)$/i

function syncAuth(req, res, next) {
  const expected = process.env.SYNC_KEY || ''
  const given    = req.get('x-sync-key') || ''
  const ok = expected.length >= 32 && given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  if (!ok) return res.status(401).json({ message: 'Sync kaliti noto\'g\'ri' })
  next()
}

const ejsonBody = express.text({ type: 'application/ejson', limit: '50mb' })
const sendEjson = (res, obj) => res.type('application/ejson').send(engine.encode(obj))

// GET /api/sync/ping — kassa sozlashda manzil va kalitni tekshirish
router.get('/ping', syncAuth, (req, res) => res.json({ ok: true, node: engine.NODE_ID }))

// GET /api/sync/pull?since=N&node=kassa — kassa uchun yangi o'zgarishlar
router.get('/pull', syncAuth, async (req, res, next) => {
  try {
    const since = Math.max(0, parseInt(req.query.since, 10) || 0)
    const node  = String(req.query.node || '')
    if (!node) return res.status(400).json({ message: 'node kerak' })
    sendEjson(res, await engine.collectChanges(since, node))
  } catch (err) { next(err) }
})

// POST /api/sync/push — kassadagi o'zgarishlarni qabul qilish
router.post('/push', syncAuth, ejsonBody, async (req, res, next) => {
  try {
    const { items } = engine.decode(req.body || '{}')
    if (!Array.isArray(items)) return res.status(400).json({ message: 'items kerak' })
    const result = await engine.applyChanges(items)
    notifyApplied(req.app.get('io'), result)
    sendEjson(res, { applied: result.applied, skipped: result.skipped, conflicts: result.conflicts })
  } catch (err) { next(err) }
})

// HEAD /api/sync/file/:name — fayl bormi?   PUT — yuklash (mavjud bo'lsa tegilmaydi)
router.head('/file/:name', syncAuth, (req, res) => {
  if (!SAFE_FILE.test(req.params.name)) return res.sendStatus(400)
  res.sendStatus(fs.existsSync(path.join(UPLOAD_DIR, req.params.name)) ? 200 : 404)
})
router.put('/file/:name', syncAuth, express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const name = req.params.name
  if (!SAFE_FILE.test(name)) return res.status(400).json({ message: 'Fayl nomi noto\'g\'ri' })
  const dest = path.join(UPLOAD_DIR, name)
  if (!fs.existsSync(dest)) fs.writeFileSync(dest, req.body)
  res.json({ ok: true })
})

module.exports = router

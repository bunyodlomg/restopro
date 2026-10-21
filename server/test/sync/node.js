// Sync testi uchun tugun (run.js ishga tushiradi): node node.js cloud|kassa <port> [cloudPort]
const ROLE = process.argv[2], PORT = +process.argv[3]
const S = require('path').resolve(__dirname, '../..')
process.env.JWT_SECRET = 'x'.repeat(40)
process.env.NODE_ID = ROLE === 'cloud' ? 'cloud' : 'kassa1'
process.env.SYNC_KEY = 'k'.repeat(40)
if (ROLE === 'kassa') process.env.SYNC_URL = 'http://127.0.0.1:' + process.argv[4]
require(S + '/sync/plugin')
const mongoose = require(S + '/node_modules/mongoose')
const express = require(S + '/node_modules/express')
for (const m of ['User', 'Session', 'Category', 'Product', 'Ingredient', 'Order', 'Table', 'Salary', 'Purchase', 'Settings', 'Reservation', 'GuestOrder', 'PrintJob']) require(S + '/models/' + m)
const engine = require(S + '/sync/engine')
const client = require(S + '/sync/client')
const { placeOrder } = require(S + '/routes/orders')
const io = { emit() {}, fetchSockets: async () => [] }

const app = express()
app.set('io', io)
app.use('/api/sync', require(S + '/routes/sync'))
app.use(express.json())
const M = n => mongoose.model(n)
const t = (path, fn) => app.post('/t/' + path, async (req, res) => {
  try { res.json(await fn(req.body)) } catch (e) { console.error(e); res.status(500).json({ error: e.message }) }
})
t('reset', async () => { await mongoose.connection.db.dropDatabase(); return { ok: 1 } })
t('seed', async () => {
  const cat = await M('Category').create({ name: 'Ovqat' })
  const p1 = await M('Product').create({ name: 'Osh', price: 30000, category: cat._id })
  const p2 = await M('Product').create({ name: 'Choy', price: 5000, category: cat._id })
  const ing = await M('Ingredient').create({ name: 'Guruch', unit: 'kg', quantity: 100 })
  const tb = await M('Table').create({ number: 1, category: 'zal' })
  const u = await M('User').create({ name: 'Ali', username: 'ali', password: 'xxxxxxxx1', role: 'admin' })
  return { p1: p1._id, p2: p2._id, ing: ing._id, table: tb._id, user: u._id }
})
t('order', async b => {
  const user = await M('User').findById(b.user)
  const r = await placeOrder(io, { tableId: b.table, tableNumber: 1, category: 'zal', items: b.items }, user)
  return r.order
})
t('extra', async b => M('Order').findByIdAndUpdate(b.id, { $push: { extras: { extraFee: b.fee, comment: b.comment } } }, { new: true }))
t('status', async b => M('Order').findByIdAndUpdate(b.id, { status: b.status }, { new: true }))
t('note', async b => M('Order').findByIdAndUpdate(b.id, { note: b.note }, { new: true }))
t('inc', async b => M('Ingredient').findByIdAndUpdate(b.id, { $inc: { quantity: b.by } }, { new: true }))
t('get', async b => M(b.model).findById(b.id).lean())
t('pull', async () => { await client.pull(io); return {} })
t('del', async b => M(b.model).deleteOne({ _id: b.id }))
t('ageTombs', async () => mongoose.connection.collection('sync_tombstones').updateMany({}, { $set: { _mtime: new Date(Date.now() - 200 * 86400000) } }))
t('purgeHub', async () => ({ n: await engine.purgeTombstonesHub() }))
t('setPulled', async b => mongoose.connection.collection('sync_state').updateOne({ _id: 'client' }, { $set: { pulled: b.v } }))
t('count', async b => ({ n: await M(b.model).countDocuments() }))
t('tick', async () => { await client.tick(io); return client.publicStatus() })
t('clock', async b => { require(S + '/sync/plugin').setClockOffset(b.ms); return {} })

mongoose.connect('mongodb://127.0.0.1:27017/rp_synctest_' + ROLE).then(async () => {
  await engine.migrate()
  app.listen(PORT, () => console.log(ROLE, 'ready', PORT))
})

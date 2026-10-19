// ── Chop etish xizmati ──────────────────────────────────────────
// Vazifa yaratish istalgan tugunda (cloud yoki kassa) ishlaydi.
// Printerga yuborish (agent) faqat restoran tarmog'idagi tugunda ishlaydi:
// kassa (NODE_ID=kassa) yoki PRINT_AGENT=1 qo'yilgan lokal server.
// Cloud VPS restoran ichidagi 192.168.x.x printerlarga yeta olmaydi.

const PrintJob  = require('../models/PrintJob')
const Settings  = require('../models/Settings')
const escpos    = require('./escpos')
const transport = require('./transport')

const AGENT    = process.env.NODE_ID === 'kassa' || process.env.PRINT_AGENT === '1'
const EXPIRE_MS = 30 * 60000     // 30 daqiqadan eski talon chiqarilmaydi (kech qolgan oshxona taloni foydasiz)
const KEEP_DAYS = 7
const MAX_TRIES = 3

const norm = s => String(s || '').trim().toLowerCase()
const snapshot = p => ({ name: p.name, conn: p.conn, ip: p.ip, port: p.port, device: p.device, paperWidth: p.paperWidth })
const placeLabel = o => (o.category === 'soboy' ? `Soboy #${o.tableNumber ?? ''}` : `Stol ${o.tableNumber ?? ''}`)

async function getSettings() {
  return (await Settings.findById('main').lean()) || {}
}
const active = s => (s.printers || []).filter(p => p.enabled !== false)

async function createJobs(list) {
  if (!list.length) return []
  const jobs = await PrintJob.create(list.map(j => ({ ...j, status: 'pending' })))   // create — sync belgilari qo'yilishi uchun (insertMany qo'ymaydi)
  kick()
  return jobs
}

// Mijoz cheki — "Chek" tugmasi
async function queueReceipt(order) {
  const s = await getSettings()
  const printers = active(s).filter(p => p.receipt)
  return createJobs(printers.map(p => ({
    kind: 'receipt', printerId: String(p._id), printer: snapshot(p),
    title: `${placeLabel(order)} — chek`,
    data: escpos.receipt(order, s, p.paperWidth),
  })))
}

// Yangi buyurtma (yoki qo'shimcha) talonlari: har bir printerga faqat
// uning kategoriyalaridagi taomlar. items: [{ name, quantity, category }]
async function queueOrderTickets(order, items, { added = false } = {}) {
  const s = await getSettings()
  const list = []
  for (const p of active(s).filter(p => p.orders)) {
    const cats = (p.categories || []).map(norm).filter(Boolean)
    const mine = cats.length ? items.filter(i => cats.includes(norm(i.category))) : items
    if (!mine.length) continue
    list.push({
      kind: 'order', printerId: String(p._id), printer: snapshot(p),
      title: `${placeLabel(order)} — ${p.name}`,
      data: escpos.ticket(order, mine, { station: p.name, added }, p.paperWidth),
    })
  }
  return createJobs(list)
}

async function queueTest(printerId) {
  const s = await getSettings()
  const p = (s.printers || []).find(x => String(x._id) === String(printerId))
  if (!p) throw Object.assign(new Error('Printer topilmadi'), { status: 404 })
  return createJobs([{ kind: 'test', printerId: String(p._id), printer: snapshot(p), title: `${p.name} — sinov`, data: escpos.test(p, s) }])
}

// ── Agent: navbatdagi vazifalarni printerga yuborish ───────────
let running = false, again = false

async function runOnce() {
  if (running) { again = true; return }
  running = true
  try {
    do {
      again = false
      const old = new Date(Date.now() - EXPIRE_MS)
      await PrintJob.updateMany({ status: 'pending', createdAt: { $lt: old } }, { $set: { status: 'expired', error: 'Vaqtida chiqarilmadi (30 daqiqadan oshdi)' } })
      for (;;) {
        // Navbatdan bittasini "egallash" — ikki marta chiqmasligi uchun
        const job = await PrintJob.findOneAndUpdate({ status: 'pending' }, { $set: { status: 'printing' }, $inc: { attempts: 1 } }, { sort: { createdAt: 1 }, new: true })
        if (!job) break
        try {
          await transport.send(job.printer || {}, job.data)
          job.status = 'done'; job.printedAt = new Date(); job.error = ''
        } catch (err) {
          job.error = err.message
          job.status = job.attempts >= MAX_TRIES ? 'error' : 'pending'
          if (job.status === 'pending') { await job.save(); setTimeout(kick, 3000); break }
        }
        await job.save()
      }
    } while (again)
  } catch (err) {
    console.error('🖨️  print agent:', err.message)
  } finally { running = false }
}

function kick() { if (AGENT) runOnce() }

async function start() {
  // Eski vazifalarni tozalash (ikkala tugunda)
  const clean = () => PrintJob.deleteMany({ createdAt: { $lt: new Date(Date.now() - KEEP_DAYS * 86400000) } }).catch(() => {})
  clean(); setInterval(clean, 6 * 3600000).unref()
  if (!AGENT) return
  // Server to'satdan to'xtagan bo'lsa "printing" holatida qolganlar qaytadan navbatga
  await PrintJob.updateMany({ status: 'printing' }, { $set: { status: 'pending' } })
  console.log('🖨️  Printer agenti ishlayapti')
  kick()
  // Cloud'dan sync orqali kelgan vazifalar uchun
  setInterval(kick, 2000).unref()
}

module.exports = { AGENT, queueReceipt, queueOrderTickets, queueTest, listDevices: transport.listDevices, start, kick }

// ── ESC/POS: chek va oshxona talonini printer buyruqlariga aylantirish ──
// Termal printerlar (Xprinter, Epson, Rongta va h.k.) to'g'ridan-to'g'ri
// shu baytlarni tushunadi: oyna, PDF yoki drayver dizayni kerak emas.
// Kirill harflar CP866 kod sahifasida yuboriladi.

const ESC = 0x1b, GS = 0x1d

// 58 mm qog'ozga 32 belgi, 80 mm ga 48 belgi sig'adi (A shrift)
const colsFor = paperWidth => (Number(paperWidth) === 80 ? 48 : 32)

// ── Matnni CP866 baytlarga ──────────────────────────────────────
const CYR = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмноп░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀рстуфхцчшщъыьэюяЁёЄєЇїЎў'
const CP866 = new Map([...CYR].map((ch, i) => [ch, 0x80 + i]))
// CP866 da yo'q o'zbek harflari — eng yaqin harfga
const FALLBACK = { 'Қ': 'К', 'қ': 'к', 'Ғ': 'Г', 'ғ': 'г', 'Ҳ': 'Х', 'ҳ': 'х', 'ʻ': "'", 'ʼ': "'", '‘': "'", '’': "'", '`': "'", '“': '"', '”': '"', '«': '"', '»': '"', '—': '-', '–': '-', '…': '...', '×': 'x', '№': 'N' }

function encode(str) {
  const out = []
  for (let ch of String(str ?? '')) {
    ch = FALLBACK[ch] || ch
    const c = ch.charCodeAt(0)
    if (c >= 0x20 && c < 0x7f) out.push(c)
    else if (CP866.has(ch)) out.push(CP866.get(ch))
    else if (ch === '\n') out.push(0x0a)
    else out.push(0x3f)   // ?
  }
  return out
}

// ── Qatorlarni tayyorlash ───────────────────────────────────────
const len = s => [...String(s)].length

// Uzun matnni so'zlar bo'yicha bir necha qatorga bo'lish
function wrap(text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (let w of words) {
    while (len(w) > width) { if (cur) { lines.push(cur); cur = '' } lines.push([...w].slice(0, width).join('')); w = [...w].slice(width).join('') }
    if (!cur) cur = w
    else if (len(cur) + 1 + len(w) <= width) cur += ' ' + w
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : ['']
}

// Chap matn + o'ng summa bir qatorda; chap matn sig'masa keyingi qatorga o'tadi
function pair(left, right, width) {
  right = String(right ?? '')
  const room = width - len(right) - 1
  const parts = wrap(left, Math.max(8, room))
  const last = parts.pop()
  return [...parts, last + ' '.repeat(Math.max(1, width - len(last) - len(right))) + right]
}

const money = n => (Math.round(Number(n) || 0)).toLocaleString('ru-RU').replace(/\s/g, ' ')

// ── Hujjat quruvchi ─────────────────────────────────────────────
class Doc {
  constructor(paperWidth) { this.cols = colsFor(paperWidth); this.bytes = [ESC, 0x40, ESC, 0x74, 17] }   // init, CP866
  raw(...b) { this.bytes.push(...b); return this }
  align(a) { return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0) }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0) }
  size(w, h) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)) }   // 1..2 marta katta
  text(s) { this.bytes.push(...encode(s)); return this }
  line(s = '') { return this.text(s).raw(0x0a) }
  // Katta shriftda bir qatorga yarim belgi sig'adi
  big(s, { center = true } = {}) {
    this.align(center ? 'center' : 'left').size(2, 2).bold(true)
    for (const l of wrap(s, Math.floor(this.cols / 2))) this.line(l)
    return this.size(1, 1).bold(false).align('left')
  }
  center(s) { this.align('center'); for (const l of wrap(s, this.cols)) this.line(l); return this.align('left') }
  rule(ch = '-') { return this.line(ch.repeat(this.cols)) }
  pair(l, r) { for (const s of pair(l, r, this.cols)) this.line(s); return this }
  wrapped(s, indent = '') { for (const l of wrap(s, this.cols - len(indent))) this.line(indent + l); return this }
  feed(n = 1) { return this.raw(ESC, 0x64, n) }
  cut() { return this.feed(4).raw(GS, 0x56, 0x42, 0) }   // qisman kesish
  build() { return Buffer.from(this.bytes) }
}

const when = d => new Date(d || Date.now()).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const CAT = { zal: 'Zal', xona: 'Xona', "ko'cha": "Ko'cha", soboy: 'Soboy' }
const place = o => (o.category === 'soboy' ? `Soboy #${o.tableNumber ?? ''}` : `${CAT[o.category] || ''} - Stol ${o.tableNumber ?? ''}`.trim())

// Mijoz cheki (to'lov uchun)
function receipt(order, settings = {}, paperWidth) {
  const r = settings.receipt || {}
  const d = new Doc(paperWidth)
  if (r.showLogo !== false) d.big(settings.brandName || 'RestoPro')
  if (r.headerText) d.center(r.headerText)
  d.feed(1).center(place(order))
  if (r.showWaiter !== false && order.waiterName) d.center(`Ofitsant: ${order.waiterName}`)
  if (r.showDateTime !== false) d.center(when())
  d.rule()
  for (const i of order.items || []) d.pair(`${i.quantity}x ${i.name}`, money(i.price * i.quantity))
  for (const e of order.extras || []) d.pair(`+ ${e.comment || "Qo'shimcha"}`, money(e.extraFee))
  d.rule()
  const subtotal = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0) + (order.extras || []).reduce((s, e) => s + (e.extraFee || 0), 0)
  if (order.serviceFee > 0 && order.category !== 'soboy') d.pair('Xizmat haqi', money(order.serviceFee))
  d.bold(true).size(1, 2).pair('JAMI', `${money(subtotal + (order.serviceFee || 0))} so'm`).size(1, 1).bold(false)
  d.rule()
  if (r.footerText) d.center(r.footerText)
  return d.cut().build()
}

// Oshxona / shashlikchi taloni: faqat shu printerga tegishli taomlar, narxsiz
function ticket(order, items, { station, added } = {}, paperWidth) {
  const d = new Doc(paperWidth)
  d.big(place(order))
  if (added) d.align('center').bold(true).line("*** QO'SHIMCHA ***").bold(false).align('left')
  d.center(`${station ? station + ' | ' : ''}${order.waiterName || ''}`)
  d.center(when())
  d.rule('=')
  d.size(1, 2).bold(true)
  for (const i of items) d.wrapped(`${i.quantity} x ${i.name}`)
  d.size(1, 1).bold(false)
  if (order.note) { d.rule(); d.wrapped(`Izoh: ${order.note}`) }
  d.rule('=')
  return d.cut().build()
}

function test(printer = {}, settings = {}) {
  const d = new Doc(printer.paperWidth)
  d.big(settings.brandName || 'RestoPro')
  d.center('Printer sinovi').center(printer.name || '').center(when()).rule()
  d.line("O'zbekcha: o'g'il, G'ishtko'prik")
  d.line('Кириллица: Ўзбекистон, Тошкент')
  d.rule().center('Printer ishlayapti')
  return d.cut().build()
}

module.exports = { receipt, ticket, test, colsFor, encode, wrap, pair }

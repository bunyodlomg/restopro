// ── ESC/POS: chek va oshxona talonini printer buyruqlariga aylantirish ──
// Termal printerlar (Xprinter, Epson, Rongta va h.k.) to'g'ridan-to'g'ri
// shu baytlarni tushunadi: oyna, PDF yoki drayver dizayni kerak emas.
// Kirill harflar CP866 kod sahifasida yuboriladi.

const ESC = 0x1b, GS = 0x1d

// 58 mm qog'ozga 32 belgi, 80 mm ga 48 belgi sig'adi (A shrift)
const colsFor = paperWidth => (Number(paperWidth) === 80 ? 48 : 32)

// ── Matnni CP866 baytlarga ──────────────────────────────────────
const CYR = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмноп░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀рстуфхцчшщъыьэюяЁёЄєЇїЎў°∙·'
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
  // init, xitoycha (ikki baytli) rejimni o'chirish — Xprinter zavoddan shu rejimda keladi, CP866
  constructor(paperWidth) { this.cols = colsFor(paperWidth); this.bytes = [ESC, 0x40, 0x1c, 0x2e, ESC, 0x74, 17] }
  raw(...b) { this.bytes.push(...b); return this }
  align(a) { return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a] ?? 0) }
  bold(on) { return this.raw(ESC, 0x45, on ? 1 : 0) }
  invert(on) { return this.raw(GS, 0x42, on ? 1 : 0) }                 // oq harf, qora fon
  size(w, h) { return this.raw(GS, 0x21, ((w - 1) << 4) | (h - 1)) }   // 1..2 marta katta
  text(s) { this.bytes.push(...encode(s)); return this }
  line(s = '') { return this.text(s).raw(0x0a) }
  // Katta shriftda bir qatorga yarim belgi sig'adi
  big(s, { center = true } = {}) {
    this.align(center ? 'center' : 'left').size(2, 2).bold(true)
    for (const l of wrap(s, Math.floor(this.cols / 2))) this.line(l)
    return this.size(1, 1).bold(false).align('left')
  }
  // Butun en bo'ylab qora tasma ichida katta oq yozuv (oshxonada uzoqdan ko'rinadi)
  banner(s) {
    const w = Math.floor(this.cols / 2)
    this.align('left').size(2, 2).bold(true).invert(true)
    for (const l of wrap(s, w - 2)) {
      const pad = w - len(l)
      this.line(' '.repeat(Math.floor(pad / 2)) + l + ' '.repeat(Math.ceil(pad / 2)))
    }
    return this.invert(false).size(1, 1).bold(false)
  }
  center(s) { this.align('center'); for (const l of wrap(s, this.cols)) this.line(l); return this.align('left') }
  rule(ch = '=') { return this.line(ch.repeat(this.cols)) }
  pair(l, r) { for (const s of pair(l, r, this.cols)) this.line(s); return this }
  wrapped(s, indent = '', hang = indent) {                              // hang — keyingi qatorlar cheki
    wrap(s, this.cols - len(hang)).forEach((l, i) => this.line((i ? hang : indent) + l))
    return this
  }
  // ── Jadval: widths — ustunlarning ichki kengligi (har tomonida 1 bo'shliq + chegara) ──
  border(widths) { return this.line('+' + widths.map(w => '-'.repeat(w + 2)).join('+') + '+') }
  // cells: matn yoki matnlar massivi (har biri yangi qatordan); align: 'l' | 'r'
  row(widths, cells, align = []) {
    const cols = cells.map((c, k) => [].concat(c).flatMap(s => (len(s) <= widths[k] ? [s] : wrap(s, widths[k]))))   // sig'gan qator o'z bo'shliqlari bilan qoladi
    const h = Math.max(...cols.map(c => c.length))
    for (let n = 0; n < h; n++) {
      this.line('|' + cols.map((c, k) => {
        const s = c[n] || '', pad = ' '.repeat(Math.max(0, widths[k] - len(s)))
        return ' ' + (align[k] === 'r' ? pad + s : s + pad) + ' '
      }).join('|') + '|')
    }
    return this
  }
  // Bir nechta ustunni bitta katakka birlashtirish: span([24, 4, 10], 0, 2) → [31, 10]
  static span(widths, from, to) {
    const merged = widths.slice(from, to).reduce((s, w) => s + w, 0) + 3 * (to - from - 1)
    return [...widths.slice(0, from), merged, ...widths.slice(to)]
  }
  feed(n = 1) { return this.raw(ESC, 0x64, n) }
  cut() { return this.raw(GS, 0x56, 0x42, 2) }   // kesgichgacha surib, qisman kesish (ortiqcha bo'sh qog'ozsiz)
  build() { return Buffer.from(this.bytes) }
}

const two = n => String(n).padStart(2, '0')
const dateOf = d => { d = new Date(d || Date.now()); return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}` }
const timeOf = d => { d = new Date(d || Date.now()); return `${two(d.getHours())}:${two(d.getMinutes())}` }
const when = d => `${dateOf(d)} ${timeOf(d)}`
const { labelOf } = require('../utils/sections')
const place = (o, s) => (o.category === 'soboy' ? `Soboy #${o.tableNumber ?? ''}` : `${labelOf(s, o.category)} · Stol ${o.tableNumber ?? ''}`.trim())
// "Kabob | Tovuq" — taom va uning turi
const splitName = n => { const [base, ...v] = String(n || '').split(' | '); return { base, variant: v.join(', ') } }

// Mijoz cheki (to'lov uchun)
function receipt(order, settings = {}, paperWidth) {
  const r = settings.receipt || {}
  const d = new Doc(paperWidth)
  const wide = d.cols >= 42
  if (r.showLogo !== false) d.big(settings.brandName || 'RestoPro')
  if (r.headerText) d.center(r.headerText)
  d.feed(1).banner(place(order, settings))

  // Hammasi bitta jadvalda: Taom | Soni | Summa (80 mm: 24+4+10, 58 mm: 10+3+9 belgi),
  // har bir taom o'z katagida; ofitsant/vaqt — tepadagi birlashtirilgan katakda, ustunlar oxirigacha
  const W = wide ? [24, 4, 10] : [10, 3, 9]
  const R = ['l', 'r', 'r']
  const ALL = Doc.span(W, 0, 3)
  const waiter = r.showWaiter !== false && order.waiterName ? `Ofitsant: ${order.waiterName}` : ''
  const dt = r.showDateTime !== false ? when() : ''
  if (waiter || dt) {
    // Bir qatorga sig'sa: chapda ofitsant, o'ngda vaqt; sig'masa — ikki qator
    const info = len(waiter) + 1 + len(dt) <= ALL[0] ? pair(waiter, dt, ALL[0]) : [waiter, dt].filter(Boolean)
    d.border(ALL).row(ALL, [info])
  }
  d.border(W).bold(true).row(W, ['Taom', wide ? 'Soni' : 'Son', 'Summa'], R).bold(false).border(W)
  for (const i of order.items || []) {
    const { base, variant } = splitName(i.name)
    d.row(W, [variant ? `${base} (${variant})` : base, String(i.quantity), money(i.price * i.quantity)], R).border(W)
  }
  for (const e of order.extras || []) d.row(W, [`+ ${e.comment || "Qo'shimcha"}`, '', money(e.extraFee)], R).border(W)

  const subtotal = (order.items || []).reduce((s, i) => s + i.price * i.quantity, 0) + (order.extras || []).reduce((s, e) => s + (e.extraFee || 0), 0)
  const fee = order.serviceFee > 0 && order.category !== 'soboy' ? order.serviceFee : 0
  if (fee) d.row(W, ['Taomlar', '', money(subtotal)], R).border(W).row(W, ['Xizmat haqi', '', money(fee)], R).border(W)
  d.size(1, 2).bold(true).row(W, ["JAMI, so'm", '', money(subtotal + fee)], R).size(1, 1).bold(false).border(W)
  if (r.footerText) d.feed(1).center(r.footerText)
  return d.feed(1).cut().build()
}

// Oshxona / shashlikchi taloni: faqat shu printerga tegishli taomlar, narxsiz
function ticket(order, items, { station, added, settings } = {}, paperWidth) {
  const d = new Doc(paperWidth)
  d.banner(place(order, settings))
  if (added) d.align('center').size(1, 2).bold(true).line("+++ QO'SHIMCHA +++").size(1, 1).bold(false).align('left')
  d.bold(true).pair(station || '', timeOf()).bold(false)
  d.pair(order.waiterName ? `Ofitsant: ${order.waiterName}` : '', dateOf())

  // Jadval: Soni | Taom (turi taom ostida "> Tovuq"); qatorlar baland va qalin
  const W = d.cols >= 42 ? [4, 37] : [3, 22]
  d.border(W).bold(true).row(W, [d.cols >= 42 ? 'Soni' : 'Son', 'Taom']).border(W)
  for (const i of items) {
    const { base, variant } = splitName(i.name)
    d.size(1, 2).row(W, [String(i.quantity), variant ? [base, `> ${variant}`] : base], ['r']).size(1, 1).border(W)
  }
  d.bold(false)
  if (order.note) d.bold(true).line('IZOH:').bold(false).size(1, 2).wrapped(order.note).size(1, 1).rule()
  d.pair(`${items.length} xil taom`, `jami ${items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} ta`)
  return d.feed(1).cut().build()
}

function test(printer = {}, settings = {}) {
  const d = new Doc(printer.paperWidth)
  d.banner(settings.brandName || 'RestoPro')
  d.feed(1).center('Printer sinovi').center(printer.name || '').center(when()).rule()
  d.line("O'zbekcha: o'g'il, G'ishtko'prik")
  d.line('Кириллица: Ўзбекистон, Тошкент')
  d.rule().center('Printer ishlayapti')
  return d.feed(1).cut().build()
}

module.exports = { receipt, ticket, test, colsFor, encode, wrap, pair }

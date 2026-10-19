// ============================================================
//  Chek (receipt) HTML generatori
//  Sozlamalardagi `receipt` dizayniga asoslanadi.
//  Ham chop etishda (Orders), ham jonli ko'rinishda (Settings) ishlatiladi.
// ============================================================

import { API_URL } from '../config.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
))

const num = (n) => (Number(n) || 0).toLocaleString()

// Standart qiymatlar — settings.receipt bo'lmasa
const DEFAULTS = {
  headerText:   '',
  footerText:   'Rahmat! Yana keling',
  showLogo:     true,
  showWaiter:   true,
  showDateTime: true,
  paperWidth:   58,
  fontSize:     12,
}

export function buildReceiptHTML(order = {}, settings = {}) {
  const r  = { ...DEFAULTS, ...(settings.receipt || {}) }
  const fs = Number(r.fontSize) || 12
  const w  = [58, 80].includes(Number(r.paperWidth)) ? Number(r.paperWidth) : 58

  const items   = order.items   || []
  const extras  = order.extras  || []
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0)
                 + extras.reduce((s, e) => s + (e.extraFee || 0), 0)
  const fee   = order.serviceFee || 0
  const total = subtotal + fee
  const isSoboy = order.category === 'soboy'

  // Logo faqat yuklangan rasm bo'lsa chiqadi; aks holda brend nomi qalin yoziladi
  const logo = settings.brandLogo || ''
  const isImage = logo.startsWith('/') || logo.startsWith('http')
  const logoUrl = isImage ? (logo.startsWith('http') ? logo : `${API_URL}${logo}`) : ''
  const showLogo = r.showLogo && isImage

  const itemRows = items.map((i) =>
    `<div class="row"><span>${i.quantity}× ${esc(i.name)}</span><span>${num(i.price * i.quantity)}</span></div>`
  ).join('')

  const extraRows = extras.map((e) =>
    `<div class="row"><span>+ ${esc(e.comment || "Qo'shimcha")}</span><span>${num(e.extraFee || 0)}</span></div>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Chek</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{background:#fff;color:#000}
    body{font-family:'IBM Plex Mono',ui-monospace,'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:${fs}px;line-height:1.4;width:${w}mm;padding:4mm}
    .logo{text-align:center;margin-bottom:4px}
    .logo img{max-width:60%;max-height:${fs * 5}px;object-fit:contain;filter:grayscale(1)}
    h2{text-align:center;font-size:${fs + 4}px;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
    .sub{text-align:center;font-size:${fs - 1}px;color:#444;margin-top:2px}
    hr{border:0;border-top:1px dashed #999;margin:6px 0}
    .row{display:flex;justify-content:space-between;gap:8px;padding:1.5px 0}
    .row span:last-child{white-space:nowrap;text-align:right}
    .total{font-weight:700;font-size:${fs + 3}px;padding-top:3px}
    .footer{text-align:center;font-size:${fs - 1}px;color:#555;margin-top:8px;white-space:pre-line}
    @media print{body{width:auto}}
  </style></head><body>
    ${showLogo ? `<div class="logo"><img src="${esc(logoUrl)}" alt=""></div>` : ''}
    <h2>${esc(settings.brandName || 'RestoPro')}</h2>
    ${r.headerText ? `<div class="sub">${esc(r.headerText)}</div>` : ''}
    <div class="sub">
      ${isSoboy ? `Soboy #${esc(order.tableNumber)}` : `${esc(order.category || '')} — Stol ${esc(order.tableNumber)}`}
      ${r.showWaiter && order.waiterName ? `<br>Ofitsant: ${esc(order.waiterName)}` : ''}
      ${r.showDateTime ? `<br>${new Date().toLocaleString('uz-UZ')}` : ''}
    </div>
    <hr/>
    ${itemRows}${extraRows}
    <hr/>
    ${fee > 0 && !isSoboy ? `<div class="row"><span>Xizmat haqi</span><span>${num(fee)}</span></div>` : ''}
    <div class="row total"><span>JAMI</span><span>${num(total)} so'm</span></div>
    <hr/>
    ${r.footerText ? `<div class="footer">${esc(r.footerText)}</div>` : ''}
  </body></html>`
}

// Chekni chop etish.
//  - Kassa / ofitsant terminali (Electron): to'g'ridan-to'g'ri standart printerga, oynasiz
//  - Oddiy brauzer: yashirin iframe orqali (yangi oyna ochilmaydi — popup bloklanmaydi)
// { ok, error } qaytaradi.
export async function printReceipt(order, settings) {
  const html = buildReceiptHTML(order, settings)
  const paperWidth = Number(settings?.receipt?.paperWidth) === 80 ? 80 : 58
  if (window.rpNative?.print) {
    try { return await window.rpNative.print(html, { paperWidth }) }
    catch (err) { return { ok: false, error: err.message } }
  }
  return printViaIframe(html)
}

function printViaIframe(html) {
  return new Promise(resolve => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(frame)
    const cleanup = () => setTimeout(() => frame.remove(), 1500)
    frame.onload = () => {
      // Rasm (logo) yuklanishini kutish
      setTimeout(() => {
        try {
          frame.contentWindow.focus()
          frame.contentWindow.print()
          resolve({ ok: true })
        } catch (err) { resolve({ ok: false, error: err.message }) }
        cleanup()
      }, 250)
    }
    frame.srcdoc = html
  })
}

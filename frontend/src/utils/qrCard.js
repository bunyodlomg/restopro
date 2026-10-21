import QRCode from 'qrcode'

// ── Stol QR kartochkasi: chop etish va yuklab olish uchun yuqori sifatli rasm ──
// A6 (105×148 mm) 300 DPI = 1240×1748 px. QR "H" darajada — markazdagi logotip skanerlashga xalaqit bermaydi.
export const CARD_W = 1240
export const CARD_H = 1748

export const QR_THEMES = [
  { id: 'light', label: 'Oq' },
  { id: 'dark', label: 'Qora' },
  { id: 'brand', label: 'Rangli' },
]

const cssVar = (name, fb) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb
const fontFamily = () => getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Matn sig'masa — shrift kichrayadi
function fitText(ctx, text, maxW, weight, size, family) {
  let s = size
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 4 } while (ctx.measureText(text).width > maxW && s > 20)
}

export const loadImage = src => new Promise(resolve => {
  if (!src) return resolve(null)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

// opts: { url, brand, logo (Image|null), section, number, theme, title, subtitle }
export async function drawQrCard(opts) {
  const { url, brand, logo, section, number, theme = 'light', title, subtitle } = opts
  const accent = cssVar('--accent', '#E8402F')
  const family = fontFamily()
  const c = document.createElement('canvas')
  c.width = CARD_W; c.height = CARD_H
  const ctx = c.getContext('2d')

  const dark = theme === 'dark', brandBg = theme === 'brand'
  const bg = dark ? '#0B0B0C' : brandBg ? accent : '#FFFFFF'
  const ink = dark || brandBg ? '#FFFFFF' : '#0B0B0C'
  const muted = dark ? '#9A9AA0' : brandBg ? 'rgba(255,255,255,.82)' : '#6B6B72'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  // Yuqori: logotip + restoran nomi
  const cx = CARD_W / 2
  let y = 120
  if (logo) {
    const s = 150
    ctx.save(); roundRect(ctx, cx - s / 2, y, s, s, 40); ctx.clip()
    ctx.drawImage(logo, cx - s / 2, y, s, s); ctx.restore()
    y += s + 80
  } else y += 40
  ctx.fillStyle = ink
  fitText(ctx, brand || 'RestoPro', CARD_W - 160, 800, 78, family)
  ctx.fillText(brand || 'RestoPro', cx, y)

  y += 70
  ctx.fillStyle = muted
  fitText(ctx, title || 'Menyu va buyurtma', CARD_W - 200, 500, 46, family)
  ctx.fillText(title || 'Menyu va buyurtma', cx, y)

  // QR: oq "plastinka" ichida (har qanday fonda yaxshi skanerlanadi)
  const plate = 760, px = cx - plate / 2, py = y + 60
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, px, py, plate, plate, 56); ctx.fill()
  if (!dark && !brandBg) { ctx.strokeStyle = '#E4E4E0'; ctx.lineWidth = 4; ctx.stroke() }
  const q = document.createElement('canvas')
  await QRCode.toCanvas(q, url, { errorCorrectionLevel: 'H', margin: 0, width: plate - 120, color: { dark: '#0B0B0C', light: '#FFFFFF' } })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(q, px + 60, py + 60)
  ctx.imageSmoothingEnabled = true
  if (logo) {
    const s = 150, lx = cx - s / 2, ly = py + plate / 2 - s / 2
    ctx.fillStyle = '#FFFFFF'; roundRect(ctx, lx - 14, ly - 14, s + 28, s + 28, 40); ctx.fill()
    ctx.save(); roundRect(ctx, lx, ly, s, s, 32); ctx.clip(); ctx.drawImage(logo, lx, ly, s, s); ctx.restore()
  }

  // Pastki: bo'lim + stol raqami
  y = py + plate + 150
  ctx.fillStyle = dark ? accent : brandBg ? '#FFFFFF' : accent
  ctx.font = `700 40px ${family}`
  const sec = String(section || '').toUpperCase()
  ctx.fillText(sec ? `${sec} · STOL` : 'STOL', cx, y)
  ctx.fillStyle = ink
  ctx.font = `800 230px ${family}`
  ctx.fillText(String(number).padStart(2, '0'), cx, y + 220)

  ctx.fillStyle = muted
  fitText(ctx, subtitle || '', CARD_W - 200, 500, 38, family)
  if (subtitle) ctx.fillText(subtitle, cx, CARD_H - 90)
  return c
}

export const canvasBlob = c => new Promise(r => c.toBlob(r, 'image/png'))

export function downloadBlob(blob, name) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

// ── Oddiy ZIP (siqmasdan, "store") — hamma QR kartochkalarni bitta faylda yuklash uchun ──
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }

export async function makeZip(files) {   // files: [{ name, blob }]
  const enc = new TextEncoder()
  const parts = [], central = []
  let offset = 0
  for (const f of files) {
    const data = new Uint8Array(await f.blob.arrayBuffer())
    const name = enc.encode(f.name)
    const crc = crc32(data)
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true)   // UTF-8 nom
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true)
    h.setUint16(26, name.length, true)
    parts.push(h, name, data)
    const ch = new DataView(new ArrayBuffer(46))
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true)
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true)
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true)
    central.push(ch, name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((s, p) => s + p.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end], { type: 'application/zip' })
}

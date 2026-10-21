// ── Ilova ikonkasi: Sozlamalardan o'zgartiriladi (admin), har kassa / terminal o'zi qo'llaydi ──
// Oyna, tray va Windows yorliqlari (ish stoli, Start menyu, vazifalar paneli) ikonkasi almashadi.
// Exe ichidagi ikonka o'zgarmaydi — yorliqlar alohida .ico faylga qaratiladi (%APPDATA%/<ilova>/app-icon.ico).
// Standartga qaytarilsa — yorliqlar yana exe ikonkasiga qaraydi.
const { app, nativeImage, shell, BrowserWindow } = require('electron')
const path = require('path')
const fs   = require('fs')

const ICO = () => path.join(app.getPath('userData'), 'app-icon.ico')
const PNG = () => path.join(app.getPath('userData'), 'app-icon.png')
const SRC = () => path.join(app.getPath('userData'), 'app-icon.src')   // qaysi rasmdan yasalgan (qayta yuklamaslik uchun)

// PNG'larni bitta .ico ga (Windows Vista+ ichida PNG qabul qiladi)
function toIco(img) {
  const pngs = [256, 64, 48, 32, 16].map(s => ({ s, buf: img.resize({ width: s, height: s, quality: 'best' }).toPNG() }))
  const head = Buffer.alloc(6 + 16 * pngs.length)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4)
  let offset = head.length
  pngs.forEach(({ s, buf }, i) => {
    const o = 6 + 16 * i
    head.writeUInt8(s >= 256 ? 0 : s, o); head.writeUInt8(s >= 256 ? 0 : s, o + 1)
    head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6)
    head.writeUInt32LE(buf.length, o + 8); head.writeUInt32LE(offset, o + 12)
    offset += buf.length
  })
  return Buffer.concat([head, ...pngs.map(p => p.buf)])
}

// Kvadrat qilib kesish (markazdan) — logotip to'rtburchak bo'lsa ham ikonka cho'zilmasin
function square(img) {
  const { width: w, height: h } = img.getSize()
  if (w === h) return img
  const s = Math.min(w, h)
  return img.crop({ x: Math.floor((w - s) / 2), y: Math.floor((h - s) / 2), width: s, height: s })
}

// Shu ilovaga qaragan yorliqlar (.lnk)
function shortcuts() {
  const name = app.getName()
  const dirs = [
    app.getPath('desktop'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
  ]
  const exe = path.resolve(process.execPath).toLowerCase()
  const out = []
  for (const dir of dirs) {
    let files = []
    try { files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.lnk')) } catch { continue }
    for (const f of files) {
      const lnk = path.join(dir, f)
      try {
        const t = shell.readShortcutLink(lnk)
        if (path.resolve(t.target || '').toLowerCase() === exe || f.toLowerCase() === `${name.toLowerCase()}.lnk`) out.push(lnk)
      } catch {}
    }
  }
  return out
}

function updateShortcuts(icon) {
  if (process.platform !== 'win32' || !app.isPackaged) return 0
  let n = 0
  for (const lnk of shortcuts()) {
    try { if (shell.writeShortcutLink(lnk, 'update', { icon: icon || process.execPath, iconIndex: 0 })) n++ } catch {}
  }
  return n
}

let defaultIcon = null
let onImage = () => {}
const current = () => (fs.existsSync(PNG()) ? nativeImage.createFromPath(PNG()) : nativeImage.createFromPath(defaultIcon))
function applyWindows() {
  const img = current()
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.setIcon(img)
  onImage(img)
}

// url — rasm manzili (http...), bo'sh — standart ikonka
async function set(url) {
  url = String(url || '')
  if (url && !/^https?:\/\//i.test(url)) throw new Error("Rasm manzili noto'g'ri")
  let prev = ''
  try { prev = fs.readFileSync(SRC(), 'utf8') } catch {}
  if (url === prev) return { ok: true, changed: false }
  if (!url) {
    for (const f of [ICO(), PNG(), SRC()]) fs.rmSync(f, { force: true })
    applyWindows()
    return { ok: true, changed: true, shortcuts: updateShortcuts(null) }
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error(`Rasmni yuklab bo'lmadi (${r.status})`)
  const img = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()))
  if (img.isEmpty()) throw new Error('Rasm formati qo\'llab-quvvatlanmaydi (PNG yoki JPG kerak)')
  const sq = square(img).resize({ width: 256, height: 256, quality: 'best' })
  fs.writeFileSync(PNG(), sq.toPNG())
  fs.writeFileSync(ICO(), toIco(sq))
  fs.writeFileSync(SRC(), url)
  applyWindows()
  return { ok: true, changed: true, shortcuts: updateShortcuts(ICO()) }
}

// main.js: setup({ icon: assets/icon.png, onImage: img => tray.setImage(...) })
function setup({ icon, onImage: cb } = {}) {
  defaultIcon = icon
  if (cb) onImage = cb
  require('electron').ipcMain.handle('rp:icon:set', async (_e, url) => {
    try { return await set(url) } catch (err) { return { ok: false, message: err.message } }
  })
}

module.exports = { setup, current, set }

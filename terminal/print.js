// Chekni oynasiz (dialogsiz) standart printerga chiqarish.
// Renderer: window.rpNative.print(html, { paperWidth: 58|80 }) → { ok, error? }
const { BrowserWindow } = require('electron')

const VIRTUAL = /pdf|xps|onenote|fax|print to/i
const NO_PRINTER = 'Printer topilmadi. Windows sozlamalarida standart printerni tanlang.'

async function printHtml(html, opts = {}) {
  if (typeof html !== 'string' || !html) return { ok: false, error: 'Chek matni bo\'sh' }
  if (html.length > 2_000_000) return { ok: false, error: 'Chek juda katta' }
  const paperWidth = Number(opts.paperWidth) === 80 ? 80 : 58
  const win = new BrowserWindow({
    show: false,
    width: Math.round(paperWidth * 3.78) + 20,   // mm → px (96 dpi)
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false, javascript: false, sandbox: true },
  })
  try {
    const printers = await win.webContents.getPrintersAsync()
    if (!printers.length) return { ok: false, error: NO_PRINTER }
    const deviceName = opts.deviceName && printers.some(p => p.name === opts.deviceName) ? opts.deviceName : undefined
    // PDF/XPS kabi virtual printer "faylni saqlash" oynasini ochadi — chek printeri emas
    const target = deviceName || printers.find(p => p.isDefault)?.name || ''
    if (VIRTUAL.test(target)) return { ok: false, error: `«${target}» chek printeri emas. Sozlamalar → Printerlar bo'limida chek printerini qo'shing.` }
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    return await new Promise(resolve => {
      win.webContents.print({
        silent: true,
        printBackground: true,
        deviceName,
        margins: { marginType: 'none' },
        pageSize: { width: paperWidth * 1000, height: 297000 },   // mikron
      }, (success, reason) => resolve(success ? { ok: true } : { ok: false, error: reason === 'cancelled' ? 'Bekor qilindi' : `Chop etilmadi: ${reason || 'noma\'lum xato'}` }))
    })
  } catch (err) {
    return { ok: false, error: 'Chop etilmadi: ' + err.message }
  } finally {
    setTimeout(() => { if (!win.isDestroyed()) win.destroy() }, 500)
  }
}

module.exports = { printHtml }

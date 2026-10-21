// ============================================================
//  RestoPro Ofitsant — ofitsantlar monobloki uchun terminal
//
//  Kassa (yoki cloud) serveridagi ilovani to'liq ekranda ochadi.
//  Ofitsantlar 4 raqamli PIN bilan kiradi (/login?terminal=1).
//  Chek to'g'ridan-to'g'ri standart printerga chiqadi (rpNative.print).
//  Chiqish: tray → Chiqish yoki Ctrl+Shift+Q.
// ============================================================
const updater = require('./updater')
const appIcon = require('./appicon')
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, globalShortcut } = require('electron')
const path = require('path')
const fs   = require('fs')

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }
// Eski "Program Files" nusxasidan ochilgan bo'lsa — yangi (foydalanuvchi papkasidagi) nusxani ochamiz
const migrate = require('./migrate')
if (migrate.redirectToNew()) process.exit(0)

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json')
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')) } catch { return {} }
}
function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true })
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(cfg, null, 2))
}
let config = {}

function normalizeUrl(u) {
  u = String(u || '').trim().replace(/\/+$/, '')
  if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u
  return u
}

async function checkServer(url) {
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return { ok: false, message: `Server javobi: ${r.status}` }
    const j = await r.json().catch(() => null)
    if (j?.status !== 'ok') return { ok: false, message: 'Bu manzilda RestoPro serveri topilmadi' }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: 'Serverga ulanib bo\'lmadi: ' + (err.cause?.code || err.message) }
  }
}

// ── Oynalar ────────────────────────────────────────────────────
let mainWin = null, setupWin = null, tray = null, quitting = false
const ICON = path.join(__dirname, 'assets', 'icon.png')

function createSetupWindow() {
  if (setupWin) { setupWin.focus(); return }
  setupWin = new BrowserWindow({
    width: 560, height: 560, resizable: false, title: 'RestoPro Ofitsant — sozlash',
    autoHideMenuBar: true, backgroundColor: '#0B0B0C', icon: appIcon.current(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  })
  setupWin.loadFile(path.join(__dirname, 'setup.html'))
  setupWin.on('closed', () => { setupWin = null; if (!config.url && !quitting) app.quit() })
}

function createMainWindow() {
  if (!mainWin) {
    mainWin = new BrowserWindow({
      fullscreen: true, autoHideMenuBar: true, backgroundColor: '#0B0B0C', icon: appIcon.current(),
      title: 'RestoPro Ofitsant', show: false,
      webPreferences: { preload: path.join(__dirname, 'preload-app.js'), contextIsolation: true, nodeIntegration: false },
    })
    mainWin.once('ready-to-show', () => mainWin.show())
    // Yangi oynalar ochilmaydi (about:blank ham); tashqi http(s) havolalar brauzerda
    mainWin.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url) && config.url && !url.startsWith(config.url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    // Server o'chsa — offline sahifa (avtomatik qayta urinadi)
    mainWin.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) showOffline()
    })
    mainWin.on('close', e => {
      if (quitting) return
      e.preventDefault()
      confirmQuit()
    })
    mainWin.on('closed', () => { mainWin = null })
  }
  openApp()
}

async function openApp() {
  if (!mainWin) return createMainWindow()
  const ok = await checkServer(config.url)
  if (!ok.ok) return showOffline()
  mainWin.loadURL(`${config.url}/login?terminal=1`)
}
function showOffline() {
  if (!mainWin) return
  mainWin.loadFile(path.join(__dirname, 'offline.html'))
}

async function confirmQuit() {
  const { response } = await dialog.showMessageBox(mainWin || undefined, {
    type: 'question', buttons: ['Chiqish', 'Bekor qilish'], defaultId: 1, cancelId: 1,
    title: 'RestoPro Ofitsant', message: 'Terminal dasturidan chiqasizmi?',
  })
  if (response === 0) { quitting = true; app.quit() }
}

function createTray() {
  tray = new Tray(appIcon.current().resize({ width: 16, height: 16 }))
  tray.setToolTip('RestoPro Ofitsant')
  refreshTrayMenu()
}
function refreshTrayMenu() {
  if (!tray) return
  const u = updater.state
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Qayta yuklash', click: () => openApp() },
    { label: 'Manzilni o\'zgartirish', click: createSetupWindow },
    { type: 'separator' },
    u.status === 'ready'
      ? { label: `Yangilash: ${u.version} (qayta ishga tushadi)`, click: () => updater.install() }
      : { label: `Versiya ${app.getVersion()}${u.status === 'downloading' ? ` — yuklanmoqda ${u.progress}%` : ''}`, enabled: false },
    { label: 'Yangilanishni tekshirish', enabled: u.status !== 'disabled' && u.status !== 'ready', click: () => updater.check() },
    { type: 'separator' },
    { label: 'Chiqish', click: confirmQuit },
  ]))
}

// ── IPC ────────────────────────────────────────────────────────
ipcMain.handle('rp:print', (_e, html, opts) => require('./print').printHtml(html, { ...opts, deviceName: config.printer }))
ipcMain.handle('term:get', () => ({ url: config.url || '', autostart: config.autostart !== false }))
ipcMain.handle('term:test', (_e, url) => checkServer(normalizeUrl(url)))
ipcMain.handle('term:save', (_e, { url, autostart }) => {
  config.url = normalizeUrl(url)
  config.autostart = autostart !== false
  saveConfig(config)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: config.autostart })
  setupWin?.destroy()
  createMainWindow()
  return { ok: true }
})
ipcMain.handle('term:retry', () => openApp())
ipcMain.handle('term:setup', () => createSetupWindow())

// ── Ishga tushirish ────────────────────────────────────────────
app.on('second-instance', () => { if (mainWin) { mainWin.show(); mainWin.focus() } else if (setupWin) setupWin.focus() })
app.on('window-all-closed', () => { /* trayda qoladi */ })
app.on('will-quit', () => globalShortcut.unregisterAll())

app.whenReady().then(() => {
  config = loadConfig()
  appIcon.setup({ icon: ICON, onImage: img => tray?.setImage(img.resize({ width: 16, height: 16 })) })
  // Windows bilan birga ochilish — har safar joriy nusxa yo'li bilan (ko'chishdan keyin eski yo'l qolmasin)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: config.autostart !== false })
  createTray()
  globalShortcut.register('CommandOrControl+Shift+Q', confirmQuit)
  if (config.url) createMainWindow()
  else createSetupWindow()
  const feed = async () => config.url ? (await fetch(`${config.url}/api/license/update-token`, { signal: AbortSignal.timeout(10000) })).json() : null
  updater.setup({ channel: 'terminal', feed, onBeforeInstall: async () => { quitting = true; globalShortcut.unregisterAll(); tray?.destroy(); tray = null }, onChange: () => refreshTrayMenu() })
  // Bir martalik: Program Files'dan foydalanuvchi papkasiga ko'chish — yangilanishlar ruxsatsiz bo'lishi uchun
  setTimeout(() => migrate.offerMigration({ parent: mainWin || undefined, feed, channel: 'terminal', beforeQuit: async () => { quitting = true } }), 15000)
})

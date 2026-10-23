// ============================================================
//  RestoPro Kassa — Electron asosiy jarayoni
//
//  Kassa kompyuterida:
//    1. MongoDB (mongod) ishga tushadi — ma'lumotlar foydalanuvchi papkasida
//    2. RestoPro server ishga tushadi (0.0.0.0:5050) — ofitsant telefonlari
//       restoran Wi-Fi orqali http://<kassa-IP>:5050 ga kiradi
//    3. Internet bo'lsa cloud bilan avtomatik sinxronlanadi (server/sync)
//  Oyna yopilsa dastur trayda ishlashda davom etadi (ofitsantlar uchun).
// ============================================================
const updater = require('./updater')
const appIcon = require('./appicon')
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, clipboard, nativeImage, Notification } = require('electron')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')
const net    = require('net')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }
// Eski "Program Files" nusxasidan ochilgan bo'lsa — yangi (foydalanuvchi papkasidagi) nusxani ochamiz
const migrate = require('./migrate')
if (migrate.redirectToNew()) process.exit(0)

const IS_WIN = process.platform === 'win32'
const EXE    = IS_WIN ? '.exe' : ''
const RES    = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources')
const SERVER_DIR = path.join(RES, 'server')
const WEB_DIR    = path.join(RES, 'web')
const MONGO_BIN  = path.join(RES, 'mongodb')

const DATA        = app.getPath('userData')
const DB_DIR      = path.join(DATA, 'db')
const UPLOAD_DIR  = path.join(DATA, 'uploads')
const LOG_DIR     = path.join(DATA, 'logs')
const BACKUP_DIR  = path.join(DATA, 'backups')
const CONFIG_FILE = path.join(DATA, 'config.json')
const MONGO_PORT  = 27027
const BACKUP_KEEP = 14

for (const d of [DB_DIR, UPLOAD_DIR, LOG_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true })

// ── Sozlamalar ─────────────────────────────────────────────────
// mode: 'sync' (cloud bilan) | 'standalone' (faqat lokal) | undefined (hali sozlanmagan)
function loadConfig() {
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) } catch {}
  if (!cfg.jwtSecret) cfg.jwtSecret = crypto.randomBytes(32).toString('hex')
  if (!cfg.port) cfg.port = 5050
  // Har kassaning o'z nomi — bir nechta kassa bir-birining o'zgarishlarini ko'rishi uchun
  if (!cfg.nodeId) cfg.nodeId = 'kassa-' + crypto.randomBytes(4).toString('hex')
  saveConfig(cfg)
  return cfg
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
}
let config = loadConfig()

const log = (file) => fs.createWriteStream(path.join(LOG_DIR, file), { flags: 'a' })

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address)
}
const waiterUrls = () => lanAddresses().map(ip => `http://${ip}:${config.port}`)

function waitPort(port, timeoutMs) {
  const end = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1')
      s.once('connect', () => { s.destroy(); resolve() })
      s.once('error', () => {
        s.destroy()
        if (Date.now() > end) reject(new Error(`port ${port} ochilmadi`))
        else setTimeout(tryOnce, 500)
      })
    }
    tryOnce()
  })
}

async function waitHealth(timeoutMs) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    try { if ((await fetch(`http://127.0.0.1:${config.port}/health`)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('Server javob bermadi')
}

const tailLog = (file, n = 15) => {
  try { return fs.readFileSync(path.join(LOG_DIR, file), 'utf8').trim().split('\n').slice(-n).join('\n') } catch { return '' }
}

// ── MongoDB ────────────────────────────────────────────────────
let mongod = null
async function startMongo() {
  const bin = path.join(MONGO_BIN, 'mongod' + EXE)
  if (!fs.existsSync(bin)) throw new Error(`mongod topilmadi: ${bin}`)
  const out = log('mongod.log')
  mongod = spawn(bin, ['--dbpath', DB_DIR, '--port', String(MONGO_PORT), '--bind_ip', '127.0.0.1', '--quiet'], { windowsHide: true })
  mongod.stdout.pipe(out); mongod.stderr.pipe(out)
  let exited = null
  mongod.once('exit', code => { exited = code; mongod = null })
  await Promise.race([
    waitPort(MONGO_PORT, 60000),
    new Promise((_, rej) => { const t = setInterval(() => { if (exited !== null) { clearInterval(t); rej(new Error(`mongod to'xtadi (kod ${exited})`)) } }, 300) }),
  ])
}

async function stopMongo() {
  if (!mongod) return
  // Toza to'xtatish: shutdown buyrug'i (Windows'da kill — majburiy to'xtatish)
  try {
    const { MongoClient } = require(path.join(SERVER_DIR, 'node_modules', 'mongodb'))
    const c = new MongoClient(`mongodb://127.0.0.1:${MONGO_PORT}`, { serverSelectionTimeoutMS: 3000 })
    await c.connect()
    await c.db('admin').command({ shutdown: 1 }).catch(() => {})
    await c.close().catch(() => {})
  } catch {}
  const p = mongod
  await new Promise(r => { if (!p) return r(); const t = setTimeout(() => { p.kill(); r() }, 15000); p.once('exit', () => { clearTimeout(t); r() }) })
}

// ── RestoPro server ────────────────────────────────────────────
// Har restoran (cloud manzili) — kassada alohida baza. Kassa boshqa restoranga ulansa yangi, toza baza
// ochiladi: avvalgi restoran ma'lumotlari yangisiga sync bo'lib ketmaydi (aralashmaydi), qaytib ulansa
// o'zinikiga qaytadi. Avvalgi yagona baza ("restopro") birinchi marta ishlatilayotgan restoranniki bo'ladi.
const hostOf = u => { try { return new URL(u).host.toLowerCase() } catch { return '' } }
function dbName() {
  const key = config.mode === 'sync' ? hostOf(config.syncUrl) || 'sync' : 'local'
  config.dbs = config.dbs || {}
  if (!config.dbs[key]) {
    const used = new Set(Object.values(config.dbs))
    config.dbs[key] = used.has('restopro') ? 'restopro_' + key.replace(/[^a-z0-9]+/g, '_').slice(0, 40) : 'restopro'
    saveConfig(config)
  }
  return config.dbs[key]
}

let server = null
let quitting = false
async function startServer() {
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',          // Electron'ning o'zi Node sifatida
    NODE_ENV: 'production',
    MONGO_URI: `mongodb://127.0.0.1:${MONGO_PORT}/${dbName()}`,
    JWT_SECRET: config.jwtSecret,
    PORT: String(config.port),
    UPLOAD_DIR,
    SERVE_FRONTEND: WEB_DIR,
    ALLOW_LAN: 'true',
    NODE_ID: config.nodeId,
    APP_VERSION: app.getVersion(),        // sotuvchi panelida kassa versiyasi ko'rinadi
    SYNC_URL: config.mode === 'sync' ? config.syncUrl : '',
    SYNC_KEY: config.mode === 'sync' ? config.syncKey : '',
    ADMIN_PASSWORD: config.mode === 'standalone' ? (config.adminPassword || '') : '',
    // Lokal rejimda litsenziya to'g'ridan-to'g'ri tekshiriladi; cloud rejimida — cloud orqali
    LICENSE_KEY: config.mode === 'standalone' ? (config.licenseKey || '') : '',
  }
  const out = log('server.log')
  server = spawn(process.execPath, [path.join(SERVER_DIR, 'server.js')], { cwd: SERVER_DIR, env, windowsHide: true })
  server.stdout.pipe(out); server.stderr.pipe(out)
  server.once('exit', code => {
    server = null
    if (!quitting) {
      // Kutilmagan to'xtash — 3 soniyadan keyin qayta ishga tushiramiz
      out.write(`\n[kassa] server to'xtadi (kod ${code}), qayta ishga tushirilmoqda...\n`)
      setTimeout(() => startServer().catch(() => {}), 3000)
    }
  })
  await waitHealth(60000)
}
async function stopServer() {
  if (!server) return
  const p = server
  await new Promise(r => { const t = setTimeout(() => { p.kill('SIGKILL'); r() }, 5000); p.once('exit', () => { clearTimeout(t); r() }); p.kill() })
}

// ── Windows Firewall: ofitsantlar telefonlari restoran Wi-Fi orqali kassaga ulanadi ──
// Qoida port bo'yicha (dastur yo'liga bog'liq emas) — yangilanishlardan keyin ham amal qiladi.
const FW_RULE = 'RestoPro Kassa'
const firewallCmds = () => [
  `netsh advfirewall firewall delete rule name="${FW_RULE}" >nul`,
  `netsh advfirewall firewall add rule name="${FW_RULE}" dir=in action=allow protocol=TCP localport=${config.port}`,
]
const FW_ASKED = () => path.join(DATA, 'firewall-asked.txt')
async function ensureFirewall() {
  if (!IS_WIN || !app.isPackaged || !config.mode) return
  const exists = await new Promise(r => execFile('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FW_RULE}`], { windowsHide: true }, err => r(!err)))
  if (exists) return
  try { if (Date.now() - (Number(fs.readFileSync(FW_ASKED(), 'utf8')) || 0) < 24 * 3600 * 1000) return } catch {}
  fs.writeFileSync(FW_ASKED(), String(Date.now()))
  const { response } = await dialog.showMessageBox(mainWin || undefined, {
    type: 'info', buttons: ['Ruxsat berish', 'Keyinroq'], defaultId: 0, cancelId: 1, title: 'RestoPro Kassa',
    message: 'Telefonlar kassaga ulanishi uchun',
    detail: `Ofitsantlar telefonlari va terminallari Wi-Fi orqali kassaga ulanishi uchun Windows Firewall'da ${config.port}-portni ochish kerak. Windows bir marta ruxsat so'raydi.`,
  })
  if (response !== 0) return
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rp-fw-'))
  const cmd = path.join(dir, 'firewall.cmd')
  fs.writeFileSync(cmd, ['@echo off', ...firewallCmds(), ''].join('\r\n'))
  execFile('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command',
    `try { Start-Process -FilePath '${cmd.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden } catch {}`], { windowsHide: true }, () => {})
}

// ── Lokal backup (kuniga bir marta, oxirgi 14 ta) ──────────────
function runBackup() {
  const dump = path.join(MONGO_BIN, 'mongodump' + EXE)
  if (!fs.existsSync(dump)) return
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  const db = dbName()
  const file = path.join(BACKUP_DIR, `restopro-${stamp}${db === 'restopro' ? '' : '-' + db}.archive.gz`)
  execFile(dump, [`--uri=mongodb://127.0.0.1:${MONGO_PORT}/${db}`, `--archive=${file}`, '--gzip', '--quiet'], { windowsHide: true }, err => {
    if (err) { log('backup.log').end(`[${stamp}] xato: ${err.message}\n`); return }
    const all = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('restopro-')).sort()
    for (const f of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) fs.rmSync(path.join(BACKUP_DIR, f), { force: true })
  })
}

// ── Oynalar ────────────────────────────────────────────────────
let mainWin = null, setupWin = null, tray = null

function createMainWindow() {
  if (mainWin) { mainWin.show(); mainWin.focus(); return }
  mainWin = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1000, minHeight: 640, show: false,
    title: 'RestoPro Kassa', autoHideMenuBar: true, backgroundColor: '#0B0B0C',
    icon: appIcon.current(),
    webPreferences: { preload: path.join(__dirname, 'preload-app.js'), contextIsolation: true, nodeIntegration: false },
  })
  mainWin.loadURL(`http://127.0.0.1:${config.port}/`)
  mainWin.once('ready-to-show', () => mainWin.show())
  // Tashqi havolalar brauzerda ochilsin
  // about:blank va boshqa protokollar rad etiladi (Windows "Get an app to open 'about' link" chiqarmasin)
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(`http://127.0.0.1:${config.port}`)) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWin.on('close', e => {
    if (quitting) return
    e.preventDefault()
    mainWin.hide()
    if (!config.trayHintShown && Notification.isSupported()) {
      new Notification({ title: 'RestoPro Kassa ishlashda davom etyapti', body: 'Ofitsantlar ulanishi uchun dastur trayda qoldi. To\'liq chiqish: tray → Chiqish.' }).show()
      config.trayHintShown = true; saveConfig(config)
    }
  })
  mainWin.on('closed', () => { mainWin = null })
}

function createSetupWindow() {
  if (setupWin) { setupWin.focus(); return }
  setupWin = new BrowserWindow({
    width: 560, height: 680, resizable: false, title: 'RestoPro Kassa — sozlash',
    autoHideMenuBar: true, backgroundColor: '#0B0B0C',
    icon: appIcon.current(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  })
  setupWin.loadFile(path.join(__dirname, 'setup.html'))
  setupWin.on('closed', () => { setupWin = null; if (!config.mode && !quitting) app.quit() })
}

function createTray() {
  tray = new Tray(appIcon.current().resize({ width: 16, height: 16 }))
  tray.setToolTip('RestoPro Kassa')
  tray.on('double-click', createMainWindow)
  refreshTrayMenu()
}
function refreshTrayMenu() {
  if (!tray) return
  const urls = waiterUrls()
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ochish', click: createMainWindow },
    { type: 'separator' },
    { label: 'Ofitsantlar uchun manzil:', enabled: false },
    ...(urls.length ? urls.map(u => ({ label: `   ${u}  (nusxa olish)`, click: () => clipboard.writeText(u) })) : [{ label: '   Tarmoq topilmadi', enabled: false }]),
    { type: 'separator' },
    { label: 'Sozlamalar', click: createSetupWindow },
    { label: 'Loglar papkasi', click: () => shell.openPath(LOG_DIR) },
    { label: 'Backup papkasi', click: () => shell.openPath(BACKUP_DIR) },
    { type: 'separator' },
    ...updateMenu(),
    { type: 'separator' },
    { label: 'Chiqish', click: () => app.quit() },
  ]))
}

// Tray: versiya va yangilanish
function updateMenu() {
  const u = updater.state
  if (u.status === 'ready') return [{ label: `Yangilash: ${u.version} (qayta ishga tushadi)`, click: () => updater.install() }]
  return [
    { label: `Versiya ${app.getVersion()}${u.status === 'downloading' ? ` — yangilanish yuklanmoqda ${u.progress}%` : ''}`, enabled: false },
    { label: 'Yangilanishni tekshirish', enabled: u.status !== 'disabled', click: () => updater.check() },
  ]
}

// ── Chek chop etish (oynasiz, standart printerga) ──────────────
ipcMain.handle('rp:print', (_e, html, opts) => require('./print').printHtml(html, { ...opts, deviceName: config.printer }))

// ── Setup oynasi bilan aloqa ───────────────────────────────────
ipcMain.handle('kassa:get', () => ({
  mode: config.mode || null,
  syncUrl: config.syncUrl || '',
  knownHosts: Object.keys(config.dbs || {}),   // shu kassada bazasi bor restoranlar (boshqasiga o'tishda ogohlantirish)
  hasKey: !!config.syncKey,
  hasLicense: !!config.licenseKey,
  licenseRequired: licenseRequired(),
  port: config.port,
  waiterUrls: waiterUrls(),
  adminPassword: config.mode === 'standalone' && !config.adminPasswordSeen ? config.adminPassword : null,
}))

ipcMain.handle('kassa:test', async (_e, { syncUrl, syncKey }) => {
  try {
    const url = normalizeUrl(syncUrl)
    const r = await fetch(`${url}/api/sync/ping`, { headers: { 'x-sync-key': syncKey || config.syncKey || '' }, signal: AbortSignal.timeout(10000) })
    if (r.status === 401) return { ok: false, message: 'Sync kaliti noto\'g\'ri' }
    if (r.status === 404) return { ok: false, message: 'Bu manzilda RestoPro sync yoqilmagan (serverda SYNC_KEY yo\'q?)' }
    if (!r.ok) return { ok: false, message: `Server xatosi: ${r.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: 'Serverga ulanib bo\'lmadi: ' + (err.cause?.code || err.message) }
  }
})

// vendor.json da ochiq kalit bo'lsa — lokal rejimda litsenziya kaliti majburiy
function licenseRequired() {
  try { return !!JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'license', 'vendor.json'), 'utf8')).publicKey } catch { return false }
}

ipcMain.handle('kassa:save', async (_e, { mode, syncUrl, syncKey, licenseKey }) => {
  if (licenseKey) config.licenseKey = String(licenseKey).trim().toUpperCase().slice(0, 40)
  if (mode === 'sync') {
    config.mode = 'sync'
    config.syncUrl = normalizeUrl(syncUrl)
    if (syncKey) config.syncKey = syncKey
  } else {
    config.mode = 'standalone'
    if (!config.adminPassword) config.adminPassword = crypto.randomBytes(6).toString('base64url')
  }
  saveConfig(config)
  await restartBackend()
  return { ok: true, adminPassword: config.mode === 'standalone' ? config.adminPassword : null }
})

ipcMain.handle('kassa:open', () => {
  if (config.mode === 'standalone') { config.adminPasswordSeen = true; saveConfig(config) }
  createMainWindow()
  setupWin?.close()
})

function normalizeUrl(u) {
  u = String(u || '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  return u
}

async function restartBackend() {
  quitting = true; await stopServer(); quitting = false
  await startServer()
  mainWin?.reload()
}

// ── Hayot sikli ────────────────────────────────────────────────
app.on('second-instance', () => (config.mode ? createMainWindow() : createSetupWindow()))
app.on('window-all-closed', e => e.preventDefault?.())   // trayda qolamiz

app.whenReady().then(async () => {
  appIcon.setup({ icon: path.join(__dirname, 'assets', 'icon.png'), onImage: img => tray?.setImage(img.resize({ width: 16, height: 16 })) })
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true })   // Windows bilan birga ishga tushsin
  createTray()
  try {
    await startMongo()
    if (config.mode) await startServer()
  } catch (err) {
    dialog.showErrorBox('RestoPro Kassa ishga tushmadi',
      `${err.message}\n\n--- mongod.log ---\n${tailLog('mongod.log')}\n\n--- server.log ---\n${tailLog('server.log')}\n\nLoglar: ${LOG_DIR}`)
    quitting = true; app.quit(); return
  }
  if (config.mode) createMainWindow(); else createSetupWindow()
  // Avtomatik yangilanish: o'rnatishdan oldin server va MongoDB toza to'xtatiladi
  const feed = async () => (await fetch(`http://127.0.0.1:${config.port}/api/license/update-token`, { signal: AbortSignal.timeout(10000) })).json()
  const shutdown = async () => { quitting = true; await stopServer(); await stopMongo(); cleanedUp = true }
  updater.setup({ feed, onBeforeInstall: shutdown, onChange: () => refreshTrayMenu() })
  // Bir martalik: Program Files'dan foydalanuvchi papkasiga ko'chish (yangilanishlar ruxsatsiz bo'lishi uchun)
  // va Firewall'da port (telefonlar kassaga ulanishi uchun) — foydalanuvchi papkasiga o'rnatuvchi buni qila olmaydi
  setTimeout(async () => {
    await migrate.offerMigration({ parent: mainWin || undefined, feed, channel: 'latest', extra: firewallCmds(), beforeQuit: shutdown })
    await ensureFirewall()
  }, 15000)
  setTimeout(runBackup, 60 * 1000)
  setInterval(runBackup, 24 * 3600 * 1000)
  setInterval(refreshTrayMenu, 60 * 1000)   // IP o'zgarsa
})

let cleanedUp = false
app.on('before-quit', async e => {
  quitting = true
  if (cleanedUp) return
  e.preventDefault()
  await stopServer()
  await stopMongo()
  cleanedUp = true
  app.quit()
})

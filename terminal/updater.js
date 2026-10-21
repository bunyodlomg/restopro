// ── Avtomatik yangilanish (sotuvchining litsenziya serveri orqali) ──
// Ilova o'zi yangi versiyani tekshiradi, fonda yuklab oladi va tayyor
// bo'lgach foydalanuvchiga "Yangilash" taklif qiladi. Ilova yopilganda ham
// avtomatik o'rnatiladi. Qayta .exe yuklab o'rnatish shart emas.
const { app, ipcMain, Notification, BrowserWindow } = require('electron')
const path = require('path')
const fs   = require('fs')
const migrate = require('./migrate')

let autoUpdater = null
try { ({ autoUpdater } = require('electron-updater')) } catch { /* ishlab chiqishda o'rnatilmagan bo'lishi mumkin */ }

const CHECK_EVERY = 30 * 60 * 1000     // 30 daqiqada bir
const RETRY_AFTER = 5 * 60 * 1000      // xato bo'lsa (internet / server) — 5 daqiqadan keyin qayta
const state = { status: 'idle', current: app.getVersion(), version: null, progress: 0, error: null }
let listeners = []
let beforeInstall = async () => {}
let getFeed = async () => null      // { url, token } — restoran serveridan olinadi
let feedChannel = 'latest'

// Yangilanish logi: %APPDATA%/<ilova>/update.log (muammo bo'lsa shu faylni ko'ring)
const LOG = () => path.join(app.getPath('userData'), 'update.log')
function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.map(x => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`
  try { if (fs.statSync(LOG()).size > 512 * 1024) fs.renameSync(LOG(), LOG() + '.old') } catch {}
  try { fs.appendFileSync(LOG(), line) } catch {}
}
const logger = { info: m => log(m), warn: m => log('WARN', m), error: m => log('ERROR', m), debug: () => {} }

// O'rnatish urinishi: ilova qayta ochilganda versiya o'zgarmagan bo'lsa — o'rnatish o'tmagan.
// Keyingi safar to'liq qayta o'rnatish (migrate.reinstall) ishlatiladi.
const ATTEMPT = () => path.join(app.getPath('userData'), 'update-attempt.json')
let lastFailed = null
function readAttempt() {
  try {
    const a = JSON.parse(fs.readFileSync(ATTEMPT(), 'utf8'))
    fs.rmSync(ATTEMPT(), { force: true })
    if (a.version && a.version !== app.getVersion()) {
      lastFailed = a.version
      log(`O'RNATILMADI: ${a.version} (hozir ${app.getVersion()}) — keyingi safar to'liq qayta o'rnatiladi`)
    } else log(`o'rnatildi: ${app.getVersion()}`)
  } catch {}
}

function emit(patch) {
  Object.assign(state, patch)
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('rp:update', state)
  listeners.forEach(fn => { try { fn(state) } catch {} })
}

let retryTimer = null
function retryLater() {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(check, RETRY_AFTER)
}

async function check() {
  if (!autoUpdater || !app.isPackaged) return state
  // Yuklanayotgan / tayyor bo'lsa qayta boshlamaymiz
  if (state.status === 'downloading' || state.status === 'ready' || state.status === 'installing') return state
  // Har tekshiruvdan oldin manzil va ruxsatnoma yangilanadi (litsenziya serveri imzolagan)
  let feed = null
  try { feed = await getFeed() } catch {}
  if (!feed?.url || !feed?.token) { emit({ status: 'error', error: feed?.message || 'Yangilanish serveri hali sozlanmagan yoki litsenziya olinmagan' }); retryLater(); return state }
  autoUpdater.setFeedURL({ provider: 'generic', url: feed.url, channel: feedChannel })
  autoUpdater.requestHeaders = { 'x-restopro-update': feed.token }
  try { await autoUpdater.checkForUpdates() } catch (err) { emit({ status: 'error', error: err.message }); retryLater() }
  return state
}

async function install() {
  if (lastFailed) return reinstall()        // oldingi oddiy o'rnatish o'tmagan — ishonchli yo'l
  if (state.status !== 'ready') return false
  emit({ status: 'installing' })
  log(`o'rnatish: ${state.current} → ${state.version}`)
  try { fs.writeFileSync(ATTEMPT(), JSON.stringify({ version: state.version, at: new Date().toISOString() })) } catch {}
  await beforeInstall()                     // masalan: server va MongoDB'ni toza to'xtatish
  setImmediate(() => autoUpdater.quitAndInstall(true, true))   // jim o'rnatish va qayta ochish
  return true
}

// To'liq qayta o'rnatish: oxirgi versiya o'rnatuvchisi yuklanadi va ilova yopilgach jim o'rnatiladi.
// Oddiy yangilanish o'tmasa yoki ilova ichidan «Qayta o'rnatish» bosilsa.
async function reinstall() {
  if (!app.isPackaged || process.platform !== 'win32') return false
  if (state.status === 'installing') return true
  const prev = state.status
  emit({ status: 'installing', error: null })
  log("to'liq qayta o'rnatish boshlandi")
  try {
    if (!(await migrate.reinstall({ feed: getFeed, channel: feedChannel }))) throw new Error('Yordamchi jarayon ishga tushmadi')
  } catch (err) {
    log("qayta o'rnatish xatosi:", err)
    emit({ status: prev === 'installing' ? 'error' : prev, error: `Qayta o'rnatib bo'lmadi: ${err.message}` })
    return false
  }
  try { fs.writeFileSync(ATTEMPT(), JSON.stringify({ version: state.version || 'reinstall', at: new Date().toISOString() })) } catch {}
  await beforeInstall()
  app.exit(0)
  return true
}

// channel: kassa — 'latest' (latest.yml), ofitsant terminali — 'terminal' (terminal.yml)
function setup({ channel = 'latest', feed, onBeforeInstall, onChange } = {}) {
  if (onBeforeInstall) beforeInstall = onBeforeInstall
  if (feed) getFeed = feed
  feedChannel = channel
  if (onChange) listeners.push(onChange)

  ipcMain.handle('rp:update:get', () => state)
  ipcMain.handle('rp:update:check', () => check())
  ipcMain.handle('rp:update:install', () => install())
  ipcMain.handle('rp:update:reinstall', () => reinstall())

  if (!autoUpdater || !app.isPackaged) { emit({ status: 'disabled' }); return }

  readAttempt()
  if (lastFailed) emit({ lastFailed })
  autoUpdater.logger = logger
  autoUpdater.allowDowngrade = false
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ status: state.status === 'ready' ? 'ready' : 'checking', error: null }))
  autoUpdater.on('update-not-available', () => emit({ status: 'latest' }))
  autoUpdater.on('update-available', info => emit({ status: 'downloading', version: info.version, progress: 0 }))
  autoUpdater.on('download-progress', p => emit({ status: 'downloading', progress: Math.round(p.percent || 0) }))
  autoUpdater.on('update-downloaded', info => {
    emit({ status: 'ready', version: info.version, progress: 100 })
    try { new Notification({ title: 'RestoPro yangilanishi tayyor', body: `Versiya ${info.version}. Dastur yopilganda o'rnatiladi yoki hozir yangilang.` }).show() } catch {}
  })
  autoUpdater.on('error', err => {
    emit({ status: state.status === 'ready' ? 'ready' : 'error', error: String(err?.message || err).slice(0, 300) })
    if (state.status !== 'ready') retryLater()   // masalan yuklash o'rtada uzildi
  })

  setTimeout(check, 20000)
  setInterval(check, CHECK_EVERY).unref?.()
}

module.exports = { setup, check, install, reinstall, state }

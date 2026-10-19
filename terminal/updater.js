// ── Avtomatik yangilanish (GitHub Releases) ──────────────────
// Ilova o'zi yangi versiyani tekshiradi, fonda yuklab oladi va tayyor
// bo'lgach foydalanuvchiga "Yangilash" taklif qiladi. Ilova yopilganda ham
// avtomatik o'rnatiladi. Qayta .exe yuklab o'rnatish shart emas.
const { app, ipcMain, Notification, BrowserWindow } = require('electron')

let autoUpdater = null
try { ({ autoUpdater } = require('electron-updater')) } catch { /* ishlab chiqishda o'rnatilmagan bo'lishi mumkin */ }

const CHECK_EVERY = 3 * 3600 * 1000   // 3 soatda bir
const state = { status: 'idle', current: app.getVersion(), version: null, progress: 0, error: null }
let listeners = []
let beforeInstall = async () => {}

function emit(patch) {
  Object.assign(state, patch)
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('rp:update', state)
  listeners.forEach(fn => { try { fn(state) } catch {} })
}

async function check() {
  if (!autoUpdater || !app.isPackaged) return state
  try { await autoUpdater.checkForUpdates() } catch (err) { emit({ status: 'error', error: err.message }) }
  return state
}

async function install() {
  if (state.status !== 'ready') return false
  emit({ status: 'installing' })
  await beforeInstall()                     // masalan: server va MongoDB'ni toza to'xtatish
  setImmediate(() => autoUpdater.quitAndInstall(true, true))   // jim o'rnatish va qayta ochish
  return true
}

// channel: kassa — 'latest', ofitsant terminali — 'terminal' (bitta release'da ikkala ilova)
function setup({ channel = 'latest', onBeforeInstall, onChange } = {}) {
  if (onBeforeInstall) beforeInstall = onBeforeInstall
  if (onChange) listeners.push(onChange)

  ipcMain.handle('rp:update:get', () => state)
  ipcMain.handle('rp:update:check', () => check())
  ipcMain.handle('rp:update:install', () => install())

  if (!autoUpdater || !app.isPackaged) { emit({ status: 'disabled' }); return }

  if (channel !== 'latest') autoUpdater.channel = channel
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
  autoUpdater.on('error', err => emit({ status: state.status === 'ready' ? 'ready' : 'error', error: String(err?.message || err).slice(0, 300) }))

  setTimeout(check, 20000)
  setInterval(check, CHECK_EVERY).unref?.()
}

module.exports = { setup, check, install, state }

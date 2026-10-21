// ── Bir martalik ko'chish: "Program Files" → foydalanuvchi papkasi ───────
// Eski o'rnatuvchilar ilovani Program Files'ga (barcha foydalanuvchilar uchun) qo'yardi — har
// yangilanishda Windows administrator ruxsatini so'rardi, rad etilsa ilova ochilmay qolardi.
// Yangi o'rnatuvchi %LOCALAPPDATA%\Programs ga o'rnatadi (build/installer.nsh) — u yerda
// yangilanishlar ruxsatsiz. Lekin mavjud Program Files o'rnatishi yangilanganda o'z joyida qoladi,
// shuning uchun ko'chirishni ilovaning o'zi qiladi (sinalgan: GitHub Actions, Windows):
//   1. Program Files'dagi nusxa: oxirgi o'rnatuvchini litsenziya serveridan yuklaydi (sha512 tekshiriladi)
//      va "/S /currentuser" bilan foydalanuvchi papkasiga o'rnatadi — ruxsat so'ramaydi;
//   2. eski nusxani o'chirish uchun bir marta ruxsat so'raydi (rad etilsa ham zarari yo'q — eski nusxa
//      faqat yangisini ochib beradi: redirectToNew). Eski uninstaller ochiq ilovani ham yopadi,
//      shuning uchun yangi nusxa oxirida qayta ochiladi;
//   3. ma'lumotlar %APPDATA% da — o'chmaydi.
const { app, dialog } = require('electron')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const crypto = require('crypto')
const { spawn } = require('child_process')

const NAME    = app.getName()
const EXE     = `${NAME}.exe`
const OLD_DIR = path.join(process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files', NAME)
const NEW_DIR = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', NAME)
const NEW_EXE = path.join(NEW_DIR, EXE)
const OLD_UNINSTALLER = path.join(OLD_DIR, `Uninstall ${NAME}.exe`)
const ASKED_FILE = () => path.join(app.getPath('userData'), 'migrate-asked.txt')
// Faqat avtomatik sinov uchun (GitHub Actions, Windows): dialogsiz, berilgan yangilanish manzilidan
const TEST = process.env.RP_MIGRATE_TEST_FEED || ''
// Ko'chish jarayoni logi (muammo bo'lsa: %APPDATA%/<ilova>/migrate.log)
const LOG = () => path.join(app.getPath('userData'), 'migrate.log')
const log = msg => { try { fs.appendFileSync(LOG(), `[${new Date().toISOString()}] ${msg}\n`) } catch {} }

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
const runningFromOld = () => same(path.dirname(process.execPath), OLD_DIR)
const active = () => process.platform === 'win32' && app.isPackaged

// Eski nusxadan ochildi (eski yorliq / autostart), yangi nusxa bor — yangisini ochamiz.
// true — bu jarayon darhol yopilishi kerak.
function redirectToNew() {
  if (!active() || !runningFromOld() || !fs.existsSync(NEW_EXE)) return false
  app.releaseSingleInstanceLock()
  spawn(NEW_EXE, process.argv.slice(1), { detached: true, stdio: 'ignore' }).unref()
  return true
}

// Oxirgi o'rnatuvchini litsenziya serveridan yuklash (yml dagi sha512 bilan tekshiriladi)
async function downloadInstaller(feed, channel) {
  const { url, token } = (await feed()) || {}
  if (!url || !token) throw new Error('Yangilanish serveri sozlanmagan')
  const headers = { 'x-restopro-update': token }
  const yml = await (await fetch(`${url}/${channel}.yml`, { headers, signal: AbortSignal.timeout(20000) })).text()
  const file = yml.match(/^path:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  const sha512 = yml.match(/^sha512:\s*(.+)$/m)?.[1]?.trim()
  if (!file || !sha512) throw new Error('Yangilanish ma\'lumoti noto\'g\'ri')
  const res = await fetch(`${url}/${encodeURIComponent(file)}`, { headers, signal: AbortSignal.timeout(15 * 60000) })
  if (!res.ok) throw new Error(`O'rnatuvchini yuklab bo'lmadi (${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (crypto.createHash('sha512').update(buf).digest('base64') !== sha512) throw new Error('O\'rnatuvchi buzilgan (sha512)')
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rp-migrate-')), file)
  fs.writeFileSync(dest, buf)
  return dest
}

// feed — updater bilan bir xil ({ url, token }), channel — 'latest' (kassa) / 'terminal'
// extra — eski nusxa o'chirilgach administrator sifatida bajariladigan buyruqlar (kassa: Firewall qoidasi)
async function offerMigration({ parent, feed, channel, extra = [], beforeQuit = async () => {} } = {}) {
  if (!active()) return
  const fromOld = runningFromOld()
  log(`tekshiruv: exe=${process.execPath} eski=${fromOld} yangi bor=${fs.existsSync(NEW_EXE)} eski uninstaller=${fs.existsSync(OLD_UNINSTALLER)}`)
  if (fromOld ? fs.existsSync(NEW_EXE) : !fs.existsSync(OLD_UNINSTALLER)) return
  // Ko'chirish — kuniga bir marta so'raladi; faqat eski nusxani tozalash (ixtiyoriy) — haftasiga
  const every = (fromOld ? 1 : 7) * 24 * 3600 * 1000
  if (TEST) feed = async () => ({ url: TEST, token: 'test' })
  else try { if (Date.now() - (Number(fs.readFileSync(ASKED_FILE(), 'utf8')) || 0) < every) return } catch {}
  fs.writeFileSync(ASKED_FILE(), String(Date.now()))

  const { response } = TEST ? { response: 0 } : await dialog.showMessageBox(parent, {
    type: 'info', buttons: ['Hozir', 'Keyinroq'], defaultId: 0, cancelId: 1, title: NAME,
    message: fromOld ? 'Yangilanishlarni ruxsatsiz qilish' : 'Eski nusxani o\'chirish',
    detail: (fromOld
      ? `${NAME} yangi papkaga ko'chiriladi — shundan keyin yangilanishlar Windows ruxsatini so'ramaydi va o'zi o'rnatiladi. Eski nusxani o'chirish uchun Windows bir marta ruxsat so'raydi (rad etsangiz ham ishlayveradi).`
      : `Kompyuterda ${NAME}ning eski nusxasi qolgan. Uni o'chirish uchun Windows bir marta ruxsat so'raydi.`)
      + '\n\nDastur bir necha soniya yopilib, qayta ochiladi. Ma\'lumotlar o\'chmaydi.',
  })
  if (response !== 0) return

  let installer = null
  if (fromOld) {
    try { installer = await downloadInstaller(feed, channel); log(`yuklandi: ${installer}`) } catch (err) {
      log(`yuklab bo'lmadi: ${err.message}`)
      dialog.showMessageBox(parent, { type: 'warning', title: NAME, message: 'Ko\'chirib bo\'lmadi', detail: `${err.message}\n\nErtaga yana urinib ko'riladi.` })
      return
    }
  }

  // Oddiy foydalanuvchi sifatida: yangi nusxani o'rnatish → (ruxsat bilan) eskisini o'chirish → yangisini ochish
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-migrate-'))
  const cmd = path.join(dir, 'cleanup.cmd')
  fs.writeFileSync(cmd, ['@echo off', `"${OLD_UNINSTALLER}" /S /allusers`, 'timeout /t 3 /nobreak >nul', ...extra, ''].join('\r\n'))
  const q = s => `'${String(s).replace(/'/g, "''")}'`
  const ps = path.join(dir, 'migrate.ps1')
  fs.writeFileSync(ps, [
    `Start-Transcript -Path ${q(LOG() + '.ps.txt')} -Append | Out-Null`,
    // Ilova (kassada server va MongoDB ham) to'liq yopilishini kutamiz
    `Wait-Process -Id ${process.pid} -Timeout 90 -ErrorAction SilentlyContinue`,
    installer ? `Start-Process -FilePath ${q(installer)} -ArgumentList '/S','/currentuser' -Wait` : '',
    `try { Start-Process -FilePath ${q(cmd)} -Verb RunAs -Wait -WindowStyle Hidden } catch {}`,
    `if (Test-Path ${q(NEW_EXE)}) { Start-Process -FilePath ${q(NEW_EXE)} } else { Start-Process -FilePath ${q(process.execPath)} }`,
  ].join('\r\n'))
  log(`ko'chish boshlandi: ${ps}`)
  // Ilova ochgan jarayonlar ilova yopilganda Windows tomonidan birga yopiladi (sinovda aniqlangan),
  // shuning uchun skriptni WMI orqali ishga tushiramiz — u ilovaga bog'liq bo'lmaydi.
  // Yordamchi qisqa jarayon tugaguncha kutamiz; boshlanmasa ilova ishlashda davom etadi.
  const pwsh = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const line = `"${pwsh}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ps}"`
  const launcher = `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${q(line)} }; ` +
                   `if ($r.ReturnValue -ne 0) { exit 1 }; Write-Output $r.ProcessId`
  const started = await new Promise(resolve => {
    let out = ''
    const child = spawn(pwsh, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', launcher], { windowsHide: true })
    child.stdout.on('data', d => { out += d })
    child.once('error', err => { log(`powershell ishga tushmadi: ${err.message}`); resolve(false) })
    child.once('exit', code => { log(`ko'chish skripti: kod=${code} pid=${out.trim()}`); resolve(code === 0) })
  })
  if (!started) return
  await beforeQuit()
  app.exit(0)
}

module.exports = { redirectToNew, offerMigration, runningFromOld }

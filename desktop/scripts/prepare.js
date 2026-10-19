// ============================================================
//  Electron paketi uchun resurslarni tayyorlash → desktop/resources/
//    server/   — backend + production node_modules
//    web/      — frontend build
//    mongodb/  — mongod + mongodump (maqsad platforma uchun)
//
//  node scripts/prepare.js --platform win32            (MongoDB yuklab olinadi)
//  node scripts/prepare.js --platform linux --mongo-dir /path/to/bin   (mavjud binarlar)
//
//  MongoDB versiyalarini o'zgartirish: MONGO_VERSION, MONGO_TOOLS_VERSION
// ============================================================
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const { execSync } = require('child_process')

const args = process.argv.slice(2)
const arg  = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def }
const PLATFORM   = arg('--platform', process.platform)
const MONGO_DIR  = arg('--mongo-dir', '')
const MONGO_VER  = process.env.MONGO_VERSION       || '8.0.4'
const TOOLS_VER  = process.env.MONGO_TOOLS_VERSION || '100.10.0'

const ROOT = path.resolve(__dirname, '..', '..')
const OUT  = path.resolve(__dirname, '..', 'resources')
const EXE  = PLATFORM === 'win32' ? '.exe' : ''
const run  = (cmd, cwd) => { console.log(`  $ ${cmd}`); execSync(cmd, { cwd, stdio: 'inherit', shell: true }) }

function copyDir(src, dst, skip = []) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(e.name)) continue
    const s = path.join(src, e.name), d = path.join(dst, e.name)
    e.isDirectory() ? copyDir(s, d, []) : fs.copyFileSync(s, d)
  }
}

async function download(url, dest) {
  console.log(`  ↓ ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

async function prepareMongo() {
  const dst = path.join(OUT, 'mongodb')
  fs.mkdirSync(dst, { recursive: true })
  const need = ['mongod' + EXE, 'mongodump' + EXE]

  if (MONGO_DIR) {
    for (const b of need) fs.copyFileSync(path.join(MONGO_DIR, b), path.join(dst, b))
    return
  }
  if (PLATFORM !== 'win32') throw new Error('Linux/mac uchun --mongo-dir bering (mongod va mongodump bor papka)')

  const extract = require('extract-zip')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restopro-mongo-'))
  const zips = [
    `https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-${MONGO_VER}.zip`,
    `https://fastdl.mongodb.org/tools/db/mongodb-database-tools-windows-x86_64-${TOOLS_VER}.zip`,
  ]
  for (const url of zips) {
    const zip = path.join(tmp, path.basename(url))
    await download(url, zip)
    await extract(zip, { dir: tmp })
  }
  // Arxiv ichidan kerakli exe'larni topib ko'chirish
  const find = (dir, name) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { const r = find(p, name); if (r) return r }
      else if (e.name.toLowerCase() === name) return p
    }
  }
  for (const b of need) {
    const src = find(tmp, b)
    if (!src) throw new Error(`${b} arxivda topilmadi`)
    fs.copyFileSync(src, path.join(dst, b))
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

;(async () => {
  console.log(`▶ Platforma: ${PLATFORM}`)
  fs.rmSync(OUT, { recursive: true, force: true })

  console.log('▶ Frontend build')
  run('npm ci --no-audit --no-fund', path.join(ROOT, 'frontend'))
  run('npm run build', path.join(ROOT, 'frontend'))
  copyDir(path.join(ROOT, 'frontend', 'dist'), path.join(OUT, 'web'))

  console.log('▶ Server')
  copyDir(path.join(ROOT, 'server'), path.join(OUT, 'server'), ['node_modules', 'uploads', '.env'])
  run('npm ci --omit=dev --no-audit --no-fund', path.join(OUT, 'server'))

  console.log('▶ MongoDB')
  await prepareMongo()

  console.log(`✅ Tayyor: ${OUT}`)
})().catch(err => { console.error('❌', err.message); process.exit(1) })

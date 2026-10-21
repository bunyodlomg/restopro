// Litsenziya testi: litsenziya serveri + cloud + kassa (haqiqiy server.js, lokal MongoDB kerak).
//   npm run test:license
// Biriktirish, yumshoq blok, faollashtirish, cloud o'chganda kassaning zaxira yo'li, serverni ajratish.
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert')

const ROOT = path.resolve(__dirname, '../../..')
const LIC = 7191, CLOUD = 5291, KASSA = 5292
const ADMIN = 'test-admin-password'
const SYNC_KEY = 's'.repeat(40)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-lic-'))
const procs = {}
const wait = ms => new Promise(r => setTimeout(r, ms))

function run(name, script, env) {
  const p = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  p.log = ''
  p.stdout.on('data', d => { p.log += d })
  p.stderr.on('data', d => { p.log += d })
  procs[name] = p
  return p
}
const serverEnv = (role, port) => ({
  NODE_ENV: 'test', PORT: String(port), JWT_SECRET: 'j'.repeat(40),
  MONGO_URI: `mongodb://127.0.0.1:27017/rp_lictest_${role}`,
  LICENSE_URL: `http://127.0.0.1:${LIC}`, LICENSE_INTERVAL: '30',
  UPLOAD_DIR: path.join(dataDir, 'up-' + role),
  ...(role === 'cloud'
    ? { SYNC_KEY, NODE_ID: 'cloud', PUBLIC_URL: `http://127.0.0.1:${CLOUD}` }
    : { SYNC_URL: `http://127.0.0.1:${CLOUD}`, SYNC_KEY, NODE_ID: 'kassa1' }),
})

const admin = async (method, url, body) => {
  const r = await fetch(`http://127.0.0.1:${LIC}/admin/api${url}`, {
    method, body: body && JSON.stringify(body),
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('admin:' + ADMIN).toString('base64') },
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`${url}: ${j.message}`)
  return j
}
const lic = async port => (await fetch(`http://127.0.0.1:${port}/api/license/status`)).json()
const refresh = async port => (await fetch(`http://127.0.0.1:${port}/api/license/refresh`, { method: 'POST' })).json()
// Shart bajarilguncha kutish (darhol bildirish long-poll orqali keladi — bir necha soniya)
async function until(fn, what, ms = 15000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last } catch (e) { last = e.message }
    await wait(300)
  }
  throw new Error(`${what} — kutilmadi (oxirgi: ${JSON.stringify(last)})`)
}

let failed = 0
async function test(name, fn) {
  try { await fn(); console.log('  ✅', name) } catch (e) { failed++; console.log('  ❌', name, '\n     ', e.message) }
}

;(async () => {
  // Toza bazalar
  const mongoose = require('mongoose')
  for (const r of ['cloud', 'kassa']) {
    const c = await mongoose.createConnection(`mongodb://127.0.0.1:27017/rp_lictest_${r}`).asPromise()
    await c.dropDatabase(); await c.close()
  }

  run('lic', path.join(ROOT, 'license-server/server.js'), { PORT: String(LIC), DATA_DIR: dataDir, ADMIN_PASSWORD: ADMIN, OFFLINE_DAYS: '3' })
  const { publicKey } = await until(async () => (await fetch(`http://127.0.0.1:${LIC}/api/v1/pubkey`)).json(), 'litsenziya serveri')

  run('cloud', path.join(ROOT, 'server/server.js'), { ...serverEnv('cloud', CLOUD), LICENSE_PUBKEY: publicKey })
  let customer
  await test('yangi server "ulanmagan"da ko\'rinadi, biriktirilgach ochiladi', async () => {
    const [p] = await until(async () => { const l = await admin('GET', '/pending'); return l.length && l }, 'pending')
    assert.strictEqual(p.role, 'cloud')
    customer = await admin('POST', '/customers', { name: 'Test osh markazi', monthly: 100, trialDays: 5, instance: p.instance })
    await until(async () => (await lic(CLOUD)).state === 'active', 'cloud active')
  })

  run('kassa', path.join(ROOT, 'server/server.js'), { ...serverEnv('kassa', KASSA), LICENSE_PUBKEY: publicKey })
  await test('kassa litsenziyani cloud orqali oladi', async () => {
    await until(async () => (await lic(KASSA)).state === 'active', 'kassa active')
  })

  await test('yumshoq to\'xtatish: yangi buyurtma 402, o\'qish va yopish ochiq', async () => {
    await admin('POST', `/customers/${customer.id}/suspend`, { mode: 'soft', reason: 'test' })
    for (const port of [CLOUD, KASSA]) {
      const s = await until(async () => { const s = await lic(port); return s.state === 'suspended' && s }, `suspended ${port}`)
      assert.strictEqual(s.blocked, false); assert.strictEqual(s.readonly, true)
      const post = await fetch(`http://127.0.0.1:${port}/api/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      assert.strictEqual(post.status, 402); assert.strictEqual((await post.json()).code, 'LICENSE_READONLY')
      const get = await fetch(`http://127.0.0.1:${port}/api/orders`)
      assert.strictEqual(get.status, 401, 'GET litsenziyadan o\'tishi kerak (auth 401 beradi)')
      const close = await fetch(`http://127.0.0.1:${port}/api/orders/abc/close`, { method: 'PUT' })
      assert.strictEqual(close.status, 401, 'yopish litsenziyadan o\'tishi kerak')
    }
  })

  await test('to\'liq to\'xtatish: hammasi 402', async () => {
    await admin('POST', `/customers/${customer.id}/activate`)
    await until(async () => (await lic(KASSA)).state === 'active', 'active')
    await admin('POST', `/customers/${customer.id}/suspend`, { mode: 'hard' })
    for (const port of [CLOUD, KASSA]) {
      await until(async () => (await lic(port)).blocked === true, `blocked ${port}`)
      assert.strictEqual((await fetch(`http://127.0.0.1:${port}/api/orders`)).status, 402)
    }
  })

  await test('faollashtirish: ikkalasi darhol ochiladi', async () => {
    await admin('POST', `/customers/${customer.id}/activate`)
    for (const port of [CLOUD, KASSA]) await until(async () => (await lic(port)).state === 'active', `active ${port}`)
  })

  await test('sotuvchi xabari kassaga yetadi; kassa sog\'ligi panelda ko\'rinadi', async () => {
    await admin('POST', `/customers/${customer.id}/message`, { text: 'Ertaga yangilanish', level: 'warn' })
    await until(async () => (await lic(KASSA)).message?.text === 'Ertaga yangilanish', 'xabar')
    // Kassa holati cloud orqali keladi: har o'zgarishda (bump) cloud va kassa qayta tekshiradi
    const node = await until(async () => {
      await admin('POST', `/customers/${customer.id}/message`, { text: 'Ertaga yangilanish', level: 'warn' })
      await wait(1500)
      const c = (await admin('GET', '/customers')).find(x => x.id === customer.id)
      return c.stats?.nodes?.find(n => n.id === 'kassa1' && n.health)
    }, 'kassa sog\'ligi', 30000)
    assert.strictEqual(node.health.license, 'active')
    assert.strictEqual(node.health.online, true)
  })

  await test('masofaviy buyruq: kassa qayta sinxronlanadi', async () => {
    await admin('POST', `/customers/${customer.id}/command`, { type: 'resync', node: 'kassa1' })
    await until(async () => procs.kassa.log.includes("to'liq qayta sinxronlash"), 'resync logi')
  })

  await test('bitta kassani bloklash: kassa bloklanadi, cloud u bilan sync qilmaydi; ochish', async () => {
    await admin('POST', `/customers/${customer.id}/node`, { node: 'kassa1', blocked: true })
    await until(async () => (await lic(KASSA)).state === 'device', 'kassa device blok')
    assert.strictEqual((await lic(CLOUD)).state, 'active', 'cloud ishlashi kerak')
    const r = await fetch(`http://127.0.0.1:${CLOUD}/api/sync/pull?since=0&node=kassa1`, { headers: { 'x-sync-key': SYNC_KEY, 'x-node': 'kassa1' } })
    assert.strictEqual(r.status, 403)
    await admin('POST', `/customers/${customer.id}/node`, { node: 'kassa1', blocked: false })
    await until(async () => (await lic(KASSA)).state === 'active', 'kassa ochildi')
  })

  await test('cloud o\'chdi — kassa litsenziyani to\'g\'ridan-to\'g\'ri oladi', async () => {
    const before = (await lic(KASSA)).lastCheckAt
    procs.cloud.kill()
    // Kassa ~10 s da cloud o'chganini sezadi va litsenziya serverining o'zidan tekshiradi
    const s = await until(async () => { const s = await lic(KASSA); return s.lastCheckAt > before && s }, "to'g'ridan-to'g'ri tekshiruv", 40000)
    assert.strictEqual(s.state, 'active')
    const c = (await admin('GET', '/customers')).find(x => x.id === customer.id)
    assert.ok(Object.values(c.instances).some(i => i.role === 'kassa'), 'kassa litsenziya serverida ko\'rinmadi')
  })

  await test('to\'xtatish cloud o\'chiq paytda ham kassaga yetadi', async () => {
    await admin('POST', `/customers/${customer.id}/suspend`, { mode: 'soft' })
    await until(async () => (await lic(KASSA)).state === 'suspended', 'kassa suspended (long-poll)', 10000)
    await admin('POST', `/customers/${customer.id}/activate`)
    await until(async () => (await lic(KASSA)).state === 'active', 'kassa active (long-poll)', 10000)
  })

  await test('kassa serverini ajratish — kassa bloklanadi, "ulanmagan"ga tushadi', async () => {
    const c = (await admin('GET', '/customers')).find(x => x.id === customer.id)
    const [inst] = Object.entries(c.instances).find(([, i]) => i.role === 'kassa')
    await admin('POST', `/customers/${customer.id}/unbind`, { instance: inst })
    await until(async () => (await lic(KASSA)).blocked === true, 'kassa bloklandi', 10000)
    assert.ok((await admin('GET', '/pending')).some(p => p.instance === inst), 'pending ro\'yxatida yo\'q')
    const ev = (await admin('GET', '/customers')).find(x => x.id === customer.id).events.map(e => e.act)
    for (const a of ['create', 'bind', 'suspend', 'activate', 'unbind']) assert.ok(ev.includes(a), 'tarixda yo\'q: ' + a)
  })

  console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi')
  if (failed && process.env.VERBOSE) for (const [n, p] of Object.entries(procs)) console.log(`\n── ${n} ──\n${p.log.slice(-3000)}`)
  Object.values(procs).forEach(p => p.kill())
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error(e); Object.values(procs).forEach(p => p.kill()); process.exit(1) })

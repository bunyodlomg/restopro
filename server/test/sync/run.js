// Ikki tugun: cloud (5191) va kassa (5192). Kassa tick qo'lda — "internet uzilgan" holatni boshqaramiz.
const { spawn } = require('child_process')
const path = require('path')
const assert = require('assert')
const node = path.join(__dirname, 'node.js')
const procs = [
  spawn(process.execPath, [node, 'cloud', '5191'], { stdio: 'inherit' }),
  spawn(process.execPath, [node, 'kassa', '5192', '5191'], { stdio: 'inherit' }),
]
const call = async (port, action, body = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}/t/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json()
  if (!r.ok) throw new Error(`${action}: ${j.error}`)
  return j
}
const C = (a, b) => call(5191, a, b), K = (a, b) => call(5192, a, b)
const wait = ms => new Promise(r => setTimeout(r, ms))
const qty = (o, id) => o.items.filter(i => i.productId === id).reduce((s, i) => s + i.quantity, 0)
let failed = 0
async function test(name, fn) {
  try { await fn(); console.log('  ✅', name) } catch (e) { failed++; console.log('  ❌', name, '\n     ', e.message) }
}

;(async () => {
  for (let i = 0; i < 50; i++) { try { await C('reset'); await K('reset'); break } catch { await wait(300) } }
  const ids = await C('seed')
  await K('tick')                                   // kassa hammasini oladi
  const order = await C('order', { ...ids, items: [{ productId: ids.p1, quantity: 1 }] })
  await K('tick')
  const kOrder = await K('get', { model: 'Order', id: order._id })
  assert.ok(kOrder, 'buyurtma kassaga yetmadi')

  await test('ikki tomonda bir stolga taom qo\'shish — hech biri yo\'qolmaydi', async () => {
    await C('order', { ...ids, items: [{ productId: ids.p1, quantity: 2 }] })                  // cloud: osh +2 → 3
    await K('order', { ...ids, items: [{ productId: ids.p1, quantity: 1 }, { productId: ids.p2, quantity: 4 }] }) // kassa: osh +1, choy 4
    await K('tick'); await K('tick')
    const c = await C('get', { model: 'Order', id: order._id })
    const k = await K('get', { model: 'Order', id: order._id })
    assert.strictEqual(qty(c, ids.p1), 4, 'cloud osh ' + qty(c, ids.p1))
    assert.strictEqual(qty(c, ids.p2), 4, 'cloud choy ' + qty(c, ids.p2))
    assert.strictEqual(c.totalPrice, 4 * 30000 + 4 * 5000, 'cloud jami ' + c.totalPrice)
    assert.strictEqual(qty(k, ids.p1), 4, 'kassa osh ' + qty(k, ids.p1))
    assert.strictEqual(qty(k, ids.p2), 4, 'kassa choy ' + qty(k, ids.p2))
    assert.strictEqual(k.totalPrice, c.totalPrice)
  })

  await test('ombor qoldig\'i: ikki tomondagi ayirishlar ikkalasi ham hisoblanadi', async () => {
    await C('inc', { id: ids.ing, by: -3 })
    await K('inc', { id: ids.ing, by: -5 })
    await K('tick'); await K('tick')
    const c = await C('get', { model: 'Ingredient', id: ids.ing })
    const k = await K('get', { model: 'Ingredient', id: ids.ing })
    assert.strictEqual(c.quantity, 92, 'cloud ' + c.quantity)
    assert.strictEqual(k.quantity, 92, 'kassa ' + k.quantity)
  })

  await test("push va pull orasida kassada o'zgarish — kassa o'zi birlashtiradi", async () => {
    await C('inc', { id: ids.ing, by: -10 })     // cloud: 92 → 82
    await K('inc', { id: ids.ing, by: -1 })      // kassa: 92 → 91, hali yuborilmagan
    await K('pull')                              // cloud versiyasi keladi, lokal o'zgarish ustiga
    assert.strictEqual((await K('get', { model: 'Ingredient', id: ids.ing })).quantity, 81, 'kassa pull dan keyin')
    await K('tick'); await K('tick')
    assert.strictEqual((await C('get', { model: 'Ingredient', id: ids.ing })).quantity, 81, 'cloud')
    assert.strictEqual((await K('get', { model: 'Ingredient', id: ids.ing })).quantity, 81, 'kassa')
  })

  await test('turli maydonlar: cloud izoh, kassa qo\'shimcha to\'lov — ikkalasi saqlanadi', async () => {
    await C('note', { id: order._id, note: 'achchiq bo\'lmasin' })
    await K('extra', { id: order._id, fee: 10000, comment: 'yetkazish' })
    await K('tick'); await K('tick')
    for (const [side, d] of [['cloud', await C('get', { model: 'Order', id: order._id })], ['kassa', await K('get', { model: 'Order', id: order._id })]]) {
      assert.strictEqual(d.note, 'achchiq bo\'lmasin', side + ' izoh')
      assert.strictEqual(d.extras.length, 1, side + ' extras')
    }
  })

  await test('kassa yopdi, cloud shu paytda "tayyor" qildi — yopilgan qoladi', async () => {
    await C('status', { id: order._id, status: 'ready' })
    await K('status', { id: order._id, status: 'closed' })
    await K('tick'); await K('tick')
    assert.strictEqual((await C('get', { model: 'Order', id: order._id })).status, 'closed')
    assert.strictEqual((await K('get', { model: 'Order', id: order._id })).status, 'closed')
  })

  await test('kassa soati 10 daqiqa orqada — oddiy sync baribir ishlaydi va farq o\'lchanadi', async () => {
    const st = await K('tick')
    assert.ok(Math.abs(st.clockOffset) < 1000, 'offset ' + st.clockOffset)
    await K('clock', { ms: -600000 })   // _mtime 10 daqiqa orqada yozilsin
    await K('note', { id: order._id, note: 'kassadan' })
    await K('tick')
    assert.strictEqual((await C('get', { model: 'Order', id: order._id })).note, 'kassadan')
  })

  await test('o\'zgarishsiz takroriy sync — hech narsa o\'zgarmaydi (aylanib qolmaydi)', async () => {
    const before = await C('get', { model: 'Order', id: order._id })
    for (let i = 0; i < 3; i++) await K('tick')
    const after = await C('get', { model: 'Order', id: order._id })
    assert.strictEqual(after._seq, before._seq, 'cloud _seq o\'zgardi')
    const st = await K('tick')
    assert.strictEqual(st.pending, 0, 'pending ' + st.pending)
  })

  await test("eski o'chirish belgilari tozalanadi; uzoq o'chiq kassa to'liq qayta sinxronlanadi", async () => {
    // Kassa "o'chiq" paytida cloud'da mahsulot o'chirildi
    const p = await C('order', { ...ids, items: [{ productId: ids.p2, quantity: 1 }] })   // (mahsulot o'zi kerak)
    await C('del', { model: 'Product', id: ids.p2 })
    await C('ageTombs')                       // 200 kun oldin bo'lgandek
    assert.ok((await C('purgeHub')).n >= 1, 'tozalanmadi')
    await K('setPulled', { v: 1 })           // kassa juda eski joydan davom etmoqchi
    await K('tick'); await K('tick')
    assert.strictEqual(await K('get', { model: 'Product', id: ids.p2 }), null, "o'chirilgan mahsulot kassada qoldi")
    assert.ok(await K('get', { model: 'Product', id: ids.p1 }), "boshqa mahsulot ham o'chdi")
    assert.strictEqual((await K('count', { model: 'Order' })).n, (await C('count', { model: 'Order' })).n)
  })

  console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi')
  procs.forEach(p => p.kill()); process.exit(failed ? 1 : 0)
})().catch(e => { console.error(e); procs.forEach(p => p.kill()); process.exit(1) })

// ── Sync: bir hujjat ikki tomonda bir vaqtda o'zgarganda birlashtirish ──
// "Oxirgi yozgan yutadi" butun hujjat uchun yaramaydi: kassada stolga taom qo'shilsa,
// shu paytda cloud'da (telefondan) ham qo'shilsa — bittasining taomlari yo'qolardi.
//
// Uch tomonlama birlashtirish: base — ikkala tomon oxirgi marta kelishgan versiya
// (kassa uni sync_shadow'da saqlaydi va push bilan birga yuboradi), cur — shu bazadagi,
// inc — kelgan. Faqat bir tomonda o'zgargan maydon o'sha tomondan olinadi; ikkalasida
// o'zgargan bo'lsa — maydon turiga qarab:
//   hisoblagichlar (ombor qoldig'i, xizmat haqi)  → ikkala o'zgarish qo'shiladi
//   buyurtma taomlari                            → har bir taom miqdori bo'yicha qo'shiladi
//   qo'shimcha to'lovlar (extras)                → element bo'yicha (qo'shilgan/o'chirilgan)
//   buyurtma holati                              → yopilgan > bekor > oshxonada > tayyor
//   qolganlari                                   → yangiroq o'zgarish yutadi

const { EJSON } = require('mongoose').mongo.BSON

const META = new Set(['_id', '_seq', '_mtime', '_origin'])

// Sync orqali kelgan sonlar BSON obyekti (Int32/Double/Long), bazadagisi — oddiy son
const NUMERIC = new Set(['Int32', 'Double', 'Long', 'Decimal128'])
const unwrap = v => (v && NUMERIC.has(v._bsontype) ? Number(v.toString()) : v)
const num = v => { v = unwrap(v); return typeof v === 'number' && isFinite(v) ? v : 0 }

// Kalitlar tartibi va son turidan (Int32 / oddiy son) qat'i nazar solishtirish
function canon(v) {
  if (v === undefined) return 'u'
  const walk = x => {
    x = unwrap(x)
    if (Array.isArray(x)) return x.map(walk)
    if (x && typeof x === 'object' && !x._bsontype && !(x instanceof Date)) return Object.keys(x).sort().reduce((o, k) => (o[k] = walk(x[k]), o), {})
    return x
  }
  return JSON.stringify(EJSON.serialize({ v: walk(v) }, { relaxed: true }))
}
const eq = (a, b) => canon(a) === canon(b)

// Ikkala tomondagi o'zgarish yig'iladi: cur + (inc - base)
const COUNTERS = {
  ingredients: ['quantity'],
  settings: ['soboyCounter'],
  orders: ['serviceFee'],
}

const STATUS_RANK = { closed: 4, cancelled: 3, pending: 2, ready: 1 }

const itemKey = x => `${x.productId}|${x.price}`
function groupItems(list) {
  const m = new Map()
  for (const x of list || []) {
    const k = itemKey(x)
    const g = m.get(k)
    if (g) g.q += num(x.quantity)
    else m.set(k, { item: x, q: num(x.quantity) })
  }
  return m
}
function mergeItems(b, c, i) {
  const B = groupItems(b), C = groupItems(c), I = groupItems(i)
  const out = []
  for (const k of new Set([...C.keys(), ...I.keys()])) {
    const q = (C.get(k)?.q || 0) + (I.get(k)?.q || 0) - (B.get(k)?.q || 0)
    if (q > 0) out.push({ ...(C.get(k) || I.get(k)).item, quantity: q })
  }
  return out
}

// Element bo'yicha (_id): bir tomonda o'chirilgani o'chadi, qo'shilgani qo'shiladi
function mergeById(b, c, i) {
  const id = x => String(x?._id)
  const B = new Map((b || []).map(x => [id(x), x]))
  const C = new Map((c || []).map(x => [id(x), x]))
  const I = new Map((i || []).map(x => [id(x), x]))
  const out = []
  for (const k of new Set([...C.keys(), ...I.keys()])) {
    const bx = B.get(k), cx = C.get(k), ix = I.get(k)
    if (bx && (!cx || !ix)) continue
    if (cx && ix) out.push(eq(cx, ix) || !eq(bx, cx) ? cx : ix)
    else out.push(cx || ix)
  }
  return out
}

const union = (c, i) => {
  const out = [...(c || [])]
  for (const x of i || []) if (!out.some(y => eq(x, y))) out.push(x)
  return out
}

// Ikkala tomonda o'zgargan maydon
function both(coll, key, b, c, i, incNewer) {
  if (COUNTERS[coll]?.includes(key) && (typeof unwrap(c) === 'number' || typeof unwrap(i) === 'number')) return num(c) + num(i) - num(b)
  if (coll === 'orders') {
    if (key === 'items') return mergeItems(b, c, i)
    if (key === 'extras') return mergeById(b, c, i)
    if (key === 'clientIds') return union(c, i)
    if (key === 'status') return (STATUS_RANK[i] || 0) > (STATUS_RANK[c] || 0) ? i : c
  }
  if (key === 'updatedAt') return new Date(c) > new Date(i) ? c : i
  if (key === '__v') return Math.max(num(c), num(i))
  return incNewer ? i : c
}

// → birlashtirilgan hujjat (meta maydonlarsiz — ularni chaqiruvchi qo'yadi)
function merge3(coll, base, cur, inc, incNewer) {
  const out = { _id: cur._id }
  let itemsMerged = false
  for (const k of new Set([...Object.keys(cur), ...Object.keys(inc)])) {
    if (META.has(k)) continue
    const b = base[k], c = cur[k], i = inc[k]
    let v
    if (eq(c, i)) v = c
    else if (eq(b, c)) v = i
    else if (eq(b, i)) v = c
    else {
      v = both(coll, k, b, c, i, incNewer)
      if (k === 'items') itemsMerged = true
    }
    if (v !== undefined) out[k] = v
  }
  if (coll === 'orders' && itemsMerged) out.totalPrice = out.items.reduce((s, x) => s + num(x.price) * num(x.quantity), 0)
  return out
}

// Ma'lumot jihatidan bir xilmi (meta maydonlarni hisobga olmay)
function sameData(a, b) {
  const strip = d => Object.fromEntries(Object.entries(d).filter(([k]) => !META.has(k)))
  return eq(strip(a), strip(b))
}

// Bu bazadagi hujjat base bilan aynan bir versiyami (o'shandan beri o'zgarmagan)
const sameVersion = (a, b) => !!a && !!b &&
  new Date(a._mtime || 0).getTime() === new Date(b._mtime || 0).getTime() && String(a._origin || '') === String(b._origin || '')

module.exports = { merge3, sameData, sameVersion, eq }

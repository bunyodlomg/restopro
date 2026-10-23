// ── Ombor hisobi: kirim, sarf, hisobdan chiqarish, inventarizatsiya ──
// Qoldiq doim $inc bilan o'zgaradi — kassa va cloud bir vaqtda ayirsa ham sync ikkalasini qo'shadi.
// Har harakat StockMove'ga yoziladi; qoldiq minimumdan tushsa — «stockAlert» (admin ekranlarida ogohlantirish).
const Ingredient = require('../models/Ingredient')
const StockMove  = require('../models/StockMove')
const Product    = require('../models/Product')
const { convert } = require('./units')

const round = n => Math.round(n * 1e6) / 1e6
const cost = (qty, price) => Math.round(Math.abs(qty) * (Number(price) || 0))

// Qoldiq chegarani kesib o'tdimi: oldin yetarli edi, endi kam / tugadi
function crossed(before, after, min) {
  if (after <= 0 && before > 0) return 'out'
  if (min > 0 && after <= min && before > min) return 'low'
  return null
}

function alert(io, list) {
  if (io && list.length) io.emit('stockAlert', list.map(g => ({ _id: g._id, name: g.name, quantity: g.quantity, unit: g.unit, minQty: g.minQty, level: g.level })))
}

// Qoldiqni o'zgartirish + harakat izi. delta — ombor birligida, ishorali
async function apply(ingredientId, delta, { type, unitPrice, note = '', by = '', orderId = null, set }, io) {
  const ing = await Ingredient.findByIdAndUpdate(ingredientId, { $inc: { quantity: round(delta) }, ...(set ? { $set: set } : {}) }, { new: true })
  if (!ing) return null
  const price = unitPrice ?? ing.price
  await StockMove.create({
    ingredientId: ing._id, ingredientName: ing.name, unit: ing.unit, type,
    quantity: round(delta), unitPrice: price, cost: cost(delta, price), orderId, note: String(note).slice(0, 200), by,
  })
  const level = crossed(ing.quantity - delta, ing.quantity, ing.minQty)
  if (level) alert(io, [{ ...ing.toObject(), level }])
  io?.emit('stockChanged')
  return ing
}

// Buyurtma yopildi — retseptlar bo'yicha sarf. Hech qachon xato tashlamaydi (buyurtma yopilishi to'xtamasin):
// muammolar (o'chirilgan ingredient, mos kelmaydigan birlik) warnings sifatida qaytadi.
async function consumeOrder(order, { io, by = '' } = {}) {
  const warnings = []
  try {
    const ids = order.items.map(i => i.productId).filter(Boolean)
    const products = await Product.find({ _id: { $in: ids } }).populate('ingredients.ingredient').lean()
    const byId = Object.fromEntries(products.map(p => [String(p._id), p]))

    // Bir xil ingredient bir necha taomda bo'lsa — bitta harakat
    const need = new Map()
    for (const item of order.items) {
      const p = byId[String(item.productId)]
      if (!p) continue
      for (const r of p.ingredients || []) {
        const ing = r.ingredient
        if (!ing) { warnings.push(`«${p.name}» retseptida o'chirilgan ingredient bor`); continue }
        const qty = convert((Number(r.quantity) || 0) * item.quantity, r.recipeUnit || ing.unit, ing.unit)
        if (qty === null) { warnings.push(`«${p.name}»: ${ing.name} uchun ${r.recipeUnit} → ${ing.unit} o'tkazib bo'lmaydi`); continue }
        if (qty > 0) need.set(String(ing._id), (need.get(String(ing._id)) || 0) + qty)
      }
    }

    const alerts = []
    for (const [id, qty] of need) {
      const ing = await Ingredient.findByIdAndUpdate(id, { $inc: { quantity: -round(qty) } }, { new: true })
      if (!ing) continue
      await StockMove.create({
        ingredientId: ing._id, ingredientName: ing.name, unit: ing.unit, type: 'out',
        quantity: -round(qty), unitPrice: ing.price, cost: cost(qty, ing.price), orderId: order._id, by,
      })
      const level = crossed(ing.quantity + qty, ing.quantity, ing.minQty)
      if (level) alerts.push({ ...ing.toObject(), level })
    }
    alert(io, alerts)
    if (need.size) io?.emit('stockChanged')
  } catch (err) {
    warnings.push('Ombordan ayirishda xato: ' + err.message)
  }
  if (warnings.length) console.warn('📦 ombor:', warnings.join('; '))
  return warnings
}

// Kirim (xarid): qoldiq ortadi, narx — o'rtacha (eski qoldiq va yangi xarid bo'yicha)
async function restock(id, qty, unitPrice, opts, io) {
  const cur = await Ingredient.findById(id).lean()
  if (!cur) return null
  let price = cur.price
  if (unitPrice > 0) {
    const have = Math.max(0, cur.quantity)
    price = have > 0 && cur.price > 0 ? Math.round((have * cur.price + qty * unitPrice) / (have + qty)) : unitPrice
  }
  return apply(id, qty, { ...opts, type: 'in', unitPrice: unitPrice > 0 ? unitPrice : cur.price, set: { price } }, io)
}

module.exports = { apply, consumeOrder, restock, crossed }

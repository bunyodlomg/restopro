const router     = require('express').Router()
const Order      = require('../models/Order')
const Table      = require('../models/Table')
const Ingredient = require('../models/Ingredient')
const Product    = require('../models/Product')
const Settings   = require('../models/Settings')
const Salary     = require('../models/Salary')
const Purchase   = require('../models/Purchase')
const auth       = require('../middleware/auth')
const { adminOnly } = require('../middleware/auth')
const print      = require('../print')

// O'zgartirish mumkin bo'lgan (hali yopilmagan) buyurtma holatlari
const OPEN_STATUSES = ['pending', 'ready']

// Buyurtma topilmadi yoki allaqachon yopilgan/bekor qilingan
async function notOpen(req, res) {
  try {
    const exists = await Order.exists({ _id: req.params.id })
    if (!exists) return res.status(404).json({ message: 'Buyurtma topilmadi' })
    return res.status(409).json({ message: 'Buyurtma allaqachon yopilgan yoki bekor qilingan' })
  } catch (err) { res.status(500).json({ message: err.message }) }
}

// ─── GET /api/orders ────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, startDate, endDate, page, limit } = req.query
    const filter = {}
    if (status) filter.status = status

    // Sana bo'yicha filtr (createdAt) — "YYYY-MM-DD", server lokal vaqti bo'yicha
    if (startDate || endDate) {
      filter.createdAt = {}
      if (startDate) filter.createdAt.$gte = new Date(startDate + 'T00:00:00.000')
      if (endDate)   filter.createdAt.$lte = new Date(endDate   + 'T23:59:59.999')
    }

    // Sahifalash so'ralganda — { orders, total, page, pages } qaytadi
    if (page !== undefined || limit !== undefined) {
      const pageNum  = Math.max(1, parseInt(page, 10) || 1)
      const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50))
      const [orders, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * pageSize).limit(pageSize),
        Order.countDocuments(filter),
      ])
      return res.json({
        orders,
        total,
        page: pageNum,
        pages: Math.max(1, Math.ceil(total / pageSize)),
        limit: pageSize,
      })
    }

    // Eski xulq — oddiy massiv (boshqa sahifalar buzilmasligi uchun)
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(500)
    res.json(orders)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── GET /api/orders/stats ──────────────────────────────────────
router.get('/stats', auth, adminOnly, async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    const startStr = startDate || new Date().toISOString().split('T')[0]
    const endStr   = endDate   || new Date().toISOString().split('T')[0]
    const start = new Date(startStr + 'T00:00:00.000Z')
    const end   = new Date(endStr   + 'T23:59:59.999Z')

    // Daromad — yopilgan buyurtmalar; Chiqim — oyliklar + ingredient xaridlari
    const [orders, salaries, purchases] = await Promise.all([
      Order.find({ status: 'closed', closedAt: { $gte: start, $lte: end } }),
      Salary.find({ paidAt:    { $gte: start, $lte: end } }),
      Purchase.find({ createdAt: { $gte: start, $lte: end } }),
    ])

    // Davrdagi har bir kun uchun yacheyka — bo'sh kunlar ham 0 bilan to'ladi
    const dailyMap = {}
    const cursor = new Date(start)
    while (cursor <= end) {
      const k = cursor.toISOString().split('T')[0]
      dailyMap[k] = { date: k, income: 0, expense: 0 }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    const cell = key => (dailyMap[key] || (dailyMap[key] = { date: key, income: 0, expense: 0 }))

    let totalSold = 0, totalIncome = 0
    const productMap = {}

    orders.forEach(order => {
      const c = cell(new Date(order.closedAt).toISOString().split('T')[0])
      order.items.forEach(item => {
        totalSold += item.quantity
        const t = item.price * item.quantity
        totalIncome += t
        c.income += t
        if (!productMap[item.name]) productMap[item.name] = { name: item.name, quantity: 0, total: 0 }
        productMap[item.name].quantity += item.quantity
        productMap[item.name].total    += t
      })
      order.extras?.forEach(ex => { totalIncome += ex.extraFee || 0; c.income += ex.extraFee || 0 })
      if (order.serviceFee) { totalIncome += order.serviceFee; c.income += order.serviceFee }
    })

    let salaryExpense = 0, purchaseExpense = 0
    salaries.forEach(s => {
      const amt = s.amount || 0
      cell(new Date(s.paidAt).toISOString().split('T')[0]).expense += amt
      salaryExpense += amt
    })
    purchases.forEach(p => {
      const amt = p.totalCost || 0
      cell(new Date(p.createdAt).toISOString().split('T')[0]).expense += amt
      purchaseExpense += amt
    })

    const totalExpense = salaryExpense + purchaseExpense
    const products = Object.values(productMap).sort((a, b) => b.total - a.total)
    const daily    = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))

    const rangeDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1
    const prevEnd = new Date(start)
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1)
    prevEnd.setUTCHours(23, 59, 59, 999)
    const prevStart = new Date(prevEnd)
    prevStart.setUTCDate(prevStart.getUTCDate() - rangeDays + 1)
    prevStart.setUTCHours(0, 0, 0, 0)

    const [prevOrders, prevSalaries, prevPurchases] = await Promise.all([
      Order.find({ status: 'closed', closedAt: { $gte: prevStart, $lte: prevEnd } }),
      Salary.find({ paidAt: { $gte: prevStart, $lte: prevEnd } }),
      Purchase.find({ createdAt: { $gte: prevStart, $lte: prevEnd } }),
    ])

    let prevIncome = 0, prevSold = 0
    prevOrders.forEach(o => {
      o.items.forEach(i => { prevSold += i.quantity; prevIncome += i.price * i.quantity })
      o.extras?.forEach(e => { prevIncome += e.extraFee || 0 })
      if (o.serviceFee) prevIncome += o.serviceFee
    })
    let prevSalaryExp = 0, prevPurchaseExp = 0
    prevSalaries.forEach(s => { prevSalaryExp += s.amount || 0 })
    prevPurchases.forEach(p => { prevPurchaseExp += p.totalCost || 0 })
    const prevExpenseTotal = prevSalaryExp + prevPurchaseExp
    const prevProfit = prevIncome - prevExpenseTotal
    const pct = (c, p) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / Math.abs(p)) * 100)

    const comparison = {
      income: pct(totalIncome, prevIncome),
      expense: pct(totalExpense, prevExpenseTotal),
      profit: pct(totalIncome - totalExpense, prevProfit),
      orders: pct(orders.length, prevOrders.length),
      sold: pct(totalSold, prevSold),
      avgOrder: pct(
        orders.length ? Math.round(totalIncome / orders.length) : 0,
        prevOrders.length ? Math.round(prevIncome / prevOrders.length) : 0
      ),
    }

    res.json({
      totalSold,
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      salaryExpense,
      purchaseExpense,
      products,
      orderCount: orders.length,
      daily,
      comparison,
    })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── GET /api/orders/monthly ────────────────────────────────────
router.get('/monthly', auth, adminOnly, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear()
    const start = new Date(`${year}-01-01T00:00:00.000Z`)
    const end   = new Date(`${year}-12-31T23:59:59.999Z`)
    const orders = await Order.find({ status: 'closed', closedAt: { $gte: start, $lte: end } })

    const monthly = {}
    for (let m = 1; m <= 12; m++) monthly[m] = 0

    orders.forEach(order => {
      const m = new Date(order.closedAt).getMonth() + 1
      order.items.forEach(i => { monthly[m] += i.price * i.quantity })
      order.extras?.forEach(e => { monthly[m] += e.extraFee || 0 })
      if (order.serviceFee) monthly[m] += order.serviceFee
    })

    const months = ['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek']
    const data = Object.entries(monthly).map(([m, income]) => ({ month: months[m-1], income }))
    res.json(data)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── POST /api/orders ───────────────────────────────────────────
// Stol band bo'lsa — mavjud buyurtmaga qo'shish (merge)
const fail = (status, message) => Object.assign(new Error(message), { status })

// Buyurtma yaratish yoki band stolning ochiq buyurtmasiga qo'shish.
// Ofitsant (POST /api/orders) va mijozning QR buyurtmasi (qabul qilinganda) shu yerdan o'tadi.
async function placeOrder(io, { tableId, tableNumber, category, waiterName, items, note, clientId }, user) {

    if (!Array.isArray(items) || items.length === 0)
      throw fail(400, 'Kamida bitta taom tanlang')

    // ── Idempotency: bu clientId allaqachon qayta ishlanganmi? ──
    // (offline navbatdan takror yuborilsa, dublikat yaratilmaydi)
    if (clientId) {
      clientId = String(clientId).slice(0, 100)
      const already = await Order.findOne({ clientIds: clientId })
      if (already) return { order: already, merged: true }
    }

    // Narxlarni DB dan tekshirish
    const enrichedItems = []
    const categoryOf = {}     // oshxona printerlariga taqsimlash uchun
    for (const item of items) {
      // Manfiy yoki kasr miqdor jami summani kamaytirib yuborishi mumkin
      const quantity = item.quantity === undefined ? 1 : Number(item.quantity)
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
        throw fail(400, 'Miqdor 1 dan 999 gacha butun son bo\'lishi kerak')
      const product = await Product.findById(item.productId)
      if (!product || !product.isActive) continue
      categoryOf[product._id] = product.category
      enrichedItems.push({
        productId: product._id,
        name:      product.name,
        price:     product.price,
        quantity,
      })
    }
    if (!enrichedItems.length) throw fail(400, 'Mahsulotlar topilmadi')

    // Xizmat haqi sozlamasini olish
    let serviceFee = 0
    let serviceFeePercent = 0
    try {
      const settings = await Settings.findById('main')
      if (settings?.serviceFeeEnabled && category !== 'soboy') {
        serviceFeePercent = settings.serviceFeePercent
        const itemsTotal = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0)
        serviceFee = Math.round(itemsTotal * (serviceFeePercent / 100))
      }
    } catch {}

    // Soboy uchun: stol yo'q, raqam avtomatik
    let soboySuffix = null
    if (category === 'soboy') {
      const settings = await Settings.findByIdAndUpdate('main', { $inc: { soboyCounter: 1 } }, { new: true, upsert: true })
      soboySuffix = settings.soboyCounter
    }

    // Band stol uchun mavjud pending buyurtmani topish va merge qilish
    if (tableId && category !== 'soboy') {
      // "Tayyor" holatidagi ham ochiq hisob — yangi taom qo'shilsa yana oshxonaga (pending)
      const existing = await Order.findOne({ tableId, status: { $in: OPEN_STATUSES } }).sort({ createdAt: 1 })
      if (existing) {
        existing.status = 'pending'
        // Mavjud itemlarga qo'shish (bir xil mahsulot bo'lsa miqdorini oshirish)
        for (const newItem of enrichedItems) {
          const idx = existing.items.findIndex(
            i => i.productId?.toString() === newItem.productId?.toString()
          )
          if (idx >= 0) {
            existing.items[idx].quantity += newItem.quantity
          } else {
            existing.items.push(newItem)
          }
        }
        // Jami qayta hisoblash
        existing.totalPrice = existing.items.reduce((s,i) => s + i.price * i.quantity, 0)
        existing.serviceFee = Math.round(existing.totalPrice * (serviceFeePercent / 100))
        if (clientId && !existing.clientIds.includes(clientId)) existing.clientIds.push(clientId)
        await existing.save()
        io.emit('orderUpdated', existing)
        printTickets(existing, enrichedItems, categoryOf, true)
        return { order: existing, merged: true }
      }
    }

    const totalPrice = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0)

    const order = await Order.create({
      tableId:     category === 'soboy' ? null : tableId,
      tableNumber: category === 'soboy' ? soboySuffix : tableNumber,
      category,
      waiterName:  waiterName || user.name,
      waiterId:    user._id,
      items:       enrichedItems,
      totalPrice,
      serviceFee,
      note: note || '',
      clientIds:   clientId ? [clientId] : [],
    })

    // Stol bandligini yangilash
    if (tableId && category !== 'soboy') {
      const updatedTable = await Table.findByIdAndUpdate(
        tableId,
        { status: 'busy', currentOrder: order._id },
        { new: true }
      )
      io.emit('tableUpdated', updatedTable)
    }

    io.emit('newOrder', order)
    printTickets(order, enrichedItems, categoryOf, false)
    return { order, merged: false }
}

// Oshpaz / shashlikchi printerlariga faqat yangi qo'shilgan taomlar.
// Printer xatosi buyurtmani to'xtatmaydi.
function printTickets(order, items, categoryOf, added) {
  print.queueOrderTickets(order, items.map(i => ({ name: i.name, quantity: i.quantity, category: categoryOf[i.productId] })), { added })
    .catch(err => console.error('🖨️  talon:', err.message))
}

router.post('/', auth, async (req, res) => {
  try {
    const { order, merged } = await placeOrder(req.app.get('io'), { ...req.body, waiterName: req.body.waiterName || req.user.name }, req.user)
    res.status(merged ? 200 : 201).json(order)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message })
    console.error('Order xatosi:', err)
    res.status(500).json({ message: 'Server xatosi' })
  }
})

// ─── PUT /api/orders/:id/close ──────────────────────────────────
router.put('/:id/close', auth, adminOnly, async (req, res) => {
  try {
    // Atomar: faqat ochiq buyurtma yopiladi — qayta yopishda ombor ikki marta ayirilmaydi
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES } },
      { status: 'closed', closedAt: new Date() },
      { new: true }
    )
    if (!order) return notOpen(req, res)

    // Ingredientlarni ombordan ayirish (birlik konversiyasi bilan)
    for (const item of order.items) {
      const product = await Product.findById(item.productId).populate('ingredients.ingredient')
      if (!product) continue
      for (const ing of product.ingredients) {
        // Konversiya: taomda g, ombordan kg chiqadi
        let qtyToDeduct = ing.quantity * item.quantity
        const ingUnit  = ing.ingredient?.unit || 'kg'
        const recipeUnit = ing.recipeUnit || ingUnit

        // g → kg, ml → l konversiyasi
        if (ingUnit === 'kg' && recipeUnit === 'g') qtyToDeduct = qtyToDeduct / 1000
        if (ingUnit === 'l'  && recipeUnit === 'ml') qtyToDeduct = qtyToDeduct / 1000

        await Ingredient.findByIdAndUpdate(
          ing.ingredient._id,
          { $inc: { quantity: -qtyToDeduct } }
        )
      }
    }

    // Stolni bo'shatish
    if (order.tableId) {
      // Shu stolda boshqa pending buyurtma bormi?
      const otherPending = await Order.findOne({
        tableId: order.tableId,
        status: 'pending',
        _id: { $ne: order._id }
      })
      if (!otherPending) {
        const updatedTable = await Table.findByIdAndUpdate(
          order.tableId,
          { status: 'free', currentOrder: null },
          { new: true }
        )
        req.app.get('io').emit('tableUpdated', updatedTable)
      }
    }

    req.app.get('io').emit('orderClosed', order._id.toString())
    // Ofitsant tarafida ham chiqsin
    req.app.get('io').emit('orderClosedSound')
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── PUT /api/orders/:id ────────────────────────────────────────
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    // Narx/summa/holatni to'g'ridan-to'g'ri o'zgartirib bo'lmaydi:
    // yopish — /close, bekor qilish — DELETE orqali.
    const update = {}
    if (req.body.note !== undefined) update.note = String(req.body.note).slice(0, 500)
    if (req.body.status !== undefined) {
      if (!OPEN_STATUSES.includes(req.body.status))
        return res.status(400).json({ message: 'Noto\'g\'ri holat' })
      update.status = req.body.status
    }
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES } }, update, { new: true }
    )
    if (!order) return notOpen(req, res)
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── POST /api/orders/:id/return ────────────────────────────────
// Mijoz stolidan qaytarilgan taomlar: { items: [{ itemId, quantity }], reason }.
// Miqdor buyurtmadan ayiriladi (hisob, xizmat haqi qayta hisoblanadi), qaytarilgani tarixda qoladi.
// Qaytarilgan dona ombordan ayirilmaydi — yopishda faqat qolgan items hisoblanadi.
router.post('/:id/return', auth, adminOnly, async (req, res) => {
  try {
    const list = Array.isArray(req.body.items) ? req.body.items : []
    const reason = String(req.body.reason || '').trim().slice(0, 200)
    const order = await Order.findOne({ _id: req.params.id, status: { $in: OPEN_STATUSES } })
    if (!order) return notOpen(req, res)

    let returned = 0
    for (const r of list) {
      const qty = Number(r?.quantity)
      const item = order.items.id(r?.itemId)
      if (!item || !Number.isInteger(qty) || qty < 1) continue
      if (qty > item.quantity) return res.status(400).json({ message: `«${item.name}» — ${item.quantity} tadan ko'p qaytarib bo'lmaydi` })
      order.returns.push({ productId: item.productId, name: item.name, price: item.price, quantity: qty, reason, by: req.user.name || '' })
      item.quantity -= qty
      if (item.quantity === 0) item.deleteOne()
      returned += qty
    }
    if (!returned) return res.status(400).json({ message: 'Qaytariladigan taomni tanlang' })

    // Jami va xizmat haqi — qolgan taomlar bo'yicha (foiz buyurtma ochilgandagidek saqlanadi)
    const before = order.totalPrice
    order.totalPrice = order.items.reduce((s, i) => s + i.price * i.quantity, 0)
    order.serviceFee = before > 0 ? Math.round(order.serviceFee * order.totalPrice / before) : 0
    await order.save()
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── POST /api/orders/:id/extras ────────────────────────────────
router.post('/:id/extras', auth, adminOnly, async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES } },
      { $push: { extras: { extraFee: +req.body.extraFee || 0, comment: String(req.body.comment || '').slice(0, 200) } } },
      { new: true }
    )
    if (!order) return notOpen(req, res)
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── PUT /api/orders/:id/extras/:extraId ────────────────────────
router.put('/:id/extras/:extraId', auth, adminOnly, async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES }, 'extras._id': req.params.extraId },
      { $set: { 'extras.$.extraFee': +req.body.extraFee || 0, 'extras.$.comment': String(req.body.comment || '').slice(0, 200) } },
      { new: true }
    )
    if (!order) return res.status(404).json({ message: 'Topilmadi yoki buyurtma yopilgan' })
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── DELETE /api/orders/:id/extras/:extraId ─────────────────────
router.delete('/:id/extras/:extraId', auth, adminOnly, async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES } },
      { $pull: { extras: { _id: req.params.extraId } } },
      { new: true }
    )
    if (!order) return notOpen(req, res)
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── DELETE /api/orders/:id ─────────────────────────────────────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    // Yopilgan (to'langan) buyurtmani bekor qilib, tushumni yashirib bo'lmaydi
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, status: { $in: OPEN_STATUSES } },
      { status: 'cancelled', closedAt: new Date() },
      { new: true }
    )
    if (!order) return notOpen(req, res)
    if (order.tableId) {
      const other = await Order.findOne({ tableId: order.tableId, status: 'pending', _id: { $ne: order._id } })
      if (!other) {
        const t = await Table.findByIdAndUpdate(order.tableId, { status: 'free', currentOrder: null }, { new: true })
        req.app.get('io').emit('tableUpdated', t)
      }
    }
    req.app.get('io').emit('orderClosed', order._id.toString())
    res.json({ message: 'Bekor qilindi' })
  } catch (err) { res.status(500).json({ message: err.message }) }
})

module.exports = router
module.exports.placeOrder = placeOrder

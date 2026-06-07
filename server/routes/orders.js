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
router.post('/', auth, async (req, res) => {
  try {
    const { tableId, tableNumber, category, waiterName, items, note } = req.body

    if (!items || items.length === 0)
      return res.status(400).json({ message: 'Kamida bitta taom tanlang' })

    // Narxlarni DB dan tekshirish
    const enrichedItems = []
    for (const item of items) {
      const product = await Product.findById(item.productId)
      if (!product) continue
      enrichedItems.push({
        productId: product._id,
        name:      product.name,
        price:     product.price,
        quantity:  item.quantity || 1,
      })
    }
    if (!enrichedItems.length) return res.status(400).json({ message: 'Mahsulotlar topilmadi' })

    // Xizmat haqi sozlamasini olish
    let serviceFee = 0
    try {
      const settings = await Settings.findById('main')
      if (settings?.serviceFeeEnabled && category !== 'soboy') {
        const itemsTotal = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0)
        serviceFee = Math.round(itemsTotal * (settings.serviceFeePercent / 100))
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
      const existing = await Order.findOne({ tableId, status: 'pending' })
      if (existing) {
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
        existing.serviceFee = serviceFee ? Math.round(existing.totalPrice * 0.1) : 0
        await existing.save()
        req.app.get('io').emit('orderUpdated', existing)
        return res.json(existing)
      }
    }

    const totalPrice = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0)

    const order = await Order.create({
      tableId:     category === 'soboy' ? null : tableId,
      tableNumber: category === 'soboy' ? soboySuffix : tableNumber,
      category,
      waiterName:  waiterName || req.user.name,
      waiterId:    req.user._id,
      items:       enrichedItems,
      totalPrice,
      serviceFee,
      note: note || '',
    })

    // Stol bandligini yangilash
    if (tableId && category !== 'soboy') {
      const updatedTable = await Table.findByIdAndUpdate(
        tableId,
        { status: 'busy', currentOrder: order._id },
        { new: true }
      )
      req.app.get('io').emit('tableUpdated', updatedTable)
    }

    req.app.get('io').emit('newOrder', order)
    res.status(201).json(order)
  } catch (err) {
    console.error('Order xatosi:', err)
    res.status(500).json({ message: err.message })
  }
})

// ─── PUT /api/orders/:id/close ──────────────────────────────────
router.put('/:id/close', auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'closed', closedAt: new Date() },
      { new: true }
    )
    if (!order) return res.status(404).json({ message: 'Buyurtma topilmadi' })

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
router.put('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!order) return res.status(404).json({ message: 'Buyurtma topilmadi' })
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── POST /api/orders/:id/extras ────────────────────────────────
router.post('/:id/extras', auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $push: { extras: { extraFee: +req.body.extraFee || 0, comment: req.body.comment || '' } } },
      { new: true }
    )
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── PUT /api/orders/:id/extras/:extraId ────────────────────────
router.put('/:id/extras/:extraId', auth, async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, 'extras._id': req.params.extraId },
      { $set: { 'extras.$.extraFee': +req.body.extraFee || 0, 'extras.$.comment': req.body.comment || '' } },
      { new: true }
    )
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── DELETE /api/orders/:id/extras/:extraId ─────────────────────
router.delete('/:id/extras/:extraId', auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $pull: { extras: { _id: req.params.extraId } } },
      { new: true }
    )
    req.app.get('io').emit('orderUpdated', order)
    res.json(order)
  } catch (err) { res.status(500).json({ message: err.message }) }
})

// ─── DELETE /api/orders/:id ─────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', closedAt: new Date() },
      { new: true }
    )
    if (!order) return res.status(404).json({ message: 'Topilmadi' })
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

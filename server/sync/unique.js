// ── Sync: noyob maydon ziddiyatini avtomatik hal qilish (faqat cloud'da) ──
// Kassa va cloud bir-biridan bexabar bir xil login (username) yoki bir xil raqamli stol yaratsa,
// kelgan hujjatni bazaga yozib bo'lmaydi (unique index). Avval yaratilgani (cloud'dagisi) qoladi,
// kelganining noyob maydoni o'zgartiriladi va cloud nomidan yoziladi — sync orqali kassaga ham qaytadi.
// Restoran adminiga nima o'zgargani haqida xabar (SyncNotice) qoldiriladi.

const RULES = {
  users: {
    field: 'username',
    async free(coll, doc) {
      const base = String(doc.username || 'user').replace(/-\d+$/, '')
      for (let n = 2; n < 1000; n++) {
        const name = `${base}-${n}`
        if (!(await coll.findOne({ username: name }, { projection: { _id: 1 } }))) return name
      }
      return `${base}-${Date.now().toString(36)}`
    },
    text: (doc, old, now) => `«${doc.name || old}» xodimining logini ikki joyda bir xil yaratilgan edi — kassadagisining logini «${now}» ga o'zgartirildi.`,
  },
  tables: {
    field: 'number',
    async free(coll, doc) {
      const last = await coll.find({ category: doc.category }).sort({ number: -1 }).limit(1).next()
      return (last?.number || 0) + 1
    },
    text: (doc, old, now) => `${old}-stol (${doc.category}) ikki joyda yaratilgan edi — kassadagisi ${now}-stol qilib o'zgartirildi.`,
  },
}

// → yangi hujjat (noyob maydoni o'zgartirilgan) yoki null (bu ziddiyatni hal qilib bo'lmaydi)
async function resolveUnique(collName, coll, doc, err) {
  const rule = RULES[collName]
  if (!rule || err?.code !== 11000 || !(rule.field in (err.keyValue || {}))) return null
  const old = doc[rule.field]
  const now = await rule.free(coll, doc)
  return { doc: { ...doc, [rule.field]: now }, notice: rule.text(doc, old, now) }
}

module.exports = { resolveUnique }

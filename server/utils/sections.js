// ── Stol bo'limlari (zal, xona, ko'cha, 2-etaj, lux xonalar ...) ──
// Settings.tableSections: [{ key, label }]. Stol va buyurtmada key saqlanadi — nomi o'zgarsa ham
// eski buyurtmalar to'g'ri ko'rinadi. Standart uchtasi eski ma'lumotlar bilan bir xil kalitda.
const DEFAULT_SECTIONS = [
  { key: 'zal', label: 'Zal' },
  { key: 'xona', label: 'Xona' },
  { key: "ko'cha", label: "Ko'cha" },
]

const sectionsOf = s => (s?.tableSections?.length ? s.tableSections.map(({ key, label }) => ({ key, label })) : DEFAULT_SECTIONS)

function labelOf(s, key) {
  if (key === 'soboy') return 'Soboy'
  return sectionsOf(s).find(x => x.key === key)?.label || DEFAULT_SECTIONS.find(x => x.key === key)?.label || key || ''
}

module.exports = { DEFAULT_SECTIONS, sectionsOf, labelOf }

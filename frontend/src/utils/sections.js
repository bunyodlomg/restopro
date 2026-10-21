import { useSettings } from '../context/SettingsContext.jsx'

// Stol bo'limlari: zal, xona, ko'cha + restoran qo'shganlari (2-etaj, lux ...). Sozlamalardan keladi.
export const DEFAULT_SECTIONS = [
  { key: 'zal', label: 'Zal' },
  { key: 'xona', label: 'Xona' },
  { key: "ko'cha", label: "Ko'cha" },
]

export function useSections() {
  const { settings } = useSettings()
  const sections = settings.tableSections?.length ? settings.tableSections : DEFAULT_SECTIONS
  const label = key => (key === 'soboy' ? 'Soboy' : sections.find(s => s.key === key)?.label
    || DEFAULT_SECTIONS.find(s => s.key === key)?.label || key || '')
  return { sections, label }
}

// Stolning to'liq nomi: «Zal · Stol 5», «2-etaj · Stol 3», soboy — «Soboy №12».
// settings bilan (hook'siz joylar uchun: chek) yoki usePlace() orqali.
export function placeLabel(order, settings) {
  const n = order?.tableNumber ?? order?.number ?? ''
  if (order?.category === 'soboy') return `Soboy №${n}`
  const list = settings?.tableSections?.length ? settings.tableSections : DEFAULT_SECTIONS
  const sec = list.find(s => s.key === order?.category)?.label || DEFAULT_SECTIONS.find(s => s.key === order?.category)?.label || ''
  return sec ? `${sec} · Stol ${n}` : `Stol ${n}`
}

export function usePlace() {
  const { settings } = useSettings()
  return o => placeLabel(o, settings)
}

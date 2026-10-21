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

import React, { createContext, useContext, useState, useEffect } from 'react'
import API from '../api/api.js'
import { API_URL } from '../config.js'
import { BRAND } from '../brand.js'
import { loadCustomSounds } from '../utils/sound.js'
import { createSocket } from '../api/socket.js'
import { useAuth } from './AuthContext.jsx'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    brandName: BRAND.name,
    brandLogo: BRAND.logo,
    serviceFeeEnabled: false,
    serviceFeePercent: 10,
  })

  const apply = data => {
    setSettings(s => ({ ...s, ...data }))
    if (data.brandName) document.title = data.brandName
    if (data.sounds) loadCustomSounds(data.sounds, API_URL)
  }

  const refresh = async () => {
    try {
      if (localStorage.getItem('rp_token')) return apply((await API.get('/api/settings')).data)
    } catch {}
    // Tizimga kirilmagan yoki obuna bloklangan — faqat nom va logo
    try { apply((await API.get('/api/settings/public')).data) } catch {}
  }

  // Kirgan foydalanuvchi o'zgarganda (admin/ofitsant) — to'liq sozlamalar
  const { user } = useAuth()
  useEffect(() => { refresh() }, [user?._id])

  // Admin logo/nom/printerlarni o'zgartirsa — barcha ochiq ekranlar darhol yangilanadi
  useEffect(() => {
    if (!user) return
    const s = createSocket()
    s.on('settingsUpdated', refresh)
    s.on('syncApplied', ({ colls }) => { if (colls.includes('settings')) refresh() })
    s.on('connect', refresh)    // uzilish paytida o'tkazib yuborilgan o'zgarishlar uchun
    return () => s.disconnect()
  }, [user?._id])

  // Kassa / ofitsant ilovasi: admin tanlagan ikonka oyna, tray va yorliqlarga qo'llanadi
  const iconSrc = settings.appIcon === 'logo' ? settings.brandLogo : settings.appIcon
  useEffect(() => {
    const setIcon = window.rpNative?.setIcon
    if (!setIcon || settings.appIcon === undefined) return   // sozlamalar hali kelmagan
    const isImg = typeof iconSrc === 'string' && (iconSrc.startsWith('/') || iconSrc.startsWith('http'))
    const url = isImg ? new URL(iconSrc, API_URL || window.location.origin).href : ''
    setIcon(url).then(r => { if (r && !r.ok) console.warn('Ilova ikonkasi:', r.message) }).catch(() => {})
  }, [settings.appIcon, iconSrc])

  return (
    <SettingsContext.Provider value={{ settings, setSettings, refresh }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)

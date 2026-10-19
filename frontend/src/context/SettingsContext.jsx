import React, { createContext, useContext, useState, useEffect } from 'react'
import API from '../api/api.js'
import { API_URL } from '../config.js'
import { BRAND } from '../brand.js'
import { loadCustomSounds } from '../utils/sound.js'

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

  useEffect(() => { refresh() }, [])

  return (
    <SettingsContext.Provider value={{ settings, setSettings, refresh }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)

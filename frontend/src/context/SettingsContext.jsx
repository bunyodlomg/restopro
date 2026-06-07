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

  useEffect(() => {
    // Token yo'q bo'lsa settings yuklashning hojati yo'q
    if (!localStorage.getItem('rp_token')) return
    API.get('/api/settings').then(({ data }) => {
      setSettings(data)
      if (data.brandName) document.title = data.brandName
      if (data.sounds) loadCustomSounds(data.sounds, API_URL)
    }).catch(() => {})
  }, [])

  const refresh = async () => {
    try {
      const { data } = await API.get('/api/settings')
      setSettings(data)
      if (data.sounds) loadCustomSounds(data.sounds, API_URL)
    } catch {}
  }

  return (
    <SettingsContext.Provider value={{ settings, setSettings, refresh }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => useContext(SettingsContext)

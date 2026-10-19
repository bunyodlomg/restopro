import React, { createContext, useContext, useState, useEffect } from 'react'
import { applyAccent } from '../brand.js'

const ThemeContext = createContext(null)

const initialTheme = () => {
  try { return localStorage.getItem('rp_theme') || 'light' } catch { return 'light' }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)

  useEffect(() => {
    try { localStorage.setItem('rp_theme', theme) } catch {}
    document.documentElement.setAttribute('data-theme', theme)
    applyAccent()   // qorong'u/yorug'da accent matn rangi farq qiladi
  }, [theme])

  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)

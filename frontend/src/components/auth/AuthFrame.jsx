import React from 'react'
import { useSettings } from '../../context/SettingsContext.jsx'
import { BrandMark } from '../ui.jsx'

// Kirish va parol sahifalari uchun umumiy ramka: chapda qora brend paneli, o'ngda forma
export default function AuthFrame({ children }) {
  const { settings } = useSettings()
  const name = settings.brandName || 'RestoPro'
  const year = new Date().getFullYear()
  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="row" style={{ gap: 14 }}>
          <BrandMark size={52}/>
          <div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{name}</div>
            <div className="label" style={{ color: '#8A8A90' }}>Kassa tizimi</div>
          </div>
        </div>
        <div className="auth-big">Har bir buyurtma —<br/><em>aniq</em> va tez.</div>
        <div className="row mono" style={{ justifyContent: 'space-between', color: '#8A8A90', fontSize: 13 }}>
          <span>{name.toUpperCase()}</span><span>© {year}</span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card rise">
          <div className="show-mobile row" style={{ gap: 12, marginBottom: 28 }}>
            <BrandMark size={46}/><b style={{ fontSize: 20 }}>{name}</b>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

import React, { createContext, useContext, useState, useEffect } from 'react'
import API from '../api/api.js'
import { appKind, deviceId, roleAllowedHere } from '../utils/terminal.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('rp_user')
    const token  = localStorage.getItem('rp_token')
    if (stored && token) {
      try {
        const u = JSON.parse(stored)
        // Kassa'da saqlangan ofitsant / terminalda saqlangan admin sessiyasi ochilmaydi
        if (roleAllowedHere(u.role)) setUser(u)
        else logout()
      } catch {}
    }
    setLoading(false)
  }, [])

  // Server ilova bo'yicha rolni tekshiradi va ofitsantni bitta qurilmaga bog'laydi
  const client = () => ({ app: appKind() || undefined, deviceId: deviceId() })
  const login = async (username, password) => accept((await API.post('/api/auth/login', { username, password, ...client() })).data)
  const loginPin = async pin => accept((await API.post('/api/auth/pin', { pin, ...client() })).data)

  const accept = data => {
    localStorage.setItem('rp_token', data.token)
    localStorage.setItem('rp_user',  JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  const changePassword = async (oldPassword, newPassword) => {
    await API.put('/api/auth/change-password', { oldPassword, newPassword })
    const updated = { ...user, mustChangePassword: false }
    localStorage.setItem('rp_user', JSON.stringify(updated))
    setUser(updated)
    return updated
  }

  const logout = () => {
    // Ofitsant sessiyasini serverda yopish — akkaunt boshqa qurilma uchun darhol bo'shaydi
    const token = localStorage.getItem('rp_token')
    if (token) API.post('/api/auth/logout', null, { headers: { Authorization: `Bearer ${token}` }, skipAuthRedirect: true }).catch(() => {})
    localStorage.removeItem('rp_token')
    localStorage.removeItem('rp_user')
    setUser(null)
  }

  const isAdmin  = user?.role === 'admin'
  const isWaiter = user?.role === 'waiter' || user?.role === 'ofitsant'

  return (
    <AuthContext.Provider value={{ user, loading, login, loginPin, logout, changePassword, isAdmin, isWaiter }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

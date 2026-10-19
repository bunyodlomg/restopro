import React, { createContext, useContext, useState, useEffect } from 'react'
import API from '../api/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('rp_user')
    const token  = localStorage.getItem('rp_token')
    if (stored && token) {
      try { setUser(JSON.parse(stored)) } catch {}
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => accept((await API.post('/api/auth/login', { username, password })).data)
  const loginPin = async pin => accept((await API.post('/api/auth/pin', { pin })).data)

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

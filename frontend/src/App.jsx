import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth }       from './context/AuthContext.jsx'
import { SettingsProvider }            from './context/SettingsContext.jsx'
import { ThemeProvider, useTheme }     from './context/ThemeContext.jsx'
import { playSound, soundForElement }  from './utils/sound.js'
import LicenseGate                     from './components/LicenseGate.jsx'

import AdminLayout  from './layouts/AdminLayout.jsx'
import WaiterLayout from './layouts/WaiterLayout.jsx'
import Login        from './pages/Login.jsx'
import ChangePassword from './pages/ChangePassword.jsx'

import Dashboard    from './pages/admin/Dashboard.jsx'
import Orders       from './pages/admin/Orders.jsx'
import OrderHistory from './pages/admin/OrderHistory.jsx'
import Products     from './pages/admin/Products.jsx'
import Ingredients  from './pages/admin/Ingredients.jsx'
import Tables       from './pages/admin/Tables.jsx'
import Users        from './pages/admin/Users.jsx'
import Salaries     from './pages/admin/Salaries.jsx'
import Settings     from './pages/admin/Settings.jsx'

import TableSelect  from './pages/waiter/TableSelect.jsx'
import OrderCreate  from './pages/waiter/OrderCreate.jsx'
import MyOrders     from './pages/waiter/MyOrders.jsx'
import Reservations from './pages/admin/Reservations.jsx'
import QrCodes      from './pages/admin/QrCodes.jsx'
import GuestMenu    from './pages/guest/GuestMenu.jsx'
import TerminalLock from './components/TerminalLock.jsx'

function Loader() {
  return <div className="center-fill" style={{ minHeight: '100vh', background: 'var(--bg)' }}><div className="spinner"/></div>
}
function RequireAdmin({ children }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <Loader/>
  if (!user)    return <Navigate to="/login" replace/>
  if (user.mustChangePassword) return <Navigate to="/change-password" replace/>
  if (!isAdmin) return <Navigate to="/waiter" replace/>
  return children
}
function RequireWaiter({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loader/>
  if (!user)   return <Navigate to="/login" replace/>
  if (user.mustChangePassword) return <Navigate to="/change-password" replace/>
  return children
}
function RequireUser({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loader/>
  if (!user)   return <Navigate to="/login" replace/>
  return children
}
function RootRedirect() {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <Loader/>
  if (!user)   return <Navigate to="/login" replace/>
  return <Navigate to={isAdmin ? '/admin' : '/waiter'} replace/>
}

function AppRoutes() {
  const { isDark } = useTheme()

  // ── Global tugma ovozlari — admin va ofitsant tomonida ham ─────
  useEffect(() => {
    const onClick = e => {
      const el = e.target.closest('button, a[href], [role="button"]')
      if (!el) return
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return
      playSound(soundForElement(el))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return (
    <>
      <Routes>
        <Route path="/"      element={<RootRedirect/>}/>
        <Route path="/login" element={<Login/>}/>
        <Route path="/change-password" element={<RequireUser><ChangePassword/></RequireUser>}/>
        <Route path="/admin" element={<RequireAdmin><AdminLayout/></RequireAdmin>}>
          <Route index              element={<Dashboard/>}/>
          <Route path="orders"      element={<Orders/>}/>
          <Route path="history"     element={<OrderHistory/>}/>
          <Route path="products"    element={<Products/>}/>
          <Route path="ingredients" element={<Ingredients/>}/>
          <Route path="tables"      element={<Tables/>}/>
          <Route path="users"       element={<Users/>}/>
          <Route path="salaries"    element={<Salaries/>}/>
          <Route path="settings"    element={<Settings/>}/>
          <Route path="reservations" element={<Reservations/>}/>
          <Route path="tables/qr"   element={<QrCodes/>}/>
          <Route path="kassa"       element={<TableSelect/>}/>
          <Route path="kassa/order/:tableId" element={<OrderCreate/>}/>
          <Route path="kassa/soboy" element={<OrderCreate/>}/>
        </Route>
        <Route path="/waiter" element={<RequireWaiter><WaiterLayout/></RequireWaiter>}>
          <Route index                 element={<TableSelect/>}/>
          <Route path="order/:tableId" element={<OrderCreate/>}/>
          <Route path="soboy"          element={<OrderCreate/>}/>
          <Route path="my-orders"      element={<MyOrders/>}/>
        </Route>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
      <Toaster position="top-center" toastOptions={{
        duration: 3000,
        style: {
          background: isDark ? '#F4F4F2' : '#0B0B0C',
          color: isDark ? '#0B0B0C' : '#fff',
          borderRadius: '14px',
          padding: '12px 16px',
          fontFamily: 'var(--font)',
          fontSize: '15px',
          fontWeight: 600,
          boxShadow: '0 12px 40px rgba(0,0,0,.25)',
        },
        success: { iconTheme: { primary: '#22C55E', secondary: isDark ? '#F4F4F2' : '#0B0B0C' } },
        error:   { iconTheme: { primary: '#FF3B2F', secondary: isDark ? '#F4F4F2' : '#0B0B0C' } },
      }}/>
    </>
  )
}

export default function App() {
  // Mijozning QR menyusi — tizimga kirishsiz, alohida sahifa
  if (window.location.pathname.startsWith('/m/')) return (
    <ThemeProvider>
      <GuestMenu token={decodeURIComponent(window.location.pathname.slice(3).split('/')[0])}/>
      <Toaster position="top-center" toastOptions={{ style: { background: '#0B0B0C', color: '#fff', borderRadius: '14px', fontWeight: 600 } }}/>
    </ThemeProvider>
  )
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <BrowserRouter>
            <LicenseGate><TerminalLock/><AppRoutes/></LicenseGate>
          </BrowserRouter>
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

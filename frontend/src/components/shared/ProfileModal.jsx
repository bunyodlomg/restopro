import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Moon, Sun, Keyboard } from 'lucide-react'
import Modal from './Modal.jsx'
import AppUpdateCard from './AppUpdateCard.jsx'
import AppIconPicker from './AppIconPicker.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { initials, Seg } from '../ui.jsx'
import { vkbdPref, setVkbdPref } from '../VirtualKeyboard.jsx'

const APP_NAME = { kassa: 'RestoPro Kassa', terminal: 'RestoPro Ofitsant' }

// Profil: kim kirgan, rejim, parol, dastur versiyasi / yangilanish, ilova ikonkasi (admin), chiqish.
// Admin paneli (rail) va ofitsant yuqori panelidagi avatar bosilganda ochiladi.
export default function ProfileModal({ open, onClose }) {
  const { user, logout, isAdmin } = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const app = APP_NAME[window.rpNative?.app]
  const go = to => { onClose(); navigate(to) }
  const [kbd, setKbd] = useState(() => vkbdPref() ?? 'auto')

  if (!open) return null
  // body'ga — panel (rail) ichidagi overflow / qatlamlar oynani to'smasin
  return createPortal(
    <Modal open={open} onClose={onClose} title="Profil" maxWidth={620}>
      <div className="col" style={{ gap: 16, paddingBottom: 18 }}>
        <div className="row" style={{ gap: 14 }}>
          <span className="avatar" style={{ width: 64, height: 64, fontSize: 24 }}>{initials(user?.name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{user?.name}</div>
            <div className="hint">
              <span className="mono">@{user?.username}</span> · {isAdmin ? 'Administrator' : 'Ofitsant'}{app ? ` · ${app}` : ''}
            </div>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn btn-soft btn-lg" style={{ flex: 1 }} onClick={toggle}>
            {isDark ? <Sun size={20}/> : <Moon size={20}/>} {isDark ? "Yorug' rejim" : "Qorong'u rejim"}
          </button>
          <button className="btn btn-soft btn-lg" style={{ flex: 1 }} onClick={() => go('/change-password')}>
            <KeyRound size={20}/> Parolni o'zgartirish
          </button>
        </div>

        <div className="card card-pad" style={{ boxShadow: '0 0 0 1px var(--rule)' }}>
          <div className="card-head"><span className="card-title row" style={{ gap: 8 }}><Keyboard size={19}/> Ekran klaviaturasi</span><span className="label">shu qurilmada</span></div>
          <Seg value={kbd} onChange={v => { setKbd(v); setVkbdPref(v === 'auto' ? null : v) }}
            items={[{ k: 'auto', l: 'Avtomatik' }, { k: '1', l: 'Doim' }, { k: '0', l: "O'chiq" }]}/>
          <div className="hint" style={{ marginTop: 8 }}>Avtomatik — sensorli ekranli kassa va ofitsant ilovasida maydon bosilganda chiqadi.</div>
        </div>

        <AppUpdateCard style={{ boxShadow: '0 0 0 1px var(--rule)' }}/>

        {isAdmin && (
          <div className="card card-pad" style={{ boxShadow: '0 0 0 1px var(--rule)' }}>
            <div className="card-head"><span className="card-title">Ilova ikonkasi</span><span className="label">kassa va terminallar</span></div>
            <AppIconPicker/>
          </div>
        )}

        <button className="btn btn-danger btn-lg btn-block" onClick={() => { onClose(); logout(); navigate('/login') }}>
          <LogOut size={20}/> Chiqish
        </button>
      </div>
    </Modal>,
    document.body,
  )
}

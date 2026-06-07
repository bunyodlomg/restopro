import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save, Upload, Percent, Building2, Paintbrush,
  Sun, Moon, Check, Receipt, Volume2, Play,
  RotateCcw, Music
} from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { API_URL } from '../../config.js'
import PageHeader from '../../components/shared/PageHeader.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { buildReceiptHTML } from '../../utils/receipt.js'
import { isSoundEnabled, setSoundEnabled, previewSound, hasCustomSound } from '../../utils/sound.js'

const TABS = [
  { id: 'brand',   label: 'Brend',       Icon: Building2 },
  { id: 'theme',   label: "Ko'rinish",   Icon: Paintbrush },
  { id: 'sound',   label: 'Tovush',      Icon: Volume2 },
  { id: 'service', label: 'Xizmat haqi', Icon: Percent },
  { id: 'receipt', label: 'Chek',        Icon: Receipt },
]

const EMOJIS = ['🍽','🍴','🍜','🥘','🍲','🍛','🥗','🍣','🍕','🌮','🥩','🍖','🍱','🥟','☕','🏮','⭐','🌟','🎯','🔥']

const COLORS = [
  { name:'Oltin',    primary:'var(--brand)', light:'#F0A030', dark:'#B06A10' },
  { name:'Qizil',   primary:'#E53E3E', light:'#FC8181', dark:'#C53030' },
  { name:'Ko\'k',   primary:'#3182CE', light:'#63B3ED', dark:'#2C5282' },
  { name:'Yashil',  primary:'#38A169', light:'#68D391', dark:'#276749' },
  { name:'Binafsha',primary:'#805AD5', light:'#B794F4', dark:'#553C9A' },
  { name:'Moviy',   primary:'#00B5D8', light:'#76E4F7', dark:'#0987A0' },
]

const SOUND_TYPES = [
  { key: 'tick',     label: 'Bosish',        desc: 'Tugma va elementlarni bosish',  icon: '👆' },
  { key: 'nav',      label: 'Navigatsiya',   desc: "Sahifalar o'rtasida o'tish",    icon: '🧭' },
  { key: 'confirm',  label: 'Tasdiqlash',    desc: 'Amal tasdiqlanganda',           icon: '✅' },
  { key: 'success',  label: 'Muvaffaqiyat',  desc: "Muvaffaqiyatli bo'lganda",      icon: '🎉' },
  { key: 'warn',     label: 'Ogohlantirish', desc: 'Xatolik va ogohlantirish',      icon: '⚠️' },
  { key: 'newOrder', label: 'Yangi buyurtma', desc: 'Yangi buyurtma kelganda (MP3)', icon: '🔔' },
]

const SAMPLE_ORDER = {
  category: 'zal', tableNumber: 5, waiterName: 'Aziz Karimov',
  items: [
    { name: 'Osh', price: 38000, quantity: 2 },
    { name: 'Achichuq salat', price: 15000, quantity: 1 },
    { name: "Ko'k choy", price: 4000, quantity: 2 },
  ],
  extras: [], serviceFee: 9900,
}

function Label({ children }) {
  return (
    <label style={{ display:'block', fontSize:'0.72rem', fontWeight:700, color:'var(--text-3)', marginBottom:6, letterSpacing:'0.06em', textTransform:'uppercase' }}>
      {children}
    </label>
  )
}

function Toggle({ value, onChange, label, hint }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.875rem 1rem', background:'var(--elevated)', borderRadius:'var(--r-md)', border:'1px solid var(--border)' }}>
      <div>
        <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--text)', marginBottom:2 }}>{label}</p>
        {hint && <p style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>{hint}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        style={{ width:50, height:26, borderRadius:13, border:'none', cursor:'pointer', background: value ? 'var(--brand)' : 'var(--border)', position:'relative', transition:'background 0.25s', flexShrink:0 }}>
        <div style={{
          position:'absolute', top:3, transition:'left 0.25s',
          left: value ? 27 : 3,
          width:20, height:20, borderRadius:'50%', background:'#fff',
          boxShadow:'0 1px 4px rgba(0,0,0,0.3)',
        }}/>
      </button>
    </div>
  )
}

function ReceiptPreview({ brandName, brandLogo, receipt }) {
  const html = buildReceiptHTML(SAMPLE_ORDER, { brandName, brandLogo, receipt })
  const w = receipt.paperWidth === 80 ? 302 : 224
  return (
    <div style={{ background:'var(--elevated)', borderRadius:'var(--r-lg)', border:'1px solid var(--border)', padding:'1rem', display:'flex', justifyContent:'center' }}>
      <iframe title="Chek" srcDoc={html}
        style={{ width:w, height:360, border:'none', borderRadius:6, background:'#fff', boxShadow:'0 6px 20px rgba(0,0,0,0.18)' }}/>
    </div>
  )
}

export default function SettingsPage() {
  const { settings, refresh } = useSettings()
  const { theme, setTheme } = useTheme()
  const [tab, setTab] = useState('brand')
  const [saving, setSaving] = useState(false)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [activeColor, setActiveColor] = useState(null)
  const [uiSound, setUiSound] = useState(isSoundEnabled())
  const [soundUploading, setSoundUploading] = useState(null)

  const RECEIPT_DEFAULTS = {
    headerText: '', footerText: "Rahmat! Yana keling 🍽",
    showLogo: true, showWaiter: true, showDateTime: true,
    paperWidth: 58, fontSize: 12,
  }

  const [form, setForm] = useState({
    brandName: '', brandLogo: '🍽',
    serviceFeeEnabled: false, serviceFeePercent: 10,
    receipt: { ...RECEIPT_DEFAULTS },
  })
  const set  = (key, val) => setForm(f => ({ ...f, [key]: val }))
  const setR = (key, val) => setForm(f => ({ ...f, receipt: { ...f.receipt, [key]: val } }))

  useEffect(() => {
    setForm({
      brandName:         settings.brandName         || '',
      brandLogo:         settings.brandLogo         || '🍽',
      serviceFeeEnabled: settings.serviceFeeEnabled || false,
      serviceFeePercent: settings.serviceFeePercent || 10,
      receipt:           { ...RECEIPT_DEFAULTS, ...(settings.receipt || {}) },
    })
    const logo = settings.brandLogo || ''
    setLogoPreview(logo.startsWith('/') ? `${API_URL}${logo}` : logo)
  }, [settings])

  const handleLogoFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const applyColor = (c) => {
    setActiveColor(c.name)
    const r = document.documentElement.style
    r.setProperty('--brand', c.primary)
    r.setProperty('--brand-dk', c.dark)
    r.setProperty('--brand-lt', c.light)
    r.setProperty('--brand-glow', `${c.primary}28`)
    localStorage.setItem('rp_brand_color', JSON.stringify(c))
    toast.success(`${c.name} rangi qo'llanildi`)
  }

  const save = async () => {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('brandName', form.brandName)
      fd.append('serviceFeeEnabled', form.serviceFeeEnabled)
      fd.append('serviceFeePercent', form.serviceFeePercent)
      fd.append('receipt', JSON.stringify(form.receipt))
      if (logoFile) {
        fd.append('logo', logoFile)
      } else if (form.brandLogo && !form.brandLogo.startsWith('/')) {
        fd.append('brandLogo', form.brandLogo)
      }
      await API.put('/api/settings', fd)
      await refresh()
      toast.success('Sozlamalar saqlandi')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Xatolik')
    } finally { setSaving(false) }
  }

  const uploadSound = async (type, file) => {
    setSoundUploading(type)
    try {
      const fd = new FormData()
      fd.append('sound', file)
      await API.put(`/api/settings/sound/${type}`, fd)
      await refresh()
      toast.success('Tovush yuklandi')
    } catch { toast.error('Yuklashda xatolik') }
    finally { setSoundUploading(null) }
  }

  const resetSound = async (type) => {
    setSoundUploading(type)
    try {
      await API.delete(`/api/settings/sound/${type}`)
      await refresh()
      toast.success('Standart tovushga qaytarildi')
    } catch { toast.error('Xatolik') }
    finally { setSoundUploading(null) }
  }

  useEffect(() => {
    const saved = localStorage.getItem('rp_brand_color')
    if (saved) { try { applyColor(JSON.parse(saved)) } catch {} }
  }, [])

  const previewLogo = logoFile ? '/uploaded' : form.brandLogo

  /* ─── Tab contents ─── */

  const BrandTab = () => (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.3}}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r-xl)', padding:'1.5rem' }}>
        <div style={{ marginBottom:'1.25rem' }}>
          <Label>Oshxona nomi</Label>
          <input value={form.brandName} onChange={e => set('brandName', e.target.value)}
            placeholder="Masalan: Anhor Bo'yi" className="rp-input"/>
        </div>

        <Label>Logo (emoji yoki rasm)</Label>
        <div style={{ display:'flex', gap:'1rem', alignItems:'flex-start', marginBottom:'0.5rem' }}>
          <div style={{
            width:64, height:64, borderRadius:16, flexShrink:0,
            background:'linear-gradient(135deg,rgba(var(--brand-rgb),0.15),rgba(240,160,48,0.08))',
            border:'2px solid rgba(var(--brand-rgb),0.25)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'2rem', overflow:'hidden',
          }}>
            {logoFile
              ? <img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              : <span>{form.brandLogo || '🍽'}</span>
            }
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:'0.625rem' }}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => { set('brandLogo', e); setLogoPreview(e); setLogoFile(null) }}
                  style={{
                    width:36, height:36, borderRadius:9, fontSize:'1.1rem',
                    background: form.brandLogo === e ? 'var(--brand-glow)' : 'var(--elevated)',
                    border: `1.5px solid ${form.brandLogo === e ? 'var(--brand)' : 'var(--border)'}`,
                    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'all 0.15s',
                  }}>{e}</button>
              ))}
            </div>
            <label style={{ display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer', padding:'0.4rem 0.75rem', borderRadius:8, background:'var(--elevated)', border:'1px solid var(--border)', color:'var(--text-3)', fontSize:'0.78rem' }}>
              <Upload size={12}/> Rasm yuklash
              <input type="file" accept="image/*" onChange={handleLogoFile} style={{ display:'none' }}/>
            </label>
          </div>
        </div>
      </div>
    </motion.div>
  )

  const ThemeTab = () => (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.3}}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r-xl)', padding:'1.5rem' }}>
        <Label>Interfeys rejimi</Label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'1.25rem' }}>
          {[
            { id:'dark', label:"Qorong'u", desc:'Tungi rejim', Icon:Moon },
            { id:'light', label:'Yorug\'', desc:'Kunduzgi rejim', Icon:Sun },
          ].map(({ id, label, desc, Icon }) => (
            <button key={id} onClick={() => setTheme(id)}
              style={{
                padding:'1rem', borderRadius:'var(--r-lg)', cursor:'pointer',
                background: theme === id ? 'var(--brand-glow)' : 'var(--elevated)',
                border: `2px solid ${theme === id ? 'var(--brand)' : 'var(--border)'}`,
                display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                transition:'all 0.2s',
              }}>
              <Icon size={22} color={theme === id ? 'var(--brand-lt)' : 'var(--text-3)'}/>
              <div>
                <div style={{ fontWeight:700, fontSize:'0.85rem', color: theme === id ? 'var(--brand-lt)' : 'var(--text)' }}>{label}</div>
                <div style={{ fontSize:'0.72rem', color:'var(--text-3)' }}>{desc}</div>
              </div>
              {theme === id && <Check size={14} color="var(--brand)"/>}
            </button>
          ))}
        </div>

        <Label>Asosiy rang</Label>
        <div style={{ display:'flex', gap:'0.625rem', flexWrap:'wrap' }}>
          {COLORS.map(c => (
            <button key={c.name} onClick={() => applyColor(c)} title={c.name}
              style={{
                width:40, height:40, borderRadius:12,
                border:`2px solid ${activeColor === c.name ? '#fff' : 'transparent'}`,
                background:`linear-gradient(135deg,${c.primary},${c.light})`,
                cursor:'pointer', transition:'all 0.15s', position:'relative',
                boxShadow: activeColor === c.name ? `0 0 0 3px ${c.primary}` : 'none',
              }}>
              {activeColor === c.name && <Check size={14} color="#fff" style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)' }}/>}
            </button>
          ))}
        </div>
        <p style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:'0.5rem' }}>
          * Rang faqat shu brauzer seansi uchun saqlanadi
        </p>
      </div>
    </motion.div>
  )

  const SoundTab = () => (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.3}}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r-xl)', padding:'1.5rem', marginBottom:'1rem' }}>
        <Toggle
          value={uiSound}
          onChange={v => { setUiSound(v); setSoundEnabled(v) }}
          label="UI tovush effektlari"
          hint="Tugmalar, navigatsiya va amallar uchun tovush"
        />
      </div>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r-xl)', padding:'1.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1.25rem' }}>
          <Music size={16} style={{ color:'var(--brand)' }}/>
          <h3 style={{ fontFamily:'Sora,sans-serif', fontWeight:700, fontSize:'0.95rem', color:'var(--text)' }}>Maxsus tovushlar</h3>
        </div>
        <p style={{ fontSize:'0.78rem', color:'var(--text-3)', marginBottom:'1rem' }}>
          Har bir tovush turini o'zingiz xohlagan MP3/WAV fayl bilan almashtirishingiz mumkin
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          {SOUND_TYPES.map(({ key, label, desc, icon }) => {
            const isCustom = !!settings.sounds?.[key]
            const isLoading = soundUploading === key
            return (
              <motion.div key={key}
                initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}}
                transition={{duration:0.25}}
                style={{
                  display:'flex', alignItems:'center', gap:'0.75rem',
                  padding:'0.85rem 1rem', background:'var(--elevated)',
                  borderRadius:'var(--r-md)', border:'1px solid var(--border)',
                  transition:'border-color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor='rgba(var(--brand-rgb),0.25)'}
                onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
              >
                <span style={{ fontSize:'1.25rem', width:32, textAlign:'center' }}>{icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text)' }}>{label}</span>
                    {isCustom && (
                      <span style={{ fontSize:'0.62rem', fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(var(--brand-rgb),0.12)', color:'var(--brand)' }}>MAXSUS</span>
                    )}
                  </div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-3)' }}>{desc}</div>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  <button onClick={() => previewSound(key)} title="Tinglash"
                    style={{ width:34, height:34, borderRadius:9, background:'rgba(var(--brand-rgb),0.1)', border:'none', cursor:'pointer', color:'var(--brand)', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(var(--brand-rgb),0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(var(--brand-rgb),0.1)'}>
                    <Play size={14}/>
                  </button>

                  <label title="Yuklash" style={{ width:34, height:34, borderRadius:9, background:'rgba(34,197,94,0.1)', border:'none', cursor: isLoading ? 'wait' : 'pointer', color:'#22C55E', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background='rgba(34,197,94,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background='rgba(34,197,94,0.1)'}>
                    {isLoading
                      ? <div className="spinner-sm" style={{ borderColor:'rgba(34,197,94,0.3)', borderTopColor:'#22C55E' }}/>
                      : <Upload size={14}/>}
                    <input type="file" accept="audio/*" style={{ display:'none' }}
                      onChange={e => { if (e.target.files[0]) uploadSound(key, e.target.files[0]); e.target.value='' }}
                      disabled={isLoading}/>
                  </label>

                  {isCustom && (
                    <button onClick={() => resetSound(key)} title="Standartga qaytarish"
                      style={{ width:34, height:34, borderRadius:9, background:'rgba(239,68,68,0.08)', border:'none', cursor:'pointer', color:'#EF4444', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(239,68,68,0.18)'}
                      onMouseLeave={e => e.currentTarget.style.background='rgba(239,68,68,0.08)'}>
                      <RotateCcw size={13}/>
                    </button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )

  const ServiceTab = () => (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.3}}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r-xl)', padding:'1.5rem' }}>
        <Toggle
          value={form.serviceFeeEnabled}
          onChange={v => set('serviceFeeEnabled', v)}
          label="Xizmat haqi yoqish"
          hint="Soboy buyurtmalarida avtomatik o'chiriladi"
        />
        {form.serviceFeeEnabled && (
          <div className="animate-slide-up" style={{ marginTop:'1rem' }}>
            <Label>Foiz (%)</Label>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
              <input type="number" min="1" max="50"
                value={form.serviceFeePercent}
                onChange={e => set('serviceFeePercent', +e.target.value)}
                className="rp-input" style={{ width:100 }}/>
              <span style={{ fontSize:'0.875rem', color:'var(--text-3)' }}>% qo'shimcha hisob</span>
            </div>
            <div style={{ marginTop:'0.75rem', padding:'0.75rem 1rem', background:'var(--brand-glow)', border:'1px solid rgba(var(--brand-rgb),0.2)', borderRadius:'var(--r-md)' }}>
              <p style={{ fontSize:'0.8rem', color:'var(--brand-lt)', fontWeight:500 }}>
                Misol: 100 000 so'mlik buyurtmaga {form.serviceFeePercent}% = {Math.round(100000 * form.serviceFeePercent / 100).toLocaleString()} so'm xizmat haqi
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )

  const ReceiptTab = () => (
    <motion.div initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.3}}>
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--r-xl)', padding:'1.5rem' }}>
        <div style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 320px', minWidth:0 }}>
            <div style={{ marginBottom:'1rem' }}>
              <Label>Sarlavha qatori (manzil / telefon)</Label>
              <input value={form.receipt.headerText}
                onChange={e => setR('headerText', e.target.value)}
                placeholder="Masalan: Chilonzor 12, +998 90 123 45 67"
                maxLength={120} className="rp-input"/>
            </div>
            <div style={{ marginBottom:'1rem' }}>
              <Label>Pastki matn (footer)</Label>
              <input value={form.receipt.footerText}
                onChange={e => setR('footerText', e.target.value)}
                placeholder="Masalan: Rahmat! Yana keling" maxLength={120} className="rp-input"/>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:'1rem' }}>
              <Toggle value={form.receipt.showLogo} onChange={v => setR('showLogo', v)} label="Logo (emoji)" hint="Chek tepasida ko'rsatish"/>
              <Toggle value={form.receipt.showWaiter} onChange={v => setR('showWaiter', v)} label="Ofitsant ismi"/>
              <Toggle value={form.receipt.showDateTime} onChange={v => setR('showDateTime', v)} label="Sana va vaqt"/>
            </div>
            <div style={{ marginBottom:'1rem' }}>
              <Label>Qog'oz kengligi</Label>
              <div style={{ display:'flex', gap:8 }}>
                {[58, 80].map(pw => (
                  <button key={pw} onClick={() => setR('paperWidth', pw)}
                    style={{
                      flex:1, padding:'0.6rem', borderRadius:'var(--r-md)', cursor:'pointer',
                      fontFamily:'Sora,sans-serif', fontWeight:700, fontSize:'0.85rem',
                      background: form.receipt.paperWidth === pw ? 'var(--brand-glow)' : 'var(--elevated)',
                      border: `2px solid ${form.receipt.paperWidth === pw ? 'var(--brand)' : 'var(--border)'}`,
                      color: form.receipt.paperWidth === pw ? 'var(--brand-lt)' : 'var(--text-2)',
                      transition:'all 0.15s',
                    }}>{pw} mm</button>
                ))}
              </div>
            </div>
            <div>
              <Label>Shrift o'lchami</Label>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {[['−', -1], ['+', 1]].map(([sym, d], idx) => {
                  const btn = (
                    <button key={sym}
                      onClick={() => setR('fontSize', Math.min(20, Math.max(8, form.receipt.fontSize + d)))}
                      style={{
                        width:38, height:38, borderRadius:'var(--r-md)', cursor:'pointer',
                        background:'var(--elevated)', border:'1px solid var(--border)',
                        color:'var(--text)', fontSize:'1.1rem', fontWeight:700,
                        display:'flex', alignItems:'center', justifyContent:'center',
                      }}>{sym}</button>
                  )
                  if (idx === 0) return btn
                  return (
                    <React.Fragment key="grp">
                      <span style={{ minWidth:64, textAlign:'center', fontFamily:'Sora,sans-serif', fontWeight:700, fontSize:'0.95rem', color:'var(--text)' }}>
                        {form.receipt.fontSize} px
                      </span>
                      {btn}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ flex:'0 0 auto' }}>
            <Label>Jonli ko'rinish</Label>
            <ReceiptPreview brandName={form.brandName} brandLogo={previewLogo} receipt={form.receipt}/>
          </div>
        </div>
        <p style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:'1rem' }}>
          * O'zgarishlar "Saqlash" tugmasidan keyin chop etiladigan cheklarga qo'llaniladi
        </p>
      </div>
    </motion.div>
  )

  const tabContent = { brand: BrandTab, theme: ThemeTab, sound: SoundTab, service: ServiceTab, receipt: ReceiptTab }
  const ActiveTab = tabContent[tab]

  return (
    <div className="page-enter" style={{ minHeight:'100vh', background:'var(--bg)', padding:'2rem' }}>
      <PageHeader
        title="Sozlamalar"
        subtitle="Tizim ko'rinishi va sozlamalari"
        action={
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner-sm"/> Saqlanmoqda...</> : <><Save size={14}/> Saqlash</>}
          </button>
        }
      />

      {/* Tab bar */}
      <div style={{
        display:'flex', gap:'0.35rem', marginBottom:'1.5rem',
        overflowX:'auto', paddingBottom:4,
      }} className="no-scrollbar">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{
                display:'flex', alignItems:'center', gap:'0.45rem',
                padding:'0.65rem 1.15rem', borderRadius:12,
                border: `1.5px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                background: active ? 'var(--brand-glow)' : 'var(--card)',
                color: active ? 'var(--brand)' : 'var(--text-2)',
                fontWeight: active ? 700 : 500,
                fontSize:'0.88rem', fontFamily:'DM Sans,sans-serif',
                cursor:'pointer', whiteSpace:'nowrap',
                transition:'all 0.2s', flexShrink:0,
                boxShadow: active ? '0 2px 8px rgba(var(--brand-rgb),0.15)' : 'none',
              }}>
              <Icon size={16}/> {label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900 }}>
        <AnimatePresence mode="wait">
          <ActiveTab key={tab}/>
        </AnimatePresence>
      </div>
    </div>
  )
}

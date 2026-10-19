import React, { useState, useEffect } from 'react'
import {
  Building2, Paintbrush, Volume2, Percent, Receipt, Upload, Trash2, Play, RotateCcw,
  Sun, Moon, Check, Minus, Plus, MousePointerClick, Navigation, CircleCheck, PartyPopper,
  TriangleAlert, BellRing, QrCode, Wifi, X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { ACCENTS, getAccentId, applyAccent } from '../../brand.js'
import { buildReceiptHTML } from '../../utils/receipt.js'
import { isSoundEnabled, setSoundEnabled, previewSound } from '../../utils/sound.js'
import { PageHead, Field, Switch, Seg, fileUrl } from '../../components/ui.jsx'

const TABS = [
  { k: 'brand',   l: 'Brend',       icon: Building2 },
  { k: 'theme',   l: "Ko'rinish",   icon: Paintbrush },
  { k: 'sound',   l: 'Tovush',      icon: Volume2 },
  { k: 'service', l: 'Xizmat haqi', icon: Percent },
  { k: 'receipt', l: 'Chek',        icon: Receipt },
  { k: 'qr',      l: 'QR menyu',    icon: QrCode },
]

const SOUND_TYPES = [
  { key: 'tick',     label: 'Bosish',         desc: 'Tugma va elementlarni bosish',   Icon: MousePointerClick },
  { key: 'nav',      label: 'Navigatsiya',    desc: "Sahifalar o'rtasida o'tish",     Icon: Navigation },
  { key: 'confirm',  label: 'Tasdiqlash',     desc: 'Amal tasdiqlanganda',            Icon: CircleCheck },
  { key: 'success',  label: 'Muvaffaqiyat',   desc: "Muvaffaqiyatli bo'lganda",       Icon: PartyPopper },
  { key: 'warn',     label: 'Ogohlantirish',  desc: 'Xatolik va ogohlantirish',       Icon: TriangleAlert },
  { key: 'newOrder', label: 'Yangi buyurtma', desc: 'Yangi buyurtma kelganda (MP3)',  Icon: BellRing },
]

const RECEIPT_DEFAULTS = {
  headerText: '', footerText: 'Rahmat! Yana keling',
  showLogo: true, showWaiter: true, showDateTime: true,
  paperWidth: 58, fontSize: 12,
}

const SAMPLE_ORDER = {
  category: 'zal', tableNumber: 5, waiterName: 'Aziz Karimov',
  items: [
    { name: 'Osh', price: 38000, quantity: 2 },
    { name: 'Achichuq salat', price: 15000, quantity: 1 },
    { name: "Ko'k choy", price: 4000, quantity: 2 },
  ],
  extras: [], serviceFee: 9900,
}

const isImg = s => !!s && (s.startsWith('/') || s.startsWith('http') || s.startsWith('blob:'))

export default function SettingsPage() {
  const { settings, refresh } = useSettings()
  const { theme, setTheme } = useTheme()
  const [tab, setTab] = useState('brand')
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [accent, setAccent] = useState(getAccentId())
  const [uiSound, setUiSound] = useState(isSoundEnabled())
  const [soundBusy, setSoundBusy] = useState(null)
  const [form, setForm] = useState({
    brandName: '', brandLogo: '', serviceFeeEnabled: false, serviceFeePercent: 10, receipt: { ...RECEIPT_DEFAULTS },
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setR = (k, v) => setForm(f => ({ ...f, receipt: { ...f.receipt, [k]: v } }))

  useEffect(() => {
    // Eski versiyadan qolgan emoji logolar endi ishlatilmaydi
    const logo = isImg(settings.brandLogo) ? settings.brandLogo : ''
    setForm({
      brandName: settings.brandName || '',
      brandLogo: logo,
      serviceFeeEnabled: !!settings.serviceFeeEnabled,
      serviceFeePercent: settings.serviceFeePercent ?? 10,
      receipt: { ...RECEIPT_DEFAULTS, ...(settings.receipt || {}) },
    })
    setLogoFile(null)
    setLogoPreview(logo ? fileUrl(logo) : '')
  }, [settings])

  const pickLogo = e => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast.error('Rasm 2 MB dan kichik bo\'lsin')
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }
  const removeLogo = () => { setLogoFile(null); setLogoPreview(''); set('brandLogo', '') }

  const chooseAccent = id => { setAccent(id); applyAccent(id) }

  const save = async () => {
    if (!form.brandName.trim()) return toast.error('Restoran nomini kiriting')
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('brandName', form.brandName.trim())
      fd.append('serviceFeeEnabled', form.serviceFeeEnabled)
      fd.append('serviceFeePercent', form.serviceFeePercent)
      fd.append('receipt', JSON.stringify(form.receipt))
      if (logoFile) fd.append('logo', logoFile)
      else fd.append('brandLogo', form.brandLogo)
      await API.put('/api/settings', fd)
      await refresh()
      toast.success('Sozlamalar saqlandi')
    } catch (err) { toast.error(err.response?.data?.message || 'Saqlab bo\'lmadi') }
    finally { setSaving(false) }
  }

  const uploadSound = async (type, file) => {
    setSoundBusy(type)
    try {
      const fd = new FormData()
      fd.append('sound', file)
      await API.put(`/api/settings/sound/${type}`, fd)
      await refresh()
      toast.success('Tovush yuklandi')
    } catch (err) { toast.error(err.response?.data?.message || 'Yuklab bo\'lmadi') }
    finally { setSoundBusy(null) }
  }
  const resetSound = async type => {
    setSoundBusy(type)
    try {
      await API.delete(`/api/settings/sound/${type}`)
      await refresh()
      toast.success('Standart tovushga qaytarildi')
    } catch { toast.error('Xatolik') }
    finally { setSoundBusy(null) }
  }

  // QR menyu sozlamalari darhol saqlanadi
  const saveOne = async (k, v) => {
    const fd = new FormData(); fd.append(k, v)
    try { await API.put('/api/settings', fd); await refresh(); return true }
    catch (err) { toast.error(err.response?.data?.message || 'Saqlab bo\'lmadi'); return false }
  }
  const [newIp, setNewIp] = useState('')
  const ips = settings.wifiIps || []
  const addIp = async ip => {
    ip = String(ip || '').trim()
    if (!ip) return
    if (await saveOne('wifiIps', JSON.stringify([...ips, ip]))) { setNewIp(''); toast.success("IP qo'shildi") }
  }
  const addMyIp = async () => {
    try { const { data } = await API.get('/api/settings/my-ip'); await addIp(data.ip) }
    catch { toast.error('IP aniqlanmadi') }
  }

  const name = form.brandName || 'RestoPro'
  const monogram = name.replace(/[^A-Za-z]/g, '')[0]?.toUpperCase() || 'R'
  const r = form.receipt
  const savesToServer = ['brand', 'service', 'receipt'].includes(tab)

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <PageHead title="Sozlamalar" sub="Restoran ma'lumotlari, ko'rinish va chek"
        actions={savesToServer && <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>
          {saving ? <><span className="spinner-sm"/> Saqlanmoqda</> : <><Check size={20}/> Saqlash</>}
        </button>}/>

      <Seg value={tab} onChange={setTab} items={TABS} style={{ marginBottom: 18 }}/>

      {tab === 'brand' && (
        <div className="card card-pad col" style={{ gap: 22, maxWidth: 720 }}>
          <Field label="Restoran nomi" required>
            <input className="input" value={form.brandName} onChange={e => set('brandName', e.target.value)} maxLength={40} placeholder="Masalan: Navro'z choyxonasi"/>
          </Field>
          <div>
            <div className="label" style={{ marginBottom: 10 }}>Logo</div>
            <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
              <span className="logo-mark" style={{ width: 96, height: 96, borderRadius: 26, fontSize: 44 }}>
                {logoPreview ? <img src={logoPreview} alt=""/> : monogram}
              </span>
              <div className="col" style={{ gap: 10 }}>
                <div className="row" style={{ gap: 10 }}>
                  <label className="btn btn-dark btn-lg">
                    <Upload size={20}/> Rasm yuklash
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} hidden/>
                  </label>
                  {logoPreview && <button className="btn btn-ghost btn-lg" onClick={removeLogo}><Trash2 size={20}/> O'chirish</button>}
                </div>
                <span className="hint">PNG, JPG yoki WEBP, kvadrat, 2 MB gacha. Logo bo'lmasa nomning bosh harfi ko'rsatiladi.</span>
              </div>
            </div>
          </div>
          <div style={{ background: 'var(--bar)', color: '#fff', borderRadius: 18, padding: '14px 18px' }} className="row">
            <span className="logo-mark" style={{ width: 42, height: 42, borderRadius: 12, fontSize: 19 }}>
              {logoPreview ? <img src={logoPreview} alt=""/> : monogram}
            </span>
            <span style={{ marginLeft: 12 }}><b style={{ display: 'block' }}>{name}</b><span className="label" style={{ color: '#8A8A90' }}>Panelda shunday ko'rinadi</span></span>
          </div>
        </div>
      )}

      {tab === 'theme' && (
        <div className="col" style={{ gap: 14, maxWidth: 720 }}>
          <div className="card card-pad">
            <div className="card-head"><span className="card-title">Rejim</span><span className="label">shu qurilma uchun</span></div>
            <div className="row" style={{ gap: 12 }}>
              {[['light', "Yorug'", Sun], ['dark', "Qorong'u", Moon]].map(([k, l, Icon]) => (
                <button key={k} onClick={() => setTheme(k)} className="card card-pad col"
                  style={{ flex: 1, alignItems: 'flex-start', gap: 12, boxShadow: theme === k ? '0 0 0 3px var(--accent)' : '0 0 0 1px var(--rule)' }}>
                  <div style={{ width: '100%', height: 70, borderRadius: 12, background: k === 'dark' ? '#0B0B0C' : '#F2F2EF', boxShadow: 'inset 0 0 0 1px var(--rule)', display: 'flex', gap: 6, padding: 10 }}>
                    <span style={{ width: 22, borderRadius: 6, background: k === 'dark' ? '#1C1C1F' : '#0B0B0C' }}/>
                    <span style={{ flex: 1, borderRadius: 6, background: k === 'dark' ? '#18181B' : '#fff' }}/>
                    <span style={{ width: 34, borderRadius: 6, background: 'var(--accent)' }}/>
                  </div>
                  <span className="row" style={{ gap: 8, fontWeight: 600 }}><Icon size={19}/>{l}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="card card-pad">
            <div className="card-head"><span className="card-title">Asosiy rang</span><span className="label">tugmalar va belgilar</span></div>
            <div className="row wrap" style={{ gap: 12 }}>
              {ACCENTS.map(a => (
                <button key={a.id} onClick={() => chooseAccent(a.id)} className="btn btn-lg"
                  style={{ background: 'var(--panel)', boxShadow: accent === a.id ? `0 0 0 3px ${a.c}` : '0 0 0 1px var(--rule)' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 8, background: a.c, display: 'grid', placeItems: 'center', color: '#fff' }}>
                    {accent === a.id && <Check size={16} strokeWidth={3}/>}
                  </span>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'sound' && (
        <div className="card card-pad" style={{ maxWidth: 820 }}>
          <Switch checked={uiSound} onChange={v => { setUiSound(v); setSoundEnabled(v) }}
            label="Interfeys tovushlari" hint="Tugma bosilganda qisqa ovoz (shu qurilma uchun)"/>
          <div className="lst" style={{ marginTop: 6 }}>
            {SOUND_TYPES.map(({ key, label, desc, Icon }) => {
              const custom = !!settings.sounds?.[key]
              const busy = soundBusy === key
              return (
                <div key={key} className="lst-row" style={{ padding: '12px 0' }}>
                  <span className="lst-th"><Icon size={20}/></span>
                  <span className="lst-name">
                    <span className="row" style={{ gap: 8 }}>{label}{custom && <span className="tag tag-soft">Maxsus</span>}</span>
                    <small style={{ fontFamily: 'var(--font)' }}>{desc}</small>
                  </span>
                  <button className="btn btn-soft btn-icon" title="Tinglash" onClick={() => previewSound(key)}><Play size={19}/></button>
                  <label className="btn btn-soft btn-icon" title="Yuklash" style={{ cursor: busy ? 'wait' : 'pointer' }}>
                    {busy ? <span className="spinner-sm"/> : <Upload size={19}/>}
                    <input type="file" accept="audio/*" hidden disabled={busy}
                      onChange={e => { if (e.target.files[0]) uploadSound(key, e.target.files[0]); e.target.value = '' }}/>
                  </label>
                  {custom
                    ? <button className="btn btn-ghost btn-icon" title="Standartga qaytarish" onClick={() => resetSound(key)} disabled={busy}><RotateCcw size={19}/></button>
                    : <span style={{ width: 48 }}/>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'service' && (
        <div className="card card-pad" style={{ maxWidth: 720 }}>
          <Switch checked={form.serviceFeeEnabled} onChange={v => set('serviceFeeEnabled', v)}
            label="Xizmat haqi" hint="Zal, xona va ko'cha buyurtmalariga qo'shiladi. Soboyga qo'shilmaydi."/>
          <div style={{ opacity: form.serviceFeeEnabled ? 1 : .4, pointerEvents: form.serviceFeeEnabled ? 'auto' : 'none', paddingTop: 18 }}>
            <div className="label" style={{ marginBottom: 10 }}>Foiz</div>
            <div className="row wrap" style={{ gap: 10 }}>
              {[5, 10, 12, 15, 20].map(p => (
                <button key={p} className={`btn btn-lg mono ${Number(form.serviceFeePercent) === p ? 'btn-dark' : 'btn-soft'}`} onClick={() => set('serviceFeePercent', p)}>{p}%</button>
              ))}
              <div className="input-icon" style={{ width: 140 }}>
                <Percent size={18}/>
                <input className="input mono" type="number" min={0} max={100} value={form.serviceFeePercent}
                  onChange={e => set('serviceFeePercent', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}/>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'qr' && (
        <div className="col" style={{ gap: 14, maxWidth: 820 }}>
          <div className="card card-pad">
            <Switch checked={!!settings.qrMenuEnabled} onChange={v => saveOne('qrMenuEnabled', String(v))}
              label="Mijoz QR orqali buyurtma bera oladi" hint="Stoldagi QR kod → menyu va narxlar → buyurtma. Ofitsant yoki admin tasdiqlagach oshxonaga ketadi."/>
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <Link to="/admin/tables/qr" className="btn btn-dark btn-lg"><QrCode size={20}/> QR kodlarni chop etish</Link>
            </div>
          </div>
          <div className="card card-pad">
            <div className="card-head"><span className="card-title row" style={{ gap: 8 }}><Wifi size={19}/> Restoran Wi-Fi manzillari</span><span className="label">faqat cloud server uchun</span></div>
            <p className="muted" style={{ margin: '0 0 14px', fontSize: 14.5 }}>
              Kassa kompyuterida ishlaganda restoran Wi-Fi'i avtomatik taniladi — bu yerga hech narsa yozish shart emas.
              Agar mijozlar cloud manzil orqali kirsa, restoran Wi-Fi'ining tashqi IP manzilini qo'shing: restoranda,
              Wi-Fi'ga ulangan holda «Hozirgi IP ni qo'shish» tugmasini bosing.
            </p>
            {ips.length > 0 && (
              <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
                {ips.map(ip => (
                  <span key={ip} className="tag mono" style={{ fontSize: 13, padding: '6px 6px 6px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {ip}
                    <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 26, minHeight: 26 }} aria-label="O'chirish"
                      onClick={() => saveOne('wifiIps', JSON.stringify(ips.filter(x => x !== ip)))}><X size={14}/></button>
                  </span>
                ))}
              </div>
            )}
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-lg" onClick={addMyIp}><Wifi size={19}/> Hozirgi IP ni qo'shish</button>
              <input className="input mono" style={{ width: 200 }} value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="84.54.12.3"/>
              <button className="btn btn-soft btn-lg" onClick={() => addIp(newIp)} disabled={!newIp.trim()}>Qo'shish</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'receipt' && (
        <div className="dash" style={{ marginTop: 0, gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,1fr)' }}>
          <div className="card card-pad col" style={{ gap: 16 }}>
            <Field label="Yuqori matn" hint="Manzil, telefon yoki shior">
              <input className="input" value={r.headerText} onChange={e => setR('headerText', e.target.value)} maxLength={120}/>
            </Field>
            <Field label="Pastki matn">
              <input className="input" value={r.footerText} onChange={e => setR('footerText', e.target.value)} maxLength={120}/>
            </Field>
            <div>
              <Switch checked={r.showLogo} onChange={v => setR('showLogo', v)} label="Logo va nom" hint="Chek tepasida"/>
              <Switch checked={r.showWaiter} onChange={v => setR('showWaiter', v)} label="Ofitsant ismi"/>
              <Switch checked={r.showDateTime} onChange={v => setR('showDateTime', v)} label="Sana va vaqt"/>
            </div>
            <div className="row wrap" style={{ gap: 24 }}>
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Qog'oz eni</div>
                <Seg value={r.paperWidth} onChange={v => setR('paperWidth', v)} items={[{ k: 58, l: '58 mm' }, { k: 80, l: '80 mm' }]}/>
              </div>
              <div>
                <div className="label" style={{ marginBottom: 8 }}>Shrift o'lchami</div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-soft btn-icon" onClick={() => setR('fontSize', Math.max(8, r.fontSize - 1))}><Minus size={18}/></button>
                  <span className="mono" style={{ minWidth: 54, textAlign: 'center', fontSize: 17 }}>{r.fontSize} px</span>
                  <button className="btn btn-soft btn-icon" onClick={() => setR('fontSize', Math.min(20, r.fontSize + 1))}><Plus size={18}/></button>
                </div>
              </div>
            </div>
          </div>
          <div className="card card-pad" style={{ background: 'var(--thumb)', display: 'flex', justifyContent: 'center' }}>
            <iframe title="Chek namunasi"
              srcDoc={buildReceiptHTML(SAMPLE_ORDER, { brandName: name, brandLogo: logoFile ? '' : form.brandLogo, receipt: r })}
              style={{ width: r.paperWidth === 80 ? 302 : 224, height: 440, border: 0, borderRadius: 6, background: '#fff', boxShadow: 'var(--shadow-2)' }}/>
          </div>
        </div>
      )}
    </div>
  )
}

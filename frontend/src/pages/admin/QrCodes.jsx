import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, Wifi, QrCode, Download, Archive } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useSections } from '../../utils/sections.js'
import { PageHead, Loading, Empty, Switch, Seg, Field, fileUrl } from '../../components/ui.jsx'
import { drawQrCard, loadImage, canvasBlob, downloadBlob, makeZip, QR_THEMES } from '../../utils/qrCard.js'

const DEFAULT_TITLE = 'Menyu va buyurtma'
const DEFAULT_SUB = "Kamerani QR kodga qarating · Restoran Wi-Fi'iga ulaning"
const fileName = (label, t) => `QR-${label}-${String(t.number).padStart(2, '0')}.png`.replace(/[\\/:*?"<>|\s]+/g, '-')

export default function QrCodes() {
  const { settings, refresh } = useSettings()
  const { label: sectionLabel } = useSections()
  const [data, setData] = useState(null)
  const [base, setBase] = useState('')
  const [cat, setCat] = useState('all')
  const [design, setDesign] = useState(null)
  const [images, setImages] = useState({})   // stol id → rasm (dataURL)
  const [busy, setBusy] = useState(false)
  const logoRef = useRef(null)

  const load = () => API.get('/api/tables/qr').then(r => {
    setData(r.data)
    setBase(b => b || settings.qrBaseUrl || r.data.urls[0] || (/localhost|127\.0\.0\.1/.test(window.location.origin) ? '' : window.location.origin))
  }).catch(() => toast.error("Yuklab bo'lmadi"))
  useEffect(() => { load() }, [])
  useEffect(() => { if (!design && settings.qrDesign) setDesign({ theme: 'light', title: '', subtitle: '', ...settings.qrDesign }) }, [settings.qrDesign])

  const saveSetting = async (k, v) => {
    const fd = new FormData(); fd.append(k, v)
    try { await API.put('/api/settings', fd); await refresh(); return true }
    catch (err) { toast.error(err.response?.data?.message || 'Saqlab bo\'lmadi'); return false }
  }
  const saveBase = async () => {
    const u = base.trim().replace(/\/+$/, '')
    setBase(u); if (await saveSetting('qrBaseUrl', u)) toast.success('Manzil saqlandi')
  }
  const saveDesign = async () => { if (await saveSetting('qrDesign', JSON.stringify(d))) toast.success('Dizayn saqlandi') }
  const reset = async t => {
    if (!confirm(`${sectionLabel(t.category)} ${t.number} — QR kod yangilansinmi? Eski QR ishlamay qoladi.`)) return
    await API.post(`/api/tables/${t._id}/qr-reset`); load()
  }

  const d = design || { theme: 'light', title: '', subtitle: '' }
  const cleanBase = base.trim().replace(/\/+$/, '')
  const urlOk = /^https?:\/\/[^\s/]+$/i.test(cleanBase)
  const tables = (data?.tables || []).filter(t => cat === 'all' || t.category === cat)
  const cardOpts = async t => {
    if (logoRef.current === null) logoRef.current = /^(\/|http)/.test(settings.brandLogo || '') ? await loadImage(fileUrl(settings.brandLogo)) : false
    return {
      url: `${cleanBase}/m/${t.qrToken}`, brand: settings.brandName, logo: logoRef.current || null,
      section: sectionLabel(t.category), number: t.number, theme: d.theme,
      title: d.title || DEFAULT_TITLE, subtitle: d.subtitle || DEFAULT_SUB,
    }
  }

  // Ko'rinish: har stol kartochkasi bir xil chizgichda (yuklab olinadigan rasm bilan aynan bir xil)
  const key = [cleanBase, d.theme, d.title, d.subtitle, settings.brandName, settings.brandLogo, cat, tables.map(t => t.qrToken).join()].join('|')
  useEffect(() => {
    if (!urlOk || !tables.length) return
    let stop = false
    logoRef.current = null
    ;(async () => {
      const out = {}
      for (const t of tables) {
        if (stop) return
        const c = await drawQrCard(await cardOpts(t))
        out[t._id] = c.toDataURL('image/png')
      }
      if (!stop) setImages(out)
    })()
    return () => { stop = true }
  }, [key])

  const downloadOne = async t => {
    const blob = await canvasBlob(await drawQrCard(await cardOpts(t)))
    downloadBlob(blob, fileName(sectionLabel(t.category), t))
  }
  const downloadAll = async () => {
    setBusy(true)
    const id = toast.loading(`${tables.length} ta QR tayyorlanmoqda…`)
    try {
      const files = []
      for (const t of tables) files.push({ name: fileName(sectionLabel(t.category), t), blob: await canvasBlob(await drawQrCard(await cardOpts(t))) })
      downloadBlob(await makeZip(files), `QR-kodlar-${(settings.brandName || 'RestoPro').replace(/[^\w-]+/g, '-')}.zip`)
      toast.success('Yuklandi', { id })
    } catch (e) { toast.error("Tayyorlab bo'lmadi: " + e.message, { id }) }
    finally { setBusy(false) }
  }

  if (!data) return <div className="page"><Loading/></div>
  const cats = [...new Set(data.tables.map(t => t.category))]
  const designChanged = JSON.stringify({ theme: d.theme, title: d.title, subtitle: d.subtitle }) !==
    JSON.stringify({ theme: settings.qrDesign?.theme || 'light', title: settings.qrDesign?.title || '', subtitle: settings.qrDesign?.subtitle || '' })

  return (
    <div className="page">
      <div className="no-print">
        <PageHead title="QR menyu" sub="Mijoz stoldagi QR kodni skanerlab menyuni ko'radi va buyurtma beradi"
          actions={<>
            <Link to="/admin/tables" className="btn btn-ghost btn-lg"><ArrowLeft size={20}/> Stollar</Link>
            <button className="btn btn-soft btn-lg" onClick={downloadAll} disabled={!urlOk || !tables.length || busy}><Archive size={20}/> Hammasini yuklash</button>
            <button className="btn btn-primary btn-lg" onClick={() => window.print()} disabled={!urlOk || !tables.length}><Printer size={20}/> Chop etish</button>
          </>}/>

        <div className="dash" style={{ marginTop: 0, marginBottom: 18 }}>
          <div className="card card-pad col" style={{ gap: 12 }}>
            <Switch checked={!!settings.qrMenuEnabled} onChange={v => saveSetting('qrMenuEnabled', String(v))}
              label="QR menyu orqali buyurtma" hint="O'chirilsa mijoz QR kodni skanerlaganda «hozir o'chirilgan» degan xabar chiqadi"/>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>QR ichidagi manzil</div>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <input className="input mono" style={{ flex: 1, minWidth: 220 }} value={base} onChange={e => setBase(e.target.value)} placeholder="http://192.168.1.10:5050" list="qr-urls"/>
                <datalist id="qr-urls">{data.urls.map(u => <option key={u} value={u}/>)}</datalist>
                <button className="btn btn-dark btn-lg" onClick={saveBase} disabled={!urlOk}>Saqlash</button>
              </div>
              <div className="hint" style={{ marginTop: 8 }}>
                Kassa kompyuterida ishlasa — kassaning Wi-Fi manzili ({data.urls.filter(u => u.startsWith('http://')).join(', ') || 'topilmadi'}).
                Routerda kassa kompyuteriga doimiy IP biriktiring, aks holda manzil o'zgarib QR ishlamay qolishi mumkin.
              </div>
            </div>
          </div>
          <div className="card card-pad col" style={{ gap: 12 }}>
            <div className="card-head" style={{ margin: 0 }}><span className="card-title">Dizayn</span><span className="label">A6 · 300 DPI</span></div>
            <Seg value={d.theme} onChange={theme => setDesign({ ...d, theme })} items={QR_THEMES.map(t => ({ k: t.id, l: t.label }))}/>
            <Field label="Sarlavha">
              <input className="input" value={d.title} maxLength={60} placeholder={DEFAULT_TITLE} onChange={e => setDesign({ ...d, title: e.target.value })}/>
            </Field>
            <Field label="Pastki yozuv">
              <input className="input" value={d.subtitle} maxLength={80} placeholder={DEFAULT_SUB} onChange={e => setDesign({ ...d, subtitle: e.target.value })}/>
            </Field>
            <button className="btn btn-dark btn-lg" onClick={saveDesign} disabled={!designChanged}>Dizaynni saqlash</button>
          </div>
        </div>

        <div className="row" style={{ gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <div className="seg">
            {[['all', 'Barchasi'], ...cats.map(c => [c, sectionLabel(c)])].map(([k, l]) => (
              <button key={k} className={`seg-item ${cat === k ? 'cur' : ''}`} onClick={() => setCat(k)}>{l}</button>
            ))}
          </div>
          <div className="row muted" style={{ gap: 8, fontSize: 14 }}><Wifi size={18}/> Buyurtma faqat restoran Wi-Fi'idan qabul qilinadi va ofitsant tasdiqlagach oshxonaga ketadi</div>
        </div>
      </div>

      {!tables.length ? <Empty icon={QrCode} title="Stol yo'q" text="Avval «Stollar» bo'limida stol qo'shing."/>
        : !urlOk ? <Empty icon={QrCode} title="Manzilni kiriting" text="QR kod ichiga yoziladigan manzilni yuqorida kiriting va saqlang."/>
        : (
          <div className="qr-sheet">
            {tables.map(t => (
              <div key={t._id} className="qr-item">
                {images[t._id] ? <img src={images[t._id]} alt={`${sectionLabel(t.category)} ${t.number}`} className="qr-png"/> : <div className="qr-png qr-ph"><span className="spinner-sm"/></div>}
                <div className="row no-print" style={{ gap: 6, justifyContent: 'center' }}>
                  <button className="btn btn-soft btn-sm" onClick={() => downloadOne(t)}><Download size={15}/> PNG</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => reset(t)} title="QR kodni yangilash (eskisi ishlamay qoladi)"><RotateCcw size={15}/> Yangilash</button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

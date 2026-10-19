import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { ArrowLeft, Printer, RotateCcw, Wifi, QrCode } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { PageHead, Loading, Empty, Switch, BrandMark } from '../../components/ui.jsx'

const CAT = { zal: 'Zal', xona: 'Xona', "ko'cha": "Ko'cha" }

function QrImg({ url }) {
  const [src, setSrc] = useState('')
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' }).then(setSrc).catch(() => setSrc('')) }, [url])
  return src ? <img src={src} alt="" className="qr-img"/> : <div className="qr-img"/>
}

export default function QrCodes() {
  const { settings, refresh } = useSettings()
  const [data, setData] = useState(null)
  const [base, setBase] = useState('')
  const [cat, setCat] = useState('all')

  const load = () => API.get('/api/tables/qr').then(r => {
    setData(r.data)
    setBase(b => b || settings.qrBaseUrl || r.data.urls[0] || (/localhost|127\.0\.0\.1/.test(window.location.origin) ? '' : window.location.origin))
  }).catch(() => toast.error("Yuklab bo'lmadi"))
  useEffect(() => { load() }, [])

  const saveSetting = async (k, v) => {
    const fd = new FormData(); fd.append(k, v)
    try { await API.put('/api/settings', fd); await refresh() }
    catch (err) { toast.error(err.response?.data?.message || 'Saqlab bo\'lmadi') }
  }
  const saveBase = async () => {
    const u = base.trim().replace(/\/+$/, '')
    setBase(u); await saveSetting('qrBaseUrl', u); toast.success('Manzil saqlandi')
  }
  const reset = async t => {
    if (!confirm(`${CAT[t.category]} ${t.number} — QR kod yangilansinmi? Eski QR ishlamay qoladi.`)) return
    await API.post(`/api/tables/${t._id}/qr-reset`); load()
  }

  if (!data) return <div className="page"><Loading/></div>
  const tables = data.tables.filter(t => cat === 'all' || t.category === cat)
  const urlOk = /^https?:\/\/[^\s/]+$/i.test(base.trim().replace(/\/+$/, ''))
  const cats = [...new Set(data.tables.map(t => t.category))]

  return (
    <div className="page">
      <div className="no-print">
        <PageHead title="QR menyu" sub="Mijoz stoldagi QR kodni skanerlab menyuni ko'radi va buyurtma beradi"
          actions={<>
            <Link to="/admin/tables" className="btn btn-ghost btn-lg"><ArrowLeft size={20}/> Stollar</Link>
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
          <div className="card card-pad">
            <div className="row" style={{ gap: 10, marginBottom: 8 }}><Wifi size={20}/><b>Faqat restoran Wi-Fi'idan</b></div>
            <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
              Buyurtma faqat restoran tarmog'iga ulangan telefondan qabul qilinadi. Mijoz buyurtmasi darhol oshxonaga ketmaydi —
              ofitsant yoki admin «Qabul qilish» tugmasini bosgandan keyin stol buyurtmasiga qo'shiladi.
            </p>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 14.5 }}>
              Cloud serverda ishlatsangiz: <b>Sozlama → QR menyu</b> bo'limida restoran Wi-Fi'ining tashqi IP manzilini qo'shing.
            </p>
          </div>
        </div>

        <div className="seg" style={{ marginBottom: 18 }}>
          {[['all', 'Barchasi'], ...cats.map(c => [c, CAT[c] || c])].map(([k, l]) => (
            <button key={k} className={`seg-item ${cat === k ? 'cur' : ''}`} onClick={() => setCat(k)}>{l}</button>
          ))}
        </div>
      </div>

      {!tables.length ? <Empty icon={QrCode} title="Stol yo'q" text="Avval «Stollar» bo'limida stol qo'shing."/>
        : !urlOk ? <Empty icon={QrCode} title="Manzilni kiriting" text="QR kod ichiga yoziladigan manzilni yuqorida kiriting va saqlang."/>
        : (
          <div className="qr-sheet">
            {tables.map(t => {
              const url = `${base.trim().replace(/\/+$/, '')}/m/${t.qrToken}`
              return (
                <div key={t._id} className="qr-card">
                  <div className="row" style={{ gap: 10 }}>
                    <BrandMark size={34}/><b style={{ fontSize: 16 }} className="truncate">{settings.brandName}</b>
                  </div>
                  <QrImg url={url}/>
                  <div className="qr-table"><small>{CAT[t.category] || t.category}</small>{String(t.number).padStart(2, '0')}</div>
                  <div className="qr-hint">Menyu va buyurtma<br/>Restoran Wi-Fi'iga ulaning</div>
                  <button className="btn btn-ghost btn-sm no-print" onClick={() => reset(t)} title="QR kodni yangilash"><RotateCcw size={15}/> Yangilash</button>
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

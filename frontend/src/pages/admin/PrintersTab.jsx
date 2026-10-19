import React, { useState, useEffect } from 'react'
import { Printer, Plus, Pencil, Trash2, Wifi, Usb, RefreshCw, Info, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import API from '../../api/api.js'
import { useSettings } from '../../context/SettingsContext.jsx'
import { waitJobs } from '../../utils/receipt.js'
import Modal from '../../components/shared/Modal.jsx'
import { Field, Switch, Seg, Empty } from '../../components/ui.jsx'

const BLANK = { name: '', conn: 'network', ip: '', port: 9100, device: '', paperWidth: 80, receipt: false, orders: true, categories: [], enabled: true }

const STATUS = {
  pending:  ['Navbatda', 'tag'],
  printing: ['Chiqmoqda', 'tag tag-yel'],
  done:     ['Chiqdi', 'tag tag-ok'],
  error:    ['Xato', 'tag tag-soft'],
  expired:  ["Chiqmadi", 'tag tag-soft'],
}
const KIND = { receipt: 'Chek', order: 'Talon', test: 'Sinov' }

// Sozlamalar → Printerlar: kassa, ofitsant, oshxona, shashlikchi ... printerlari.
// Har biri tarmoq (IP) yoki kassa kompyuteriga USB orqali ulanadi va faqat
// o'ziga tegishli narsani chiqaradi (mijoz cheki va/yoki tanlangan taomlar taloni).
export default function PrintersTab() {
  const { settings, refresh } = useSettings()
  const printers = settings.printers || []
  const [agent, setAgent] = useState(null)
  const [cats, setCats] = useState([])
  const [jobs, setJobs] = useState([])
  const [edit, setEdit] = useState(null)        // tahrirlanayotgan printer (yangi bo'lsa _id yo'q)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(null)
  const [devices, setDevices] = useState(null)

  const loadJobs = () => API.get('/api/print/jobs').then(r => setJobs(r.data)).catch(() => {})
  useEffect(() => {
    API.get('/api/print/status').then(r => setAgent(r.data.agent)).catch(() => {})
    API.get('/api/products/categories').then(r => setCats(r.data)).catch(() => {})
    loadJobs()
  }, [])

  const saveList = async list => {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('printers', JSON.stringify(list))
      await API.put('/api/settings', fd)
      await refresh()
      return true
    } catch (err) { toast.error(err.response?.data?.message || "Saqlab bo'lmadi"); return false }
    finally { setSaving(false) }
  }

  const submit = async () => {
    const p = { ...edit, name: edit.name.trim() }
    const list = p._id ? printers.map(x => (x._id === p._id ? p : x)) : [...printers, p]
    if (await saveList(list)) { setEdit(null); toast.success('Printer saqlandi') }
  }
  const remove = async p => {
    if (!confirm(`«${p.name}» printerini o'chirasizmi?`)) return
    if (await saveList(printers.filter(x => x._id !== p._id))) toast.success("O'chirildi")
  }
  const toggle = p => saveList(printers.map(x => (x._id === p._id ? { ...x, enabled: !x.enabled } : x)))

  const test = async p => {
    setTesting(p._id)
    const id = toast.loading(`${p.name}: sinov varag'i yuborilmoqda…`)
    try {
      const { data } = await API.post(`/api/print/test/${p._id}`)
      const r = await waitJobs(data.jobs, data.agent ? 15000 : 40000)
      if (!r.ok) toast.error(r.error, { id, duration: 7000 })
      else if (r.queued) toast('Kassa hali olmadi — kassa ilovasi yoqiqmi?', { id, icon: '⏳', duration: 6000 })
      else toast.success(`${p.name}: sinov varag'i chiqdi`, { id })
    } catch (err) { toast.error(err.response?.data?.message || 'Xatolik', { id }) }
    finally { setTesting(null); loadJobs() }
  }

  const findDevices = async () => {
    try {
      const { data } = await API.get('/api/print/devices')
      if (!data.available) return toast.error("USB printerlar ro'yxati faqat kassa ilovasida ochilganda ko'rinadi")
      setDevices(data.devices)
      if (data.error) toast.error(data.error)
      else if (!data.devices.length) toast('Bu kompyuterda printer topilmadi', { icon: 'ℹ️' })
    } catch { toast.error('Topib bo\'lmadi') }
  }

  const setE = (k, v) => setEdit(e => ({ ...e, [k]: v }))
  const toggleCat = c => setE('categories', edit.categories.includes(c) ? edit.categories.filter(x => x !== c) : [...edit.categories, c])
  const allCats = [...new Set([...cats, ...(edit?.categories || [])])]
  const valid = edit && edit.name.trim() && (edit.conn === 'usb' ? edit.device.trim() : /^\d{1,3}(\.\d{1,3}){3}$/.test(edit.ip.trim())) && (edit.receipt || edit.orders)

  return (
    <div className="col" style={{ gap: 14, maxWidth: 900 }}>
      {agent === false && (
        <div className="card card-pad row" style={{ gap: 12, alignItems: 'flex-start', background: 'var(--hl)', color: 'var(--hl-ink)' }}>
          <Info size={20} style={{ flexShrink: 0, marginTop: 2 }}/>
          <span style={{ fontSize: 14.5 }}>
            Siz cloud serverdasiz. Printerlarga restorandagi <b>kassa ilovasi</b> chiqaradi: chek va talonlar kassaga
            sinxronlash orqali yetadi (bir necha soniya). Kassa kompyuteri yoqiq va internetga ulangan bo'lishi kerak.
          </span>
        </div>
      )}

      <div className="card card-pad">
        <div className="card-head">
          <span className="card-title">Printerlar</span>
          <button className="btn btn-primary" onClick={() => { setDevices(null); setEdit({ ...BLANK, categories: [] }) }}><Plus size={18}/> Printer qo'shish</button>
        </div>
        {!printers.length ? (
          <Empty icon={Printer} title="Printer qo'shilmagan"
            text="Kassadagi chek printerini va oshxona, shashlikchi kabi joylardagi printerlarni qo'shing. Har biriga faqat o'ziga tegishli taomlar chiqadi."/>
        ) : (
          <div className="lst">
            {printers.map(p => (
              <div key={p._id} className="lst-row" style={{ padding: '14px 0', opacity: p.enabled ? 1 : .5 }}>
                <span className="lst-th">{p.conn === 'usb' ? <Usb size={20}/> : <Wifi size={20}/>}</span>
                <span className="lst-name">
                  {p.name}
                  <small>{p.conn === 'usb' ? `USB · ${p.device}` : `${p.ip}:${p.port || 9100}`} · {p.paperWidth} mm</small>
                  <span className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    {p.receipt && <span className="tag tag-ok">Mijoz cheki</span>}
                    {p.orders && (p.categories?.length
                      ? p.categories.map(c => <span key={c} className="tag">{c}</span>)
                      : <span className="tag">Barcha taomlar</span>)}
                  </span>
                </span>
                <button className="btn btn-soft" onClick={() => test(p)} disabled={testing === p._id || !p.enabled}>
                  {testing === p._id ? <span className="spinner-sm"/> : <Printer size={18}/>} Sinash
                </button>
                <Switch checked={p.enabled} onChange={() => toggle(p)}/>
                <button className="btn btn-soft btn-icon" title="Tahrirlash" onClick={() => { setDevices(null); setEdit({ ...BLANK, ...p }) }}><Pencil size={18}/></button>
                <button className="btn btn-ghost btn-icon" title="O'chirish" onClick={() => remove(p)}><Trash2 size={18}/></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <span className="card-title">Oxirgi chop etishlar</span>
          <button className="btn btn-ghost btn-sm" onClick={loadJobs}><RefreshCw size={16}/> Yangilash</button>
        </div>
        {!jobs.length ? <div className="muted" style={{ padding: '8px 0' }}>Hali hech narsa chop etilmagan</div> : (
          <div className="lst">
            {jobs.slice(0, 12).map(j => {
              const [l, cls] = STATUS[j.status] || [j.status, 'tag']
              return (
                <div key={j._id} className="lst-row">
                  <span className="mono muted" style={{ width: 48, fontSize: 13 }}>{new Date(j.createdAt).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="lst-name truncate">{j.title}<small>{KIND[j.kind]} · {j.printer}{j.error ? ` · ${j.error}` : ''}</small></span>
                  <span className={cls}>{l}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?._id ? 'Printerni tahrirlash' : "Yangi printer"} maxWidth={620}
        footer={<>
          <button className="btn btn-ghost btn-lg" onClick={() => setEdit(null)}>Bekor qilish</button>
          <button className="btn btn-primary btn-lg" onClick={submit} disabled={!valid || saving}>{saving ? <span className="spinner-sm"/> : null} Saqlash</button>
        </>}>
        {edit && <>
          <Field label="Nomi" required hint="Masalan: Kassa, Oshxona, Shashlik, Bar">
            <input className="input" value={edit.name} onChange={e => setE('name', e.target.value)} maxLength={40} autoFocus/>
          </Field>

          <div className="field">
            <span className="label">Ulanish</span>
            <Seg value={edit.conn} onChange={v => setE('conn', v)} items={[{ k: 'network', l: 'Tarmoq (IP)', icon: Wifi }, { k: 'usb', l: 'USB (kassa kompyuteri)', icon: Usb }]}/>
          </div>

          {edit.conn === 'network' ? (
            <div className="form-2" style={{ gridTemplateColumns: '1fr 120px' }}>
              <Field label="IP manzil" required hint="Printerdan chiqadigan sozlama varag'ida yozilgan">
                <input className="input mono" value={edit.ip} onChange={e => setE('ip', e.target.value)} placeholder="192.168.1.50"/>
              </Field>
              <Field label="Port">
                <input className="input mono" type="number" value={edit.port} onChange={e => setE('port', e.target.value)}/>
              </Field>
            </div>
          ) : (
            <Field label="Windows'dagi printer nomi" required hint="Printer kassa kompyuteriga USB orqali ulangan va Windows'da o'rnatilgan bo'lishi kerak">
              <div className="row" style={{ gap: 8 }}>
                <input className="input" list="rp-devices" value={edit.device} onChange={e => setE('device', e.target.value)} placeholder="XP-80C"/>
                <button type="button" className="btn btn-soft" onClick={findDevices}><Search size={18}/> Topish</button>
              </div>
              <datalist id="rp-devices">{(devices || []).filter(d => !d.virtual).map(d => <option key={d.name} value={d.name}/>)}</datalist>
              {devices?.length > 0 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                  {devices.filter(d => !d.virtual).map(d => (
                    <button type="button" key={d.name} className={`tag ${edit.device === d.name ? 'tag-accent' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setE('device', d.name)}>{d.name}</button>
                  ))}
                </div>
              )}
            </Field>
          )}

          <div className="field">
            <span className="label">Qog'oz eni</span>
            <Seg value={edit.paperWidth} onChange={v => setE('paperWidth', v)} items={[{ k: 58, l: '58 mm' }, { k: 80, l: '80 mm' }]}/>
          </div>

          <Switch checked={edit.receipt} onChange={v => setE('receipt', v)} label="Mijoz cheki" hint="«Chek» tugmasi bosilganda shu printerdan chiqadi (kassa)"/>
          <Switch checked={edit.orders} onChange={v => setE('orders', v)} label="Buyurtma talonlari" hint="Ofitsant buyurtma yuborganda taomlar ro'yxati chiqadi (oshpaz, shashlikchi, bar)"/>

          {edit.orders && (
            <div className="field" style={{ marginTop: 14 }}>
              <span className="label">Qaysi taomlar chiqsin</span>
              <div className="row wrap" style={{ gap: 8 }}>
                {allCats.map(c => (
                  <button type="button" key={c} className={`btn btn-sm ${edit.categories.includes(c) ? 'btn-dark' : 'btn-soft'}`} onClick={() => toggleCat(c)}>{c}</button>
                ))}
                {!allCats.length && <span className="muted">Taomlar kategoriyasi yo'q</span>}
              </div>
              <span className="hint">{edit.categories.length ? `Faqat: ${edit.categories.join(', ')}` : 'Hech biri tanlanmasa — barcha taomlar chiqadi'}</span>
            </div>
          )}
          {!(edit.receipt || edit.orders) && <div className="alert" style={{ marginTop: 10 }}>Kamida bittasini yoqing: mijoz cheki yoki buyurtma talonlari</div>}
        </>}
      </Modal>
    </div>
  )
}

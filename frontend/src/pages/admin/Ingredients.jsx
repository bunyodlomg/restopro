import React,{useState,useEffect}from'react'
import{motion}from'framer-motion'
import{PlusCircle,Edit2,Trash2,AlertTriangle}from'lucide-react'
import toast from'react-hot-toast'
import API from'../../api/api.js'
import PageHeader from'../../components/shared/PageHeader.jsx'
import Modal,{ModalField,ModalActions}from'../../components/shared/Modal.jsx'
const UNITS=['kg','g','l','ml','dona','litr','paket']
export default function Ingredients(){
  const[items,setItems]=useState([])
  const[loading,setLoading]=useState(true)
  const[open,setOpen]=useState(false)
  const[editing,setEditing]=useState(null)
  const[saving,setSaving]=useState(false)
  const[form,setForm]=useState({name:'',unit:'kg',quantity:'',minQty:'',price:''})
  const load=async()=>{try{const{data}=await API.get('/api/ingredients');setItems(data)}catch{toast.error('Xatolik')}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  const openAdd=()=>{setEditing(null);setForm({name:'',unit:'kg',quantity:'',minQty:'',price:''});setOpen(true)}
  const openEdit=it=>{setEditing(it);setForm({name:it.name,unit:it.unit,quantity:it.quantity,minQty:it.minQty,price:it.price});setOpen(true)}
  const save=async()=>{
    if(!form.name)return toast.error('Nomi majburiy')
    setSaving(true)
    try{
      if(editing){const{data}=await API.put(`/api/ingredients/${editing._id}`,form);setItems(p=>p.map(x=>x._id===editing._id?data:x));toast.success('Saqlandi')}
      else{const{data}=await API.post('/api/ingredients',form);setItems(p=>[data,...p]);toast.success("Qo'shildi!")}
      setOpen(false)
    }catch{toast.error('Xatolik')}finally{setSaving(false)}
  }
  const del=async id=>{if(!confirm("O'chirasizmi?"))return;try{await API.delete(`/api/ingredients/${id}`);setItems(p=>p.filter(x=>x._id!==id));toast.success("O'chirildi")}catch{toast.error('Xatolik')}}
  return(
    <div className="page-enter" style={{minHeight:'100vh',background:'var(--bg)',padding:'2rem'}}>
      <PageHeader title="Ombor" subtitle={`${items.length} ta ingredient`}
        action={<button className="adm-btn-primary" onClick={openAdd}><PlusCircle size={15}/>Qo'shish</button>}/>
      {loading?(<div style={{display:'flex',justifyContent:'center',padding:'4rem'}}><div className="spinner"/></div>):(
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden'}}>
          <table className="data-table">
            <thead><tr style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
              {['Nomi','Birlik','Miqdor','Min chegara','Narxi',''].map(h=><th key={h} style={{color:'var(--text-3)',background:'rgba(var(--brand-rgb),0.03)'}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {items.map((it,i)=>{
                const low=it.quantity<=it.minQty&&it.minQty>0
                return(
                  <motion.tr key={it._id}
                    initial={{opacity:0,x:-16}}
                    animate={{opacity:1,x:0}}
                    transition={{duration:0.3,delay:i*0.04}}
                    style={{borderBottom:i<items.length-1?'1px solid rgba(255,255,255,0.04)':'none',transition:'background 0.15s'}}
                    onMouseEnter={e=>e.currentTarget.style.background='rgba(var(--brand-rgb),0.02)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  >
                    <td><div style={{display:'flex',alignItems:'center',gap:6}}>
                      {low&&<AlertTriangle size={13} style={{color:'#F59E0B'}}/>}
                      <span style={{color:'var(--text)',fontWeight:500}}>{it.name}</span>
                    </div></td>
                    <td><span className="badge badge-brand">{it.unit}</span></td>
                    <td style={{color:low?'#F59E0B':'#F2EDE6',fontWeight:600}}>{it.quantity}</td>
                    <td style={{color:'var(--text-3)'}}>{it.minQty||'—'}</td>
                    <td style={{color:'var(--text-3)'}}>{it.price?(it.price.toLocaleString()+' so\'m'):'—'}</td>
                    <td style={{textAlign:'right'}}>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        {[{icon:<Edit2 size={12}/>,fn:()=>openEdit(it),c:'var(--brand)',bg:'rgba(var(--brand-rgb),0.08)'},{icon:<Trash2 size={12}/>,fn:()=>del(it._id),c:'#EF4444',bg:'rgba(239,68,68,0.08)'}].map((btn,j)=>(
                          <button key={j} onClick={btn.fn} style={{width:28,height:28,borderRadius:7,background:btn.bg,border:'none',cursor:'pointer',color:btn.c,display:'flex',alignItems:'center',justifyContent:'center',transition:'opacity 0.2s'}}
                            onMouseEnter={e=>e.currentTarget.style.opacity='0.7'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}
                          >{btn.icon}</button>
                        ))}
                      </div>
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Ingredient tahrirlash':'Yangi ingredient'}>
        <ModalField label="Nomi *"><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Masalan: Un" className="rp-input"/></ModalField>
        <ModalField label="O'lchov birligi">
          <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} className="rp-input">
            {UNITS.map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </ModalField>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <ModalField label="Joriy miqdor"><input type="number" value={form.quantity} onChange={e=>setForm(f=>({...f,quantity:e.target.value}))} placeholder="0" className="rp-input"/></ModalField>
          <ModalField label="Minimum chegara"><input type="number" value={form.minQty} onChange={e=>setForm(f=>({...f,minQty:e.target.value}))} placeholder="0" className="rp-input"/></ModalField>
        </div>
        <ModalField label="1 birlik narxi (so'm)"><input type="number" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="0" className="rp-input"/></ModalField>
        <ModalActions onClose={()=>setOpen(false)} onConfirm={save} loading={saving} confirmLabel="Saqlash"/>
      </Modal>
    </div>
  )
}

import React,{useState,useEffect}from'react'
import{motion,AnimatePresence}from'framer-motion'
import{PlusCircle,Trash2,ChevronDown,ChevronUp,User,Wallet}from'lucide-react'
import toast from'react-hot-toast'
import API from'../../api/api.js'
import PageHeader from'../../components/shared/PageHeader.jsx'
import Modal,{ModalField,ModalActions}from'../../components/shared/Modal.jsx'

export default function Salaries(){
  const[summary,setSummary]=useState([])
  const[loading,setLoading]=useState(true)
  const[open,setOpen]=useState(false)
  const[saving,setSaving]=useState(false)
  const[expanded,setExpanded]=useState(null)
  const[month,setMonth]=useState(()=>new Date().toISOString().slice(0,7))
  const[form,setForm]=useState({userId:'',amount:'',note:''})

  const load=async()=>{
    setLoading(true)
    try{const{data}=await API.get(`/api/salaries/users-summary?month=${month}`);setSummary(data)}
    catch{toast.error('Xatolik')}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[month])

  const totalPaid=summary.reduce((s,u)=>s+u.totalPaid,0)

  const save=async()=>{
    if(!form.userId||!form.amount)return toast.error("Xodim va miqdor to'ldiring")
    setSaving(true)
    try{
      await API.post('/api/salaries',{...form,month})
      toast.success("To'landi!");setOpen(false);setForm({userId:'',amount:'',note:''});load()
    }catch{toast.error('Xatolik')}finally{setSaving(false)}
  }

  const del=async(id)=>{
    if(!confirm("O'chirasizmi?"))return
    try{await API.delete(`/api/salaries/${id}`);toast.success("O'chirildi");load()}
    catch{toast.error('Xatolik')}
  }

  return(
    <div className="page-enter" style={{minHeight:'100vh',background:'var(--bg)',padding:'2rem'}}>
      <PageHeader title="Ish haqi" subtitle={`${month} — Jami to'langan: ${totalPaid.toLocaleString()} so'm`}
        action={<div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="rp-input" style={{width:160}}/>
          <button className="adm-btn-primary" onClick={()=>setOpen(true)}><PlusCircle size={15}/>To'lash</button>
        </div>}
      />
      {loading?(
        <div style={{display:'flex',justifyContent:'center',padding:'4rem'}}><div className="spinner"/></div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:'0.75rem'}}>
          {summary.map((u,i)=>{
            const isExp=expanded===u._id
            const pct=u.baseSalary>0?Math.min(100,Math.round(u.totalPaid/u.baseSalary*100)):null
            return(
              <motion.div key={u._id}
                initial={{opacity:0,y:16}}
                animate={{opacity:1,y:0}}
                transition={{duration:0.3,delay:i*0.05}}
                style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',transition:'border-color 0.2s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(var(--brand-rgb),0.2)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}
              >
                {/* Header row */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'1rem 1.25rem',cursor:'pointer'}} onClick={()=>setExpanded(isExp?null:u._id)}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                    <div style={{width:38,height:38,borderRadius:10,background:'linear-gradient(135deg,var(--brand),var(--brand-lt))',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,color:'#fff',fontSize:'1rem',flexShrink:0}}>
                      {u.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontWeight:700,fontSize:'0.9rem',color:'var(--text)'}}>{u.name}</div>
                      <div style={{fontSize:'0.7rem',color:'var(--text-3)'}}>
                        {u.baseSalary>0?`Oylik: ${u.baseSalary.toLocaleString()} so'm`:'Oylik belgilanmagan'}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'1.25rem'}}>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontWeight:700,color:'var(--brand)',fontSize:'0.875rem'}}>{u.totalPaid.toLocaleString()} so'm</div>
                      {u.remaining>0&&<div style={{fontSize:'0.7rem',color:'#F59E0B'}}>Qoldi: {u.remaining.toLocaleString()} so'm</div>}
                      {u.remaining===0&&u.baseSalary>0&&<div style={{fontSize:'0.7rem',color:'#22C55E'}}>✅ To'liq to'landi</div>}
                    </div>
                    {/* Progress bar */}
                    {pct!==null&&(
                      <div style={{width:60,display:'flex',flexDirection:'column',gap:3}}>
                        <div style={{height:4,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct}%`,background:pct>=100?'#22C55E':'var(--brand)',borderRadius:2,transition:'width 0.4s'}}/>
                        </div>
                        <div style={{fontSize:'0.62rem',color:'var(--text-3)',textAlign:'center'}}>{pct}%</div>
                      </div>
                    )}
                    <div style={{color:'var(--text-3)'}}>{isExp?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</div>
                  </div>
                </div>

                {/* Accordion content */}
                <AnimatePresence>
                {isExp&&(
                  <motion.div
                    initial={{height:0,opacity:0}}
                    animate={{height:'auto',opacity:1}}
                    exit={{height:0,opacity:0}}
                    transition={{duration:0.25}}
                    style={{overflow:'hidden'}}
                  >
                  <div style={{borderTop:'1px solid rgba(255,255,255,0.05)',padding:'0.875rem 1.25rem',background:'rgba(255,255,255,0.01)'}}>
                    {u.payments.length===0?(
                      <p style={{fontSize:'0.8rem',color:'var(--text-3)',textAlign:'center',padding:'0.75rem 0'}}>Bu oy hali to'lov qilinmagan</p>
                    ):(
                      <div style={{display:'flex',flexDirection:'column',gap:6}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.7rem',fontWeight:700,color:'var(--text-3)',padding:'0 0.25rem',marginBottom:2,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                          <span>Sana</span><span>Miqdor</span><span>Izoh</span><span></span>
                        </div>
                        {u.payments.map(p=>(
                          <div key={p._id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.5rem 0.75rem',borderRadius:8,background:'rgba(255,255,255,0.02)'}}>
                            <span style={{fontSize:'0.78rem',color:'var(--text-2)'}}>{new Date(p.paidAt).toLocaleDateString('uz-UZ')}</span>
                            <span style={{fontSize:'0.875rem',fontWeight:700,color:'var(--brand)'}}>{p.amount.toLocaleString()} so'm</span>
                            <span style={{fontSize:'0.75rem',color:'var(--text-3)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.note||'—'}</span>
                            <button onClick={()=>del(p._id)} style={{width:26,height:26,borderRadius:6,background:'rgba(239,68,68,0.08)',border:'none',cursor:'pointer',color:'#EF4444',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.2s'}}
                              onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.18)'}
                              onMouseLeave={e=>e.currentTarget.style.background='rgba(239,68,68,0.08)'}
                            ><Trash2 size={11}/></button>
                          </div>
                        ))}
                        {/* Add payment button inline */}
                        <button onClick={()=>{setForm({userId:u._id,amount:u.remaining||'',note:''});setOpen(true)}}
                          style={{marginTop:4,padding:'0.5rem',borderRadius:8,border:'1px dashed rgba(var(--brand-rgb),0.3)',background:'none',cursor:'pointer',color:'var(--brand)',fontSize:'0.78rem',fontWeight:600,fontFamily:'DM Sans,sans-serif'}}>
                          + Yangi to'lov qo'shish
                        </button>
                      </div>
                    )}
                    {u.payments.length===0&&(
                      <button onClick={()=>{setForm({userId:u._id,amount:u.baseSalary||'',note:''});setOpen(true)}}
                        style={{width:'100%',padding:'0.5rem',borderRadius:8,border:'1px dashed rgba(var(--brand-rgb),0.3)',background:'none',cursor:'pointer',color:'var(--brand)',fontSize:'0.78rem',fontWeight:600,fontFamily:'DM Sans,sans-serif'}}>
                        + To'lov qilish
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
              )}
              </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
      <Modal open={open} onClose={()=>setOpen(false)} title="Ish haqi to'lash">
        <ModalField label="Xodim *">
          <select value={form.userId} onChange={e=>setForm(f=>({...f,userId:e.target.value}))} className="rp-input">
            <option value="">Xodim tanlang</option>
            {summary.map(u=><option key={u._id} value={u._id}>{u.name} — qoldi: {u.remaining.toLocaleString()} so'm</option>)}
          </select>
        </ModalField>
        <ModalField label="Miqdor (so'm) *"><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="1500000" className="rp-input"/></ModalField>
        <ModalField label="Izoh"><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Ixtiyoriy" className="rp-input"/></ModalField>
        <ModalActions onClose={()=>setOpen(false)} onConfirm={save} loading={saving} confirmLabel="To'lash"/>
      </Modal>
    </div>
  )
}

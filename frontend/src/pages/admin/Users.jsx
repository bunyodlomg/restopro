import React,{useState,useEffect}from'react'
import{motion}from'framer-motion'
import{UserPlus,Trash2,Search,Shield,User,Edit2}from'lucide-react'
import toast from'react-hot-toast'
import API from'../../api/api.js'
import PageHeader from'../../components/shared/PageHeader.jsx'
import Modal,{ModalField,ModalActions}from'../../components/shared/Modal.jsx'

export default function Users(){
  const[users,setUsers]=useState([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[open,setOpen]=useState(false)
  const[editing,setEditing]=useState(null)
  const[saving,setSaving]=useState(false)
  const[form,setForm]=useState({name:'',username:'',password:'',role:'waiter',phone:'',salary:''})

  const load=async()=>{
    try{const{data}=await API.get('/api/users');setUsers(data)}
    catch{toast.error('Xatolik')}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])

  const openAdd=()=>{setEditing(null);setForm({name:'',username:'',password:'',role:'waiter',phone:'',salary:''});setOpen(true)}
  const openEdit=u=>{setEditing(u);setForm({name:u.name,username:u.username,password:'',role:u.role,phone:u.phone||'',salary:u.salary||''});setOpen(true)}

  const save=async()=>{
    if(!form.name||!form.username)return toast.error("Ism va username to'ldiring")
    if(!editing&&!form.password)return toast.error("Parol kiriting")
    setSaving(true)
    try{
      const body={...form}
      if(form.salary)body.salary=+form.salary
      if(!body.password)delete body.password
      if(editing){
        const{data}=await API.put(`/api/users/${editing._id}`,body)
        setUsers(p=>p.map(u=>u._id===editing._id?data:u));toast.success('Saqlandi')
      }else{
        const{data}=await API.post('/api/users',body)
        setUsers(p=>[data,...p]);toast.success("Qo'shildi!")
      }
      setOpen(false)
    }catch(e){toast.error(e.response?.data?.message||'Xatolik')}finally{setSaving(false)}
  }

  const del=async id=>{
    if(!confirm("O'chirasizmi?"))return
    try{await API.delete(`/api/users/${id}`);setUsers(p=>p.filter(u=>u._id!==id));toast.success("O'chirildi")}
    catch{toast.error('Xatolik')}
  }

  const filtered=users.filter(u=>u.name?.toLowerCase().includes(q.toLowerCase())||u.username?.toLowerCase().includes(q.toLowerCase()))

  return(
    <div className="page-enter" style={{minHeight:'100vh',background:'var(--bg)',padding:'2rem'}}>
      <PageHeader title="Xodimlar" subtitle={`${users.length} ta foydalanuvchi`}
        action={<div style={{display:'flex',gap:'0.5rem'}}>
          <div style={{position:'relative'}}>
            <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#4A4238'}}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Qidirish..." className="rp-input" style={{paddingLeft:32,width:180}}/>
          </div>
          <button className="adm-btn-primary" onClick={openAdd}><UserPlus size={15}/>Qo'shish</button>
        </div>}
      />

      <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden'}}>
        {loading?(
          <div style={{display:'flex',justifyContent:'center',padding:'3rem'}}><div className="spinner"/></div>
        ):(
          <table className="data-table">
            <thead>
              <tr style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                {['Xodim','Username','Rol','Oylik',''].map(h=>
                  <th key={h} style={{color:'var(--text-3)',background:'rgba(var(--brand-rgb),0.03)'}}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u,i)=>(
                <motion.tr key={u._id}
                  initial={{opacity:0,x:-16}}
                  animate={{opacity:1,x:0}}
                  transition={{duration:0.3,delay:i*0.04}}
                  style={{borderBottom:i<filtered.length-1?'1px solid rgba(255,255,255,0.04)':'none',transition:'background 0.15s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(var(--brand-rgb),0.02)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                >
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:'0.625rem'}}>
                      <div style={{width:34,height:34,borderRadius:9,background:'linear-gradient(135deg,var(--brand),var(--brand-lt))',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'0.875rem',flexShrink:0}}>
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{fontWeight:600,fontSize:'0.875rem',color:'var(--text)'}}>{u.name}</div>
                        {u.phone&&<div style={{fontSize:'0.68rem',color:'var(--text-3)'}}>{u.phone}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{color:'var(--text-3)',fontSize:'0.85rem'}}>@{u.username}</td>
                  <td>
                    <span className={`badge ${u.role==='admin'?'badge-brand':'badge-info'}`} style={{display:'inline-flex',alignItems:'center',gap:4}}>
                      {u.role==='admin'?<Shield size={10}/>:<User size={10}/>}
                      {u.role==='admin'?'Admin':'Ofitsant'}
                    </span>
                  </td>
                  <td style={{color: u.salary?'var(--brand)':'#7A7060',fontWeight: u.salary?600:400,fontSize:'0.85rem'}}>
                    {u.salary?`${u.salary.toLocaleString()} so'm`:'—'}
                  </td>
                  <td style={{textAlign:'right'}}>
                    <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                      <button onClick={()=>openEdit(u)} style={{width:28,height:28,borderRadius:7,background:'rgba(var(--brand-rgb),0.08)',border:'none',cursor:'pointer',color:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(var(--brand-rgb),0.18)'}
                        onMouseLeave={e=>e.currentTarget.style.background='rgba(var(--brand-rgb),0.08)'}
                      ><Edit2 size={13}/></button>
                      <button onClick={()=>del(u._id)} style={{width:28,height:28,borderRadius:7,background:'rgba(239,68,68,0.08)',border:'none',cursor:'pointer',color:'#EF4444',display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.2s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(239,68,68,0.18)'}
                        onMouseLeave={e=>e.currentTarget.style.background='rgba(239,68,68,0.08)'}
                      ><Trash2 size={13}/></button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={open} onClose={()=>setOpen(false)} title={editing?`${editing.name} — tahrirlash`:'Yangi xodim'}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <ModalField label="Ism familiya *">
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ali Karimov" className="rp-input"/>
          </ModalField>
          <ModalField label="Username *">
            <input value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} placeholder="ali_karimov" className="rp-input" disabled={!!editing} style={{opacity:editing?0.6:1}}/>
          </ModalField>
        </div>
        <ModalField label={editing?"Yangi parol (o'zgartirmasangiz bo'sh qoldiring)":'Parol *'}>
          <input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••••••" className="rp-input"/>
        </ModalField>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <ModalField label="Rol">
            <select value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))} className="rp-input">
              <option value="waiter">Ofitsant</option>
              <option value="admin">Admin</option>
            </select>
          </ModalField>
          <ModalField label="Oylik maoshi (so'm)">
            <input type="number" value={form.salary} onChange={e=>setForm(f=>({...f,salary:e.target.value}))} placeholder="2000000" className="rp-input"/>
          </ModalField>
        </div>
        <ModalField label="Telefon (ixtiyoriy)">
          <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+998 90 123 45 67" className="rp-input"/>
        </ModalField>
        <ModalActions onClose={()=>setOpen(false)} onConfirm={save} loading={saving} confirmLabel="Saqlash"/>
      </Modal>
    </div>
  )
}

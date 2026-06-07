import React,{useState,useEffect}from'react'
import{motion}from'framer-motion'
import{io}from'socket.io-client'
import{PlusCircle,Trash2}from'lucide-react'
import toast from'react-hot-toast'
import API from'../../api/api.js'
import{API_URL}from'../../config.js'
import PageHeader from'../../components/shared/PageHeader.jsx'
const CATS=[{k:'zal',l:'Zal',e:'🪑',c:'#3B82F6'},{k:'xona',l:'Xona',e:'🚪',c:'#8B5CF6'},{k:"ko'cha",l:"Ko'cha",e:'🌳',c:'#22C55E'},{k:'soboy',l:'Soboy',e:'🍱',c:'#F59E0B'}]
export default function Tables(){
  const[tables,setTables]=useState([])
  const[cat,setCat]=useState('zal')
  const[loading,setLoading]=useState(false)
  const[adding,setAdding]=useState(false)
  useEffect(()=>{
    const s=io(API_URL)
    s.on('tableCreated',t=>setTables(p=>p.some(x=>x._id===t._id)?p:[...p,t]))
    s.on('tableDeleted',id=>setTables(p=>p.filter(t=>t._id!==id)))
    s.on('tableUpdated',t=>setTables(p=>p.map(x=>x._id===t._id?t:x)))
    return()=>s.disconnect()
  },[])
  const fetch=async()=>{
    setLoading(true)
    try{const{data}=await API.get(`/api/tables?category=${cat}`);setTables(data)}
    catch{toast.error('Xatolik')}
    finally{setLoading(false)}
  }
  useEffect(()=>{fetch()},[cat])
  // Tezkor qo'shish — keyingi bo'sh raqamli stolni darhol yaratadi
  const addTable=async()=>{
    if(adding)return
    const number=tables.length?Math.max(...tables.map(t=>t.number))+1:1
    setAdding(true)
    try{
      const{data}=await API.post('/api/tables',{category:cat,number})
      setTables(p=>p.some(x=>x._id===data._id)?p:[...p,data])
      toast.success(`${number}-stol qo'shildi`)
    }
    catch{toast.error('Xatolik')}
    finally{setAdding(false)}
  }
  const del=async(id)=>{
    if(!confirm("O'chirasizmi?"))return
    try{await API.delete(`/api/tables/${id}`);toast.success("O'chirildi")}
    catch{toast.error('Xatolik')}
  }
  const activeCat=CATS.find(c=>c.k===cat)
  return(
    <div className="page-enter" style={{minHeight:'100vh',background:'var(--bg)',padding:'2rem'}}>
      <PageHeader title="Stollar" subtitle={`${activeCat?.e} ${activeCat?.l} — ${tables.length} ta`}
        action={<button className="adm-btn-primary" onClick={addTable} disabled={adding}><PlusCircle size={15}/>{adding?"Qo'shilmoqda...":"Stol qo'shish"}</button>}/>
      <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.5rem',flexWrap:'wrap'}}>
        {CATS.map(({k,l,e,c})=>(
          <button key={k} onClick={()=>setCat(k)} style={{
            display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.5rem 1rem',borderRadius:20,cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontSize:'0.8rem',transition:'all 0.2s',
            background:cat===k?`${c}1F`:'var(--card)',border:`1px solid ${cat===k?`${c}66`:'var(--border)'}`,color:cat===k?c:'var(--text-2)',fontWeight:cat===k?600:500,
          }}>{e} {l}</button>
        ))}
      </div>
      {loading?(
        <div style={{display:'flex',justifyContent:'center',padding:'4rem'}}><div className="spinner"/></div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:'0.875rem'}}>
          {tables.map((t,i)=>{
            const busy=t.status==='busy'
            return(
              <motion.div key={t._id} className="group"
                initial={{opacity:0,scale:0.9}}
                animate={{opacity:1,scale:1}}
                transition={{duration:0.3,delay:i*0.04,type:'spring',stiffness:300,damping:22}}
                style={{
                background:'var(--card)',borderRadius:14,padding:'1rem',
                border:`2px solid ${busy?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.2)'}`,
                display:'flex',flexDirection:'column',alignItems:'center',gap:6,
                position:'relative',cursor:'default',transition:'border-color 0.2s,box-shadow 0.2s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'}}
                onMouseLeave={e=>{e.currentTarget.style.boxShadow='none'}}
              >
                <div style={{width:44,height:44,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:'1.25rem',
                  background:busy?'rgba(239,68,68,0.08)':'rgba(34,197,94,0.08)',color:busy?'#EF4444':'#22C55E'}}>
                  {t.number}
                </div>
                <span style={{fontSize:'0.68rem',fontWeight:700,padding:'0.15rem 0.5rem',borderRadius:10,
                  background:busy?'rgba(239,68,68,0.1)':'rgba(34,197,94,0.1)',
                  color:busy?'#EF4444':'#22C55E'}}>
                  {busy?'Band':"Bo'sh"}
                </span>
                {t.description&&<span style={{fontSize:'0.65rem',color:'var(--text-3)',textAlign:'center'}}>{t.description}</span>}
                <button onClick={()=>del(t._id)} style={{
                  position:'absolute',top:6,right:6,width:24,height:24,borderRadius:6,
                  background:'rgba(239,68,68,0.08)',border:'none',cursor:'pointer',
                  color:'#EF4444',display:'flex',alignItems:'center',justifyContent:'center',
                  opacity:0,transition:'opacity 0.2s',
                }}
                  onMouseEnter={e=>{e.currentTarget.style.background='rgba(239,68,68,0.2)'}}
                  onMouseLeave={e=>{e.currentTarget.style.background='rgba(239,68,68,0.08)'}}
                  ref={el=>{if(el){el.closest('[class]')?.addEventListener('mouseenter',()=>{el.style.opacity='1'});el.closest('[class]')?.addEventListener('mouseleave',()=>{el.style.opacity='0'})}}}
                ><Trash2 size={12}/></button>
              </motion.div>
            )
          })}
          {/* Tezkor qo'shish tugmasi — bosilganda keyingi raqamli stol darhol yaratiladi */}
          <button onClick={addTable} disabled={adding} style={{
            background:'var(--card)',borderRadius:14,minHeight:118,
            border:'2px dashed var(--border)',cursor:adding?'default':'pointer',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,
            color:'var(--text-3)',transition:'border-color 0.2s,color 0.2s',opacity:adding?0.6:1,
          }}
            onMouseEnter={e=>{if(!adding){e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.color='var(--brand)'}}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-3)'}}
          >
            <PlusCircle size={28}/>
            <span style={{fontSize:'0.72rem',fontWeight:700}}>{adding?"Qo'shilmoqda...":'Yangi stol'}</span>
          </button>
        </div>
      )}
    </div>
  )
}

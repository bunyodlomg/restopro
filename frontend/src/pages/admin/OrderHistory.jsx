import React,{useState,useEffect,useRef}from'react'
import{motion,AnimatePresence}from'framer-motion'
import{Search,ChevronDown,ChevronUp,ChevronLeft,ChevronRight,History,Calendar,Filter}from'lucide-react'
import API from'../../api/api.js'
import PageHeader from'../../components/shared/PageHeader.jsx'
import DateRangeCalendar from'../../components/shared/DateRangeCalendar.jsx'

const LIMIT=50
// Date → "YYYY-MM-DD" (lokal vaqt)
const iso=d=>{
  const m=String(d.getMonth()+1).padStart(2,'0')
  const day=String(d.getDate()).padStart(2,'0')
  return`${d.getFullYear()}-${m}-${day}`
}
// Sana → "15 May" (uz-UZ locale "M05" beradi — oy nomini qo'lda yozamiz)
const UZ_MONTHS=['Yan','Fev','Mar','Apr','May','Iyn','Iyl','Avg','Sen','Okt','Noy','Dek']
const fmtDate=s=>{
  if(!s)return'…'
  const dt=new Date(s+'T00:00')
  return isNaN(dt)?'…':`${dt.getDate()} ${UZ_MONTHS[dt.getMonth()]}`
}

export default function OrderHistory(){
  const today=iso(new Date())
  const[orders,setOrders]=useState([])
  const[total,setTotal]=useState(0)
  const[page,setPage]=useState(1)
  const[pages,setPages]=useState(1)
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[exp,setExp]=useState(null)
  const[start,setStart]=useState(today)
  const[end,setEnd]=useState(today)
  const[showPicker,setShowPicker]=useState(false)
  const pickerRef=useRef()

  useEffect(()=>{
    const h=e=>{if(pickerRef.current&&!pickerRef.current.contains(e.target))setShowPicker(false)}
    document.addEventListener('mousedown',h)
    return()=>document.removeEventListener('mousedown',h)
  },[])

  const load=async(p=1,s=start,e=end)=>{
    setLoading(true)
    try{
      const{data}=await API.get(`/api/orders?status=closed&startDate=${s}&endDate=${e}&page=${p}&limit=${LIMIT}`)
      setOrders(data.orders||[])
      setTotal(data.total||0)
      setPage(data.page||1)
      setPages(data.pages||1)
      setExp(null)
    }catch(err){console.error(err)}
    finally{setLoading(false)}
  }
  useEffect(()=>{load(1)},[])

  const applyRange=(s,e)=>{setStart(s);setEnd(e);load(1,s,e);setShowPicker(false)}
  const applyCustom=()=>{const e=end||start;setEnd(e);load(1,start,e);setShowPicker(false)}
  const presets=[
    {label:'Bugun',get:()=>{const t=iso(new Date());return[t,t]}},
    {label:'Kecha',get:()=>{const d=new Date();d.setDate(d.getDate()-1);const t=iso(d);return[t,t]}},
    {label:'7 kun',get:()=>{const d=new Date();d.setDate(d.getDate()-6);return[iso(d),iso(new Date())]}},
    {label:'30 kun',get:()=>{const d=new Date();d.setDate(d.getDate()-29);return[iso(d),iso(new Date())]}},
  ]
  const fmt=fmtDate

  const filtered=orders.filter(o=>
    o.tableNumber?.toString().includes(q)||
    o.category?.toLowerCase().includes(q.toLowerCase())||
    o.waiterName?.toLowerCase().includes(q.toLowerCase())
  )

  return(
    <div className="page-enter" style={{minHeight:'100vh',background:'var(--bg)',padding:'2rem'}}>
      <PageHeader title="Buyurtmalar Tarixi" subtitle={`${total} ta yopilgan buyurtma`}
        action={
          <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{position:'relative'}}>
              <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#4A4238'}}/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Qidirish..." className="rp-input" style={{paddingLeft:32,width:200}}/>
            </div>
            <div ref={pickerRef} style={{position:'relative'}}>
              <button onClick={()=>setShowPicker(p=>!p)} className="btn-ghost">
                <Calendar size={16}/> {fmt(start)} — {fmt(end)}
              </button>
              <AnimatePresence>
                {showPicker&&(
                  <motion.div initial={{opacity:0,y:-6,scale:0.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-6,scale:0.97}} transition={{duration:0.15}}
                    style={{position:'absolute',top:'calc(100% + 8px)',right:0,zIndex:50,background:'var(--card)',border:'1px solid var(--border)',borderRadius:18,padding:'1.1rem',boxShadow:'var(--shadow-lg)'}}>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:'0.85rem'}}>
                      {presets.map(p=>{
                        const[s,e]=p.get()
                        const active=s===start&&e===end
                        return(
                          <button key={p.label} onClick={()=>applyRange(s,e)}
                            style={{padding:'0.4rem 0.7rem',borderRadius:9,cursor:'pointer',fontSize:'0.76rem',fontWeight:700,fontFamily:'DM Sans,sans-serif',
                              background:active?'var(--brand-glow)':'var(--surface)',border:`1.5px solid ${active?'var(--brand)':'var(--border)'}`,color:active?'var(--brand)':'var(--text-2)'}}>
                            {p.label}
                          </button>
                        )
                      })}
                    </div>
                    <DateRangeCalendar start={start} end={end} onChange={(s,e)=>{setStart(s);setEnd(e)}}/>
                    <button onClick={applyCustom} disabled={!start} className="btn-primary" style={{width:'100%',marginTop:'0.85rem'}}>
                      <Filter size={16}/> Filtrlash
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        }
      />
      {loading?(<div style={{display:'flex',justifyContent:'center',padding:'4rem'}}><div className="spinner"/></div>)
      :orders.length===0?(<div style={{textAlign:'center',padding:'4rem',color:'var(--text-3)'}}><History size={40} style={{marginBottom:'1rem',opacity:.3}}/><p>Bu sanada yopilgan buyurtma yo'q</p></div>)
      :(
        <>
        {filtered.length===0?(
          <div style={{textAlign:'center',padding:'3rem',color:'var(--text-3)'}}><p>Qidiruv bo'yicha topilmadi</p></div>
        ):(
        <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
          {filtered.map((o,i)=>{
            const total=(o.items||[]).reduce((s,it)=>s+it.price*it.quantity,0)+((o.extras||[]).reduce((s,ex)=>s+(ex.extraFee||0),0))
            const isExp=exp===o._id
            return(
              <motion.div key={o._id}
                initial={{opacity:0,y:16}}
                animate={{opacity:1,y:0}}
                transition={{duration:0.3,delay:i*0.03}}
                style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',transition:'border-color 0.2s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(var(--brand-rgb),0.2)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}
              >
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.875rem 1.25rem',cursor:'pointer'}} onClick={()=>setExp(isExp?null:o._id)}>
                  <div style={{display:'flex',alignItems:'center',gap:'0.875rem'}}>
                    <div style={{width:36,height:36,borderRadius:10,background:'rgba(var(--brand-rgb),0.1)',color:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontFamily:'Sora,sans-serif'}}>{o.tableNumber}</div>
                    <div>
                      <div style={{fontWeight:600,fontSize:'0.875rem',color:'var(--text)'}}>{o.category} — Stol {o.tableNumber}</div>
                      <div style={{fontSize:'0.7rem',color:'var(--text-3)'}}>{o.waiterName&&`👤 ${o.waiterName} · `}{new Date(o.closedAt||o.createdAt).toLocaleDateString('uz-UZ')}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'1.5rem'}}>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontWeight:700,color:'var(--brand)',fontSize:'0.9rem'}}>{total.toLocaleString()} so'm</div>
                      <div style={{fontSize:'0.7rem',color:'var(--text-3)'}}>{o.items?.length} taom</div>
                    </div>
                    <div style={{color:'var(--text-3)'}}>{isExp?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</div>
                  </div>
                </div>
                <AnimatePresence>
                {isExp&&(
                  <motion.div
                    initial={{height:0,opacity:0}}
                    animate={{height:'auto',opacity:1}}
                    exit={{height:0,opacity:0}}
                    transition={{duration:0.25}}
                    style={{overflow:'hidden'}}
                  >
                  <div style={{padding:'0.75rem 1.25rem 1rem',borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                    {o.items?.map((it,j)=>(
                      <motion.div key={j}
                        initial={{opacity:0,x:-10}}
                        animate={{opacity:1,x:0}}
                        transition={{duration:0.2,delay:j*0.03}}
                        style={{display:'flex',justifyContent:'space-between',fontSize:'0.82rem',padding:'0.3rem 0',color:'var(--text-2)'}}
                      >
                        <span><span style={{color:'var(--text-3)',marginRight:6}}>x{it.quantity}</span>{it.name}</span>
                        <span>{(it.price*it.quantity).toLocaleString()} so'm</span>
                      </motion.div>
                    ))}
                  </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
        )}
        {pages>1&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'1rem',marginTop:'1.5rem'}}>
            <button className="btn-ghost" disabled={page<=1||loading} onClick={()=>load(page-1)}
              style={{opacity:page<=1?0.4:1,cursor:page<=1?'default':'pointer'}}>
              <ChevronLeft size={16}/> Oldingi
            </button>
            <span style={{fontSize:'0.85rem',fontWeight:700,color:'var(--text-2)'}}>{page} / {pages}</span>
            <button className="btn-ghost" disabled={page>=pages||loading} onClick={()=>load(page+1)}
              style={{opacity:page>=pages?0.4:1,cursor:page>=pages?'default':'pointer'}}>
              Keyingi <ChevronRight size={16}/>
            </button>
          </div>
        )}
        </>
      )}
    </div>
  )
}

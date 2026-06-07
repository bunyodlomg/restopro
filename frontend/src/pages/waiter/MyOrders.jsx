import React,{useState,useEffect,useRef}from'react'
import{io}from'socket.io-client'
import{Clock,CheckCircle,XCircle,ChevronLeft,ChevronRight}from'lucide-react'
import toast from'react-hot-toast'
import API from'../../api/api.js'
import{API_URL}from'../../config.js'
import{useAuth}from'../../context/AuthContext.jsx'
import{getNewOrderSoundUrl}from'../../utils/sound.js'

const STATUS={pending:{label:'Kutilmoqda',color:'#F59E0B',bg:'rgba(245,158,11,0.1)',Icon:Clock},ready:{label:'Tayyor',color:'#22C55E',bg:'rgba(34,197,94,0.1)',Icon:CheckCircle},closed:{label:'Yopildi',color:'#7A7570',bg:'rgba(0,0,0,0.06)',Icon:XCircle}}
const PAGE_SIZE=50
// Bugungi sana — "YYYY-MM-DD" (lokal vaqt)
const todayStr=()=>{
  const d=new Date()
  return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function MyOrders(){
  const[orders,setOrders]=useState([])
  const[loading,setLoading]=useState(true)
  const[tab,setTab]=useState('pending')
  const[page,setPage]=useState(1)
  const{user}=useAuth()
  const audioRef=useRef(null)

  useEffect(()=>{
    audioRef.current=new Audio(getNewOrderSoundUrl(API_URL))
    const today=todayStr()
    // Faqat bugungi buyurtmalar — server sana bo'yicha filtrlaydi
    API.get(`/api/orders?startDate=${today}&endDate=${today}`).then(({data})=>{
      setOrders(Array.isArray(data)?data:(data.orders||[]))
    }).catch(console.error).finally(()=>setLoading(false))

    const s=io(API_URL)
    s.on('newOrder',o=>setOrders(p=>p.some(x=>x._id===o._id)?p:[...p,o]))
    s.on('orderUpdated',o=>setOrders(p=>p.map(x=>x._id===o._id?o:x)))
    s.on('orderClosed',id=>{
      setOrders(p=>p.map(x=>x._id===id?{...x,status:'closed'}:x))
    })
    // Admin buyurtma yopganda ofitsantda tovush chiqadi
    s.on('orderClosedSound',()=>{
      if(audioRef.current){
        audioRef.current.play().catch(()=>{})
        toast.success('Buyurtma yopildi ✅',{icon:'🍽',duration:3000})
      }
    })
    return()=>s.disconnect()
  },[user?._id])

  // Faqat shu ofitsantning buyurtmalari
  const mine=orders.filter(o=>o.waiterName===user?.name||o.waiterId===user?._id)
  const tabFiltered=mine.filter(o=>{
    if(tab==='pending')return o.status==='pending'
    if(tab==='closed')return o.status==='closed'
    return true
  })
  const count=t=>{
    if(t==='pending')return mine.filter(o=>o.status==='pending').length
    if(t==='closed')return mine.filter(o=>o.status==='closed').length
    return mine.length
  }
  const pageCount=Math.max(1,Math.ceil(tabFiltered.length/PAGE_SIZE))
  const curPage=Math.min(page,pageCount)
  const visible=tabFiltered.slice((curPage-1)*PAGE_SIZE,curPage*PAGE_SIZE)
  const pageBtn=disabled=>({
    width:42,height:42,borderRadius:12,
    border:'1px solid var(--wai-border)',background:'var(--wai-card)',
    display:'flex',alignItems:'center',justifyContent:'center',
    cursor:disabled?'default':'pointer',opacity:disabled?0.45:1,
    color:'var(--wai-text)',
  })

  return(
    <div className="wai-page">
      {/* Header */}
      <div className="wai-page-head hide-mobile">
        <div>
          <h1 style={{fontFamily:'Sora,sans-serif',fontWeight:800,fontSize:'1.5rem',color:'var(--wai-text)',letterSpacing:'-0.02em'}}>Mening buyurtmalarim</h1>
          <p style={{color:'var(--wai-text3)',fontSize:'0.9rem',fontWeight:500,marginTop:4}}>Bugun · jami {mine.length} ta buyurtma</p>
        </div>
      </div>
      {/* Tabs */}
      <div className="wai-tabs">
        {[['pending','Faol'],['closed','Tugagan'],['all','Barchasi']].map(([k,l])=>(
          <button key={k} onClick={()=>{setTab(k);setPage(1)}}
            className={`wai-tab ${tab===k?'wai-tab--active':''}`}
          >
            {l}
            {count(k)>0&&<span className="wai-tab-badge" style={{background:tab===k?'rgba(var(--brand-rgb),0.12)':'rgba(0,0,0,0.08)',color:tab===k?'var(--brand)':'#7A7570'}}>{count(k)}</span>}
          </button>
        ))}
      </div>

      {loading?(
        <div style={{display:'flex',justifyContent:'center',padding:'3rem'}}><div className="spinner"/></div>
      ):visible.length===0?(
        <div style={{textAlign:'center',padding:'3rem',color:'var(--wai-text3)'}}><p style={{fontSize:'2.5rem',marginBottom:'0.75rem'}}>📋</p><p style={{fontWeight:600,color:'var(--wai-text2)'}}>Bugun buyurtma yo'q</p></div>
      ):(
        <>
        <div className="wai-orders-grid">
          {visible.map(order=>{
            const s=STATUS[order.status]||STATUS.pending
            const Icon=s.Icon
            const total=(order.items||[]).reduce((sm,it)=>sm+it.price*it.quantity,0)+(order.serviceFee||0)
            return(
              <div key={order._id} className="wai-order-card">
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'1rem 1.125rem',borderBottom:'1px solid var(--wai-border)'}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:'0.95rem',color:'var(--wai-text)'}}>
                      {order.category==='soboy'?`Soboy #${order.tableNumber}`:`Stol ${order.tableNumber}`}
                    </span>
                    <span style={{fontSize:'0.72rem',color:'var(--wai-text3)',marginLeft:6}}>{order.category}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:4,padding:'0.25rem 0.75rem',borderRadius:10,background:s.bg,color:s.color,fontSize:'0.75rem',fontWeight:700}}>
                    <Icon size={12}/> {s.label}
                  </div>
                </div>
                <div style={{padding:'0.875rem 1.125rem'}}>
                  {(order.items||[]).map((it,i)=>(
                    <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:'0.85rem',padding:'0.3rem 0',color:'var(--wai-text)'}}>
                      <span><span style={{color:'var(--wai-text3)',marginRight:5}}>x{it.quantity}</span>{it.name}</span>
                      <span style={{color:'var(--brand)',fontWeight:600}}>{(it.price*it.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div style={{padding:'0.625rem 1.125rem 1rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'0.72rem',color:'var(--wai-text3)'}}>{new Date(order.createdAt).toLocaleTimeString('uz-UZ',{hour:'2-digit',minute:'2-digit'})}</span>
                  <span style={{fontFamily:'Sora,sans-serif',fontWeight:800,fontSize:'1.05rem',color:'var(--brand)'}}>{total.toLocaleString()} so'm</span>
                </div>
              </div>
            )
          })}
        </div>
        {pageCount>1&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'1rem',marginTop:'1.5rem'}}>
            <button style={pageBtn(curPage<=1)} disabled={curPage<=1} onClick={()=>setPage(curPage-1)}>
              <ChevronLeft size={18}/>
            </button>
            <span style={{fontSize:'0.88rem',fontWeight:700,color:'var(--wai-text2)'}}>{curPage} / {pageCount}</span>
            <button style={pageBtn(curPage>=pageCount)} disabled={curPage>=pageCount} onClick={()=>setPage(curPage+1)}>
              <ChevronRight size={18}/>
            </button>
          </div>
        )}
        </>
      )}
    </div>
  )
}

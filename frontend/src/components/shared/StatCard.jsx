import React from 'react'

const COLORS = {
  brand:  { text:'var(--brand)',   bg:'var(--brand-glow)',        border:'rgba(var(--brand-rgb),0.25)' },
  accent: { text:'var(--accent)',  bg:'rgba(245,158,11,0.14)',    border:'rgba(245,158,11,0.28)'    },
  green:  { text:'var(--success)', bg:'rgba(34,197,94,0.14)',     border:'rgba(34,197,94,0.28)'     },
  blue:   { text:'var(--info)',    bg:'rgba(59,130,246,0.14)',    border:'rgba(59,130,246,0.28)'    },
  purple: { text:'var(--purple)',  bg:'rgba(168,85,247,0.14)',    border:'rgba(168,85,247,0.28)'    },
  red:    { text:'var(--danger)',  bg:'rgba(239,68,68,0.14)',     border:'rgba(239,68,68,0.28)'     },
  amber:  { text:'var(--accent)',  bg:'rgba(245,158,11,0.14)',    border:'rgba(245,158,11,0.28)'    },
}

export default function StatCard({ title, value, icon, color = 'brand', trend, trendLabel }) {
  const c = COLORS[color] || COLORS.brand
  return (
    <div className="rp-card" style={{ padding:'1.5rem', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, right:0, width:120, height:120, borderRadius:'0 var(--r-xl) 0 120px', background:c.bg, opacity:0.7 }}/>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'1rem', position:'relative' }}>
        <p style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{title}</p>
        <div style={{ width:48, height:48, borderRadius:14, background:c.bg, border:`1px solid ${c.border}`, display:'flex', alignItems:'center', justifyContent:'center', color:c.text, flexShrink:0 }}>
          {icon}
        </div>
      </div>
      <div style={{ position:'relative' }}>
        <p style={{ fontFamily:'Sora,sans-serif', fontWeight:800, fontSize:'2rem', color:'var(--text)', lineHeight:1.05, marginBottom:6, letterSpacing:'-0.02em' }}>{value ?? '—'}</p>
        {trend !== undefined && (
          <p style={{ fontSize:'0.82rem', color: trend >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% {trendLabel || ''}
          </p>
        )}
      </div>
    </div>
  )
}

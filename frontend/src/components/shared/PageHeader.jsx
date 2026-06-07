import React from 'react'
import{motion}from'framer-motion'

export default function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display:'flex', alignItems:'flex-start', justifyContent:'space-between',
      marginBottom:'2rem', gap:'1.25rem', flexWrap:'wrap',
    }}>
      <div>
        <motion.h1
          initial={{opacity:0,y:-12}}
          animate={{opacity:1,y:0}}
          transition={{duration:0.4,ease:[0.22,1,0.36,1]}}
          style={{
          fontFamily:'Sora,sans-serif', fontWeight:800,
          fontSize:'clamp(1.5rem,3vw,2rem)',
          color:'var(--text)', letterSpacing:'-0.02em', marginBottom:6, lineHeight:1.15,
        }}>{title}</motion.h1>
        {subtitle && (
          <motion.p
            initial={{opacity:0}}
            animate={{opacity:1}}
            transition={{duration:0.4,delay:0.1}}
            style={{ color:'var(--text-3)', fontSize:'1rem', fontWeight:500 }}>{subtitle}</motion.p>
        )}
      </div>
      {action && <motion.div initial={{opacity:0,scale:0.92}} animate={{opacity:1,scale:1}} transition={{duration:0.35,delay:0.15}} style={{ flexShrink:0 }}>{action}</motion.div>}
    </div>
  )
}

import React, { useState } from 'react'
import { initials } from '../ui.jsx'

// Taom rasmi kartada (Taomlar, ofitsant POS, QR menyu). Rasm shakliga qarab joylashadi:
//  • karta shakliga yaqin (ovqat fotosi) — butun maydonni to'ldiradi (cover)
//  • baland/tor yoki kvadrat (shisha, qadoq) — kesilmaydi, to'liq ko'rinadi (contain):
//      – oq/bir xil fondagi mahsulot surati — karta foni o'sha rangga bo'yaladi, chegarasiz qo'shilib ketadi
//      – oddiy foto — orqasida o'sha rasmning xiralashtirilgan nusxasi
const BOX = 1.6   // .pcard-ph eni / bo'yi (taxminan)

// Rasm burchaklari bir xil rangdami (mahsulot oq/kulrang fonda) — shu rangni qaytaradi.
// Boshqa domendagi rasm o'qilmasa (canvas «tainted») — null, xira fon ishlatiladi.
function edgeColor(img) {
  try {
    const n = 24, c = document.createElement('canvas')
    c.width = c.height = n
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(img, 0, 0, n, n)
    // Faqat burchaklar: chetlarning o'rtasiga mahsulot (shisha qopqog'i) yoki soya tegib turishi mumkin
    const px = [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]].map(([x, y]) => g.getImageData(x, y, 1, 1).data)
    if (px.every(p => p[3] < 20)) return 'transparent'          // shaffof PNG
    if (px.some(p => p[3] < 200)) return null
    const avg = [0, 1, 2].map(i => Math.round(px.reduce((s, p) => s + p[i], 0) / px.length))
    const same = px.every(p => [0, 1, 2].every(i => Math.abs(p[i] - avg[i]) < 14))
    return same ? `rgb(${avg.join(',')})` : null
  } catch { return null }
}

export default function FoodImage({ src, name }) {
  const [err, setErr] = useState(false)
  const [fit, setFit] = useState(null)    // 'cover' | 'contain'
  const [bg, setBg] = useState(null)      // contain: karta foni (bir xil fon rangi) yoki null — xira fon
  if (!src || err) return <span className="pcard-ini">{initials(name)}</span>
  const onLoad = e => {
    const img = e.currentTarget
    const r = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : BOX
    if (r > BOX * 0.72 && r < BOX * 1.45) return setFit('cover')
    setBg(edgeColor(img)); setFit('contain')
  }
  return (
    <>
      {fit === 'contain' && (bg
        ? <span className="ph-fill" style={{ background: bg === 'transparent' ? undefined : bg }}/>
        : <img className="ph-blur" src={src} alt="" aria-hidden="true"/>)}
      <img className={`ph-img ${fit || 'cover'} ${bg ? 'flat' : ''}`} src={src} alt="" loading="lazy"
        onLoad={onLoad} onError={() => setErr(true)} style={fit ? undefined : { opacity: 0 }}/>
    </>
  )
}

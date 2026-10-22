import React, { useState, useEffect } from 'react'
import API from '../../api/api.js'

// Chek namunasi — printer chiqaradigan qatorlarning o'zi (server/print/escpos.js),
// shuning uchun bu yerda ko'ringan narsa qog'ozda ham aynan shunday chiqadi.
// Har qator: { t, a: left|center|right, b: qalin, inv: qora fon, w, h: 1..2 marta katta }

const PAPER_PX = { 58: 232, 80: 312 }   // chop etiladigan qism (48 / 72 mm)
const LINE = 1.25                        // qator balandligi (shrift o'lchamiga nisbatan)

export default function ReceiptPreview({ order, brandName, receipt }) {
  const paperWidth = Number(receipt.paperWidth) === 80 ? 80 : 58
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState('')

  // Matn yozilayotganda har harfga so'rov yubormaslik uchun biroz kutiladi
  const key = JSON.stringify({ order, brandName, receipt, paperWidth })
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      API.post('/api/print/preview', { order, brandName, receipt, paperWidth })
        .then(r => { if (alive) { setDoc(r.data); setError('') } })
        .catch(err => { if (alive) setError(err.response?.data?.message || "Namuna yuklanmadi") })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [key])   // eslint-disable-line react-hooks/exhaustive-deps

  const width = PAPER_PX[paperWidth]
  // Monoshrift belgisi ~0.6em: bir qatorga aynan `cols` ta belgi sig'adi
  const fs = doc ? width / doc.cols / 0.6 : 12

  return (
    <div style={{ background: '#fff', color: '#000', padding: '14px 12px 18px', borderRadius: 6, boxShadow: 'var(--shadow-2)', width: width + 24, alignSelf: 'flex-start' }}>
      {error && <div className="muted" style={{ fontSize: 13 }}>{error}</div>}
      {!doc && !error && <div className="muted" style={{ fontSize: 13 }}>Yuklanmoqda…</div>}
      {doc && (
        <div style={{ width, fontFamily: "'Courier New', ui-monospace, monospace", fontSize: fs, lineHeight: 1, overflow: 'hidden' }}>
          {doc.lines.map((l, i) => (
            <div key={i} style={{ height: fs * LINE * l.h, display: 'flex', justifyContent: { left: 'flex-start', center: 'center', right: 'flex-end' }[l.a] || 'flex-start', alignItems: 'center' }}>
              <span style={{
                whiteSpace: 'pre', fontWeight: l.b ? 700 : 400,
                background: l.inv ? '#000' : 'transparent', color: l.inv ? '#fff' : '#000',
                display: 'inline-block', fontSize: fs * l.w, transform: l.h !== l.w ? `scaleY(${l.h / l.w})` : undefined,
                lineHeight: LINE,
              }}>{l.t || ' '}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #999', marginTop: 8 }}/>
        </div>
      )}
    </div>
  )
}

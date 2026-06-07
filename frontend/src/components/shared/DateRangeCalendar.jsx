import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sh', 'Ya']
const MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
]

// Date → "YYYY-MM-DD" (lokal vaqt bo'yicha)
const iso = d => {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Diapazonni tanlash uchun kalendar — boshlanish va tugash sanalari
export default function DateRangeCalendar({ start, end, onChange }) {
  const [view, setView] = useState(() => {
    const base = start ? new Date(start + 'T00:00') : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const year = view.getFullYear()
  const month = view.getMonth()
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // Dushanba = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayKey = iso(new Date())

  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  const pick = date => {
    const k = iso(date)
    if (!start || (start && end)) {
      onChange(k, '')                      // yangi diapazonni boshlash
    } else if (k < start) {
      onChange(k, start)                   // teskari tanlov — almashtirish
    } else {
      onChange(start, k)
    }
  }

  return (
    <div style={{ width: 266 }}>
      {/* Sarlavha + navigatsiya */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" data-sound="nav" className="cal-nav"
          onClick={() => setView(new Date(year, month - 1, 1))}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontFamily: 'Sora,sans-serif', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>
          {MONTHS[month]} {year}
        </span>
        <button type="button" data-sound="nav" className="cal-nav"
          onClick={() => setView(new Date(year, month + 1, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Hafta kunlari */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-3)', padding: '4px 0' }}>
            {w}
          </div>
        ))}
      </div>

      {/* Kunlar to'ri */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const k = iso(date)
          const isStart = k === start
          const isEnd = k === end
          const isEdge = isStart || isEnd
          const between = start && end && k > start && k < end
          // Diapazon foni — uchlarda yarim, o'rtada to'liq
          let bg = 'transparent'
          if (between) bg = 'var(--brand-glow)'
          else if (isStart && end && end !== start) bg = 'linear-gradient(to right, transparent 50%, var(--brand-glow) 50%)'
          else if (isEnd && start && end !== start) bg = 'linear-gradient(to left, transparent 50%, var(--brand-glow) 50%)'
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2px 0', background: bg }}>
              <button
                type="button"
                data-sound="tick"
                onClick={() => pick(date)}
                className={`cal-day${isEdge ? ' cal-day--sel' : ''}${k === todayKey && !isEdge ? ' cal-day--today' : ''}`}
              >
                {date.getDate()}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

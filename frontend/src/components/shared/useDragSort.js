import { useRef, useLayoutEffect, useEffect, useCallback } from 'react'

// Sudrab tartiblash — sensorli monoblok va sichqoncha uchun (Pointer Events, kutubxonasiz).
// Elementlarga data-sort-id={id} va onPointerDown={start} beriladi; konteynerga ref.
// Barmoq/sichqoncha ostidagi element o'rniga suriladi (onMove(fromId, toId)),
// qolganlar FLIP animatsiya bilan siljiydi, ekran chetida ro'yxat o'zi aylanadi.
const THRESHOLD = 6     // shuncha px siljimaguncha drag boshlanmaydi (oddiy bosish)
const EDGE = 90         // ekran chetiga shuncha yaqin bo'lsa avtomatik aylantirish
const MAX_SPEED = 18

const scrollParent = el => {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
  }
  return document.scrollingElement || document.documentElement
}

export default function useDragSort({ enabled, order, onMove, onDrop }) {
  const containerRef = useRef(null)
  const drag = useRef(null)
  const rects = useRef(null)
  const cb = useRef({ onMove, onDrop })
  cb.current = { onMove, onDrop }

  const items = () => [...(containerRef.current?.querySelectorAll('[data-sort-id]') || [])]

  // FLIP: tartib o'zgargandan keyin elementlarni eski joyidan yangisiga silliq siljitish
  useLayoutEffect(() => {
    const before = rects.current
    rects.current = null
    if (!before) return
    for (const el of items()) {
      const id = el.dataset.sortId
      if (id === drag.current?.id || !before[id]) continue
      const r = el.getBoundingClientRect()
      const dx = before[id].left - r.left, dy = before[id].top - r.top
      if (!dx && !dy) continue
      el._sortAnimEnd = performance.now() + 180
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      requestAnimationFrame(() => {
        el.style.transition = 'transform .18s ease'
        el.style.transform = ''
      })
    }
  }, [order])

  const hitTest = useCallback((x, y) => {
    const d = drag.current
    if (!d) return
    const over = document.elementFromPoint(x, y)?.closest('[data-sort-id]')
    const overId = over?.dataset.sortId
    if (!overId || overId === d.id || !containerRef.current?.contains(over)) return
    // Hali siljiyotgan (animatsiyadagi) element ustida qayta almashinmasin — "titrash" bo'lmasin
    if (over._sortAnimEnd > performance.now()) return
    rects.current = Object.fromEntries(items().map(el => [el.dataset.sortId, el.getBoundingClientRect()]))
    cb.current.onMove(d.id, overId)
  }, [])

  const begin = d => {
    const r = d.el.getBoundingClientRect()
    const ghost = d.el.cloneNode(true)
    Object.assign(ghost.style, {
      position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      margin: 0, zIndex: 9999, pointerEvents: 'none', transition: 'transform .12s, box-shadow .12s',
      boxShadow: '0 24px 48px -12px rgba(0,0,0,.45)', transform: 'scale(1.05)', opacity: '.96',
    })
    ghost.removeAttribute('data-sort-id')
    document.body.appendChild(ghost)
    d.ghost = ghost
    d.offX = d.startX - r.left
    d.offY = d.startY - r.top
    d.active = true
    d.el.classList.add('sort-placeholder')
    d.scroller = scrollParent(containerRef.current)
    navigator.vibrate?.(15)
    const tick = () => {
      if (!drag.current?.active) return
      const s = d.scroller
      const box = s === document.scrollingElement ? { top: 0, bottom: innerHeight } : s.getBoundingClientRect()
      let v = 0
      if (d.y < box.top + EDGE) v = -MAX_SPEED * (1 - Math.max(0, d.y - box.top) / EDGE)
      else if (d.y > box.bottom - EDGE) v = MAX_SPEED * (1 - Math.max(0, box.bottom - d.y) / EDGE)
      if (v) { s.scrollTop += v; hitTest(d.x, d.y) }
      d.raf = requestAnimationFrame(tick)
    }
    d.raf = requestAnimationFrame(tick)
  }

  const end = useCallback(cancelled => {
    const d = drag.current
    if (!d) return
    removeEventListener('pointermove', d.move)
    removeEventListener('pointerup', d.up)
    removeEventListener('pointercancel', d.cancel)
    cancelAnimationFrame(d.raf)
    if (d.active) {
      // Ghost element o'z joyiga "qo'nadi"
      const el = containerRef.current?.querySelector(`[data-sort-id="${CSS.escape(d.id)}"]`)
      const r = el?.getBoundingClientRect()
      if (r && d.ghost) {
        Object.assign(d.ghost.style, { transition: 'left .15s, top .15s, transform .15s', left: `${r.left}px`, top: `${r.top}px`, transform: 'none' })
        setTimeout(() => { d.ghost.remove(); el.classList.remove('sort-placeholder') }, 150)
      } else {
        d.ghost?.remove(); el?.classList.remove('sort-placeholder')
      }
      // Drag'dan keyingi "click" taomni ochib yubormasin
      const stop = e => { e.stopPropagation(); e.preventDefault() }
      addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => removeEventListener('click', stop, { capture: true }), 50)
      if (!cancelled) cb.current.onDrop?.()
    }
    drag.current = null
  }, [])

  const start = useCallback(e => {
    if (!enabled || drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    const el = e.currentTarget
    const d = { id: el.dataset.sortId, el, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false }
    d.move = ev => {
      d.x = ev.clientX; d.y = ev.clientY
      if (!d.active) {
        if (Math.hypot(d.x - d.startX, d.y - d.startY) < THRESHOLD) return
        begin(d)
      }
      ev.preventDefault()
      d.ghost.style.left = `${d.x - d.offX}px`
      d.ghost.style.top = `${d.y - d.offY}px`
      hitTest(d.x, d.y)
    }
    d.up = () => end(false)
    d.cancel = () => end(true)
    drag.current = d
    addEventListener('pointermove', d.move, { passive: false })
    addEventListener('pointerup', d.up)
    addEventListener('pointercancel', d.cancel)
  }, [enabled, hitTest, end])

  useEffect(() => () => end(true), [end])

  return { containerRef, start }
}

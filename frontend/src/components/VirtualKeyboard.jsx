import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Delete, ChevronDown, ArrowBigUp, CornerDownLeft } from 'lucide-react'

// ── Ekran klaviaturasi (monoblok, sensorli ekran) ──────────────────────────
// Kassa / ofitsant ilovasi sensorli ekranda ochilganda: input bosilsa pastdan chiqadi, sahifa va
// oynalar uning ustiga suriladi (--kbd-h), Windows'ning o'z klaviaturasi chiqmaydi (inputmode=none).
// Raqamli maydonlarda — katta raqamlar paneli. Yoqish/o'chirish: Profil → «Ekran klaviaturasi».

const KEY = 'rp_vkbd'   // '1' — doim, '0' — hech qachon, yo'q — avtomatik
const touchScreen = () => navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches
export const vkbdPref = () => { try { return localStorage.getItem(KEY) } catch { return null } }
export const setVkbdPref = v => { try { v === null ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, v) } catch {} window.dispatchEvent(new Event('rp:vkbd')) }
export const vkbdEnabled = () => {
  const p = vkbdPref()
  if (p === '1') return true
  if (p === '0') return false
  return !!window.rpNative && touchScreen()   // avtomatik: ilova + sensorli ekran
}

const TEXT_TYPES = ['text', 'search', 'password', 'email', 'url', 'tel', 'number', '']
const editable = el => el && !el.readOnly && !el.disabled && !el.closest?.('[data-no-vkbd]') &&
  (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXT_TYPES.includes((el.getAttribute('type') || '').toLowerCase())))
const numeric = el => ['number', 'tel'].includes(el.type) || ['numeric', 'decimal', 'tel'].includes(el.dataset.vkbdMode || el.getAttribute('inputmode'))

const LETTERS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "o'"],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', "g'", 'back'],
]
const SYMBOLS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '+', '@', '"', "'"],
  ['#', '%', '*', '=', '_', '!', '?', ',', '.', 'back'],
]
const DIGITS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['.', '0', 'back']]

// Qiymatni React bilgan holda o'zgartirish (onChange ishlashi uchun) — prototype setter + input hodisasi
function setValue(el, value, caret) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  if (caret !== undefined) try { el.setSelectionRange(caret, caret) } catch {}
}
function caretOf(el) {
  try { if (el.selectionStart !== null) return [el.selectionStart, el.selectionEnd] } catch {}
  return [el.value.length, el.value.length]   // type=number — tanlov yo'q, oxiriga
}
function insert(el, text) {
  const [a, b] = caretOf(el)
  let v = el.value.slice(0, a) + text + el.value.slice(b)
  if (el.maxLength > 0 && v.length > el.maxLength) return
  if (el.type === 'number' && text === '.' && el.value.includes('.')) return
  setValue(el, v, a + text.length)
}
function backspace(el) {
  const [a, b] = caretOf(el)
  if (a !== b) return setValue(el, el.value.slice(0, a) + el.value.slice(b), a)
  if (!a) return
  const chars = [...el.value.slice(0, a)]
  chars.pop()
  const head = chars.join('')
  setValue(el, head + el.value.slice(a), head.length)
}

export default function VirtualKeyboard() {
  const [on, setOn] = useState(vkbdEnabled)
  const [target, setTarget] = useState(null)
  const [layer, setLayer] = useState('abc')
  const [shift, setShift] = useState(0)   // 0 — kichik, 1 — bitta katta, 2 — Caps
  const ref = useRef()
  const lastShift = useRef(0)
  const repeat = useRef()

  useEffect(() => {
    const upd = () => setOn(vkbdEnabled())
    window.addEventListener('rp:vkbd', upd)
    return () => window.removeEventListener('rp:vkbd', upd)
  }, [])

  // Qaysi maydon tanlandi
  useEffect(() => {
    if (!on) { setTarget(null); return }
    let hideTimer
    const focusIn = e => {
      const el = e.target
      if (!editable(el)) return
      clearTimeout(hideTimer)
      if (!el.dataset.vkbdMode) el.dataset.vkbdMode = el.getAttribute('inputmode') || ''
      el.setAttribute('inputmode', 'none')   // Windows sensorli klaviaturasi ochilmasin
      setTarget(el); setLayer(numeric(el) ? 'num' : 'abc')
      setShift(el.value ? 0 : el.type === 'password' || el.type === 'email' ? 0 : 1)
    }
    const focusOut = e => {
      if (!editable(e.target)) return
      hideTimer = setTimeout(() => { if (!editable(document.activeElement)) setTarget(null) }, 120)
    }
    document.addEventListener('focusin', focusIn)
    document.addEventListener('focusout', focusOut)
    if (editable(document.activeElement)) focusIn({ target: document.activeElement })
    return () => { document.removeEventListener('focusin', focusIn); document.removeEventListener('focusout', focusOut); clearTimeout(hideTimer) }
  }, [on])

  // Sahifa va oynalar klaviatura ustiga suriladi; yozilayotgan maydon ko'rinib tursin
  useEffect(() => {
    const root = document.documentElement
    if (!target) { root.style.setProperty('--kbd-h', '0px'); root.classList.remove('vkbd-open'); return }
    const h = ref.current?.offsetHeight || 0
    root.style.setProperty('--kbd-h', h + 'px'); root.classList.add('vkbd-open')
    const t = setTimeout(() => target.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 60)
    return () => clearTimeout(t)
  }, [target, layer])
  useEffect(() => () => { document.documentElement.style.setProperty('--kbd-h', '0px'); document.documentElement.classList.remove('vkbd-open') }, [])

  if (!on || !target) return null

  const press = k => {
    const el = target
    if (!document.contains(el)) return setTarget(null)
    if (k === 'back') return backspace(el)
    if (k === 'shift') {
      const now = Date.now()
      setShift(s => (s === 0 ? (now - lastShift.current < 350 ? 2 : 1) : s === 1 && now - lastShift.current < 350 ? 2 : 0))
      lastShift.current = now
      return
    }
    if (k === 'enter') {
      if (el.tagName === 'TEXTAREA') return insert(el, '\n')
      const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
      el.dispatchEvent(ev)
      if (!ev.defaultPrevented && el.form) el.form.requestSubmit?.()
      else if (!el.form) el.blur()
      return
    }
    if (k === 'space') return insert(el, ' ')
    let ch = k
    if (layer === 'abc' && shift) ch = k.charAt(0).toUpperCase() + k.slice(1)
    insert(el, ch)
    if (shift === 1) setShift(0)
  }
  // Bosilganda fokus inputdan ketmasin; o'chirish tugmasi bosib turilsa takrorlanadi
  const down = k => e => {
    e.preventDefault()
    press(k)
    if (k === 'back') {
      clearTimeout(repeat.current)
      const loop = (ms) => { repeat.current = setTimeout(() => { press('back'); loop(60) }, ms) }
      loop(420)
    }
  }
  const up = () => clearTimeout(repeat.current)
  const close = e => { e.preventDefault(); target.blur(); setTarget(null) }

  const Key = ({ k, className = '', children, wide }) => (
    <button type="button" tabIndex={-1} className={`vk ${className}`} style={wide ? { flex: wide } : undefined}
      onPointerDown={down(k)} onPointerUp={up} onPointerLeave={up} onContextMenu={e => e.preventDefault()}>
      {children ?? (layer === 'abc' && shift ? k.charAt(0).toUpperCase() + k.slice(1) : k)}
    </button>
  )

  const rows = layer === 'num' ? DIGITS : layer === 'sym' ? SYMBOLS : LETTERS
  return createPortal(
    <div ref={ref} className={`vkbd ${layer === 'num' ? 'vkbd-num' : ''}`} onPointerDown={e => e.preventDefault()}>
      <div className="vkbd-in">
        {rows.map((r, i) => (
          <div key={i} className="vk-row">
            {r.map(k => k === 'back'
              ? <Key key={k} k="back" className="vk-fn" wide={layer === 'num' ? 1 : 1.5}><Delete size={24}/></Key>
              : k === 'shift'
                ? <Key key={k} k="shift" className={`vk-fn ${shift ? 'vk-on' : ''} ${shift === 2 ? 'vk-caps' : ''}`} wide={1.5}><ArrowBigUp size={24} fill={shift ? 'currentColor' : 'none'}/></Key>
                : <Key key={k} k={k}/>)}
          </div>
        ))}
        <div className="vk-row">
          {layer !== 'num' && <Key k="layer" className="vk-fn" wide={1.5}>
            <span onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setLayer(l => (l === 'abc' ? 'sym' : 'abc')) }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{layer === 'abc' ? '123' : 'ABC'}</span>
          </Key>}
          {layer === 'num' && !numeric(target) && <Key k="layer" className="vk-fn">
            <span onPointerDown={e => { e.preventDefault(); e.stopPropagation(); setLayer('abc') }}
              style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>ABC</span>
          </Key>}
          {layer !== 'num' && <Key k="," className="vk-fn">,</Key>}
          {layer !== 'num' && <Key k="space" className="vk-space" wide={5}>bo'sh joy</Key>}
          {layer !== 'num' && <Key k="." className="vk-fn">.</Key>}
          <Key k="enter" className="vk-go" wide={layer === 'num' ? 2 : 2}>
            {target.tagName === 'TEXTAREA' ? <CornerDownLeft size={22}/> : 'Tayyor'}
          </Key>
          <button type="button" tabIndex={-1} className="vk vk-fn" onPointerDown={close} title="Yopish"><ChevronDown size={24}/></button>
        </div>
      </div>
    </div>,
    document.body
  )
}

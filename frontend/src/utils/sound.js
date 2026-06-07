let ctx = null
let out = null
let enabled = localStorage.getItem('rp_ui_sound') !== 'false'
let lastPlay = 0

const customAudios = {}
let customUrls = {}

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    out = ctx.createDynamicsCompressor()
    out.threshold.value = -20
    out.knee.value = 10
    out.ratio.value = 4
    out.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function partial(freq, t, dur, vol, type = 'sine') {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.003)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(out)
  osc.start(t)
  osc.stop(t + dur + 0.01)
}

function impulse(t, dur, vol, freq, q = 1.8) {
  const len = Math.ceil(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp)
  bp.connect(g)
  g.connect(out)
  src.start(t)
  src.stop(t + dur + 0.01)
}

function chirp(fromHz, toHz, t, dur, vol) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(fromHz, t)
  osc.frequency.exponentialRampToValueAtTime(toHz, t + dur * 0.7)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(out)
  osc.start(t)
  osc.stop(t + dur + 0.01)
}

const SOUNDS = {
  tick(t) {
    impulse(t, 0.02, 0.035, 3800, 2.2)
    partial(3000, t, 0.022, 0.018)
  },
  nav(t) {
    chirp(650, 1300, t, 0.055, 0.025)
  },
  confirm(t) {
    partial(880, t, 0.24, 0.04)
    partial(1760, t, 0.14, 0.012)
    partial(2640, t + 0.008, 0.09, 0.006)
    partial(1109, t + 0.065, 0.22, 0.032)
  },
  success(t) {
    partial(1047, t, 0.3, 0.035)
    partial(1319, t + 0.065, 0.26, 0.03)
    partial(1568, t + 0.13, 0.24, 0.035)
    partial(2093, t + 0.19, 0.32, 0.022)
    partial(3136, t + 0.19, 0.18, 0.008)
  },
  warn(t) {
    partial(340, t, 0.17, 0.04, 'triangle')
    partial(265, t + 0.085, 0.21, 0.035, 'triangle')
    partial(680, t, 0.07, 0.008)
  },
}

export function loadCustomSounds(urls, apiUrl = '') {
  customUrls = urls || {}
  Object.keys(customAudios).forEach(k => delete customAudios[k])
  Object.entries(customUrls).forEach(([key, url]) => {
    if (url) {
      const fullUrl = url.startsWith('http') ? url : `${apiUrl}${url}`
      const a = new Audio(fullUrl)
      a.preload = 'auto'
      customAudios[key] = a
    }
  })
}

export function getNewOrderSoundUrl(apiUrl = '') {
  if (customUrls.newOrder) {
    return customUrls.newOrder.startsWith('http')
      ? customUrls.newOrder
      : `${apiUrl}${customUrls.newOrder}`
  }
  return '/sounds/new-order.mp3'
}

export function previewSound(kind) {
  if (customAudios[kind]) {
    const a = customAudios[kind].cloneNode()
    a.play().catch(() => {})
    return
  }
  const c = getCtx()
  if (!c) return
  const fn = SOUNDS[kind]
  if (fn) fn(c.currentTime + 0.001)
}

export function playSound(kind = 'tick') {
  if (!enabled) return
  const now = performance.now()
  if (now - lastPlay < 35) return
  lastPlay = now

  if (customAudios[kind]) {
    const a = customAudios[kind].cloneNode()
    a.play().catch(() => {})
    return
  }

  const c = getCtx()
  if (!c) return
  const fn = SOUNDS[kind] || SOUNDS.tick
  fn(c.currentTime + 0.001)
}

export function isSoundEnabled() { return enabled }

export function setSoundEnabled(v) {
  enabled = !!v
  localStorage.setItem('rp_ui_sound', String(enabled))
  if (enabled) { lastPlay = 0; playSound('confirm') }
}

export function soundForElement(el) {
  if (!el) return null
  const explicit = el.getAttribute('data-sound')
  if (explicit) return explicit
  const cl = el.classList
  if (cl.contains('btn-danger')) return 'warn'
  if (cl.contains('btn-primary') || cl.contains('btn-accent') ||
      cl.contains('adm-btn-primary') || cl.contains('wai-btn-primary')) return 'confirm'
  if (el.tagName === 'A') return 'nav'
  return 'tick'
}

export function hasCustomSound(kind) {
  return !!customUrls[kind]
}

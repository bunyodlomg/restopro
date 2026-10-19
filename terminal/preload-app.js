// Ofitsant terminali oynasi: chek chop etish va terminal rejimi belgisi.
// "terminal" ko'prigi offline sahifa (qayta urinish / manzilni o'zgartirish) uchun.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rpNative', {
  app: 'terminal',
  terminal: true,
  print: (html, opts) => ipcRenderer.invoke('rp:print', html, opts || {}),
  // Avtomatik yangilanish: holat, tekshirish, o'rnatish va o'zgarishga obuna
  update: {
    get:     () => ipcRenderer.invoke('rp:update:get'),
    check:   () => ipcRenderer.invoke('rp:update:check'),
    install: () => ipcRenderer.invoke('rp:update:install'),
    onChange: cb => {
      const h = (_e, s) => cb(s)
      ipcRenderer.on('rp:update', h)
      return () => ipcRenderer.removeListener('rp:update', h)
    },
  },
})
contextBridge.exposeInMainWorld('terminal', {
  get:   () => ipcRenderer.invoke('term:get'),
  retry: () => ipcRenderer.invoke('term:retry'),
  setup: () => ipcRenderer.invoke('term:setup'),
})

// Ofitsant terminali oynasi: chek chop etish va terminal rejimi belgisi.
// "terminal" ko'prigi offline sahifa (qayta urinish / manzilni o'zgartirish) uchun.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rpNative', {
  app: 'terminal',
  terminal: true,
  print: (html, opts) => ipcRenderer.invoke('rp:print', html, opts || {}),
})
contextBridge.exposeInMainWorld('terminal', {
  get:   () => ipcRenderer.invoke('term:get'),
  retry: () => ipcRenderer.invoke('term:retry'),
  setup: () => ipcRenderer.invoke('term:setup'),
})

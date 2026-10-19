// Sozlash va offline sahifalari uchun ko'prik
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('terminal', {
  get:   ()     => ipcRenderer.invoke('term:get'),
  test:  (url)  => ipcRenderer.invoke('term:test', url),
  save:  (data) => ipcRenderer.invoke('term:save', data),
  retry: ()     => ipcRenderer.invoke('term:retry'),
  setup: ()     => ipcRenderer.invoke('term:setup'),
})

// Setup oynasi uchun xavfsiz ko'prik (faqat kerakli funksiyalar)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kassa', {
  get:  ()     => ipcRenderer.invoke('kassa:get'),
  test: (data) => ipcRenderer.invoke('kassa:test', data),
  save: (data) => ipcRenderer.invoke('kassa:save', data),
  open: ()     => ipcRenderer.invoke('kassa:open'),
})

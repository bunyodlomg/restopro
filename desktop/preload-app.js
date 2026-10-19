// Asosiy (kassa) oynasi uchun ko'prik: chekni to'g'ridan-to'g'ri printerga chiqarish
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rpNative', {
  app: 'kassa',
  terminal: false,
  print: (html, opts) => ipcRenderer.invoke('rp:print', html, opts || {}),
})

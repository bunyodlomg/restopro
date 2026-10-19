// Asosiy (kassa) oynasi uchun ko'prik: chekni to'g'ridan-to'g'ri printerga chiqarish
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rpNative', {
  app: 'kassa',
  terminal: false,
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

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (text) => ipcRenderer.invoke('send-to-gemini', text)
});
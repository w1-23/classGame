const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('learningBridge', {
  async loadPacks() {
    return ipcRenderer.invoke('learning:load-packs');
  }
});

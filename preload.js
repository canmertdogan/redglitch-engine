
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    unmaximize: () => ipcRenderer.send('window-unmaximize'),
    resize: (w, h) => ipcRenderer.send('window-resize', w, h),
    close: () => ipcRenderer.send('window-close'),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    showItemInFolder: (path) => ipcRenderer.send('show-item-in-folder', path),
    openDevTools: () => ipcRenderer.send('open-devtools')
});

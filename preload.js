
const { contextBridge, ipcRenderer } = require('electron');

function clampSize(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function isHttpUrl(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    unmaximize: () => ipcRenderer.send('window-unmaximize'),
    resize: (w, h) => {
        const width = clampSize(w, 800, 200, 3840);
        const height = clampSize(h, 600, 200, 2160);
        ipcRenderer.send('window-resize', width, height);
    },
    close: () => ipcRenderer.send('window-close'),
    openExternal: (url) => {
        if (typeof url === 'string' && isHttpUrl(url)) {
            ipcRenderer.send('open-external', url);
        }
    },
    showItemInFolder: (filePath) => {
        if (typeof filePath === 'string') {
            ipcRenderer.send('show-item-in-folder', filePath);
        }
    },
    openDevTools: () => ipcRenderer.send('open-devtools'),
    cortexStart: () => ipcRenderer.invoke('cortex-start'),
    cortexStop: () => ipcRenderer.invoke('cortex-stop')
});

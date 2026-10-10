const { contextBridge, ipcRenderer, webUtils } = require('electron');

// API segura exposta para a interface (window.klipo)
contextBridge.exposeInMainWorld('klipo', {
  openVideos: () => ipcRenderer.invoke('dialog:openVideos'),
  probe: (filePath) => ipcRenderer.invoke('media:probe', filePath),
  chooseExportPath: (name) => ipcRenderer.invoke('dialog:saveExport', name),
  startExport: (job) => ipcRenderer.invoke('export:start', job),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExportProgress: (cb) => {
    const handler = (_e, pct) => cb(pct);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },
  onOpenFiles: (cb) => {
    const handler = (_e, files) => cb(files);
    ipcRenderer.on('app:openFiles', handler);
    return () => ipcRenderer.removeListener('app:openFiles', handler);
  },
  showInFolder: (p) => ipcRenderer.invoke('shell:showItem', p),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
});

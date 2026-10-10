const { contextBridge, ipcRenderer, webUtils } = require('electron');

const listen = (channel) => (cb) => {
  const handler = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

// API segura exposta para a interface (window.kortin)
contextBridge.exposeInMainWorld('kortin', {
  // mídia
  openVideos: () => ipcRenderer.invoke('dialog:openVideos'),
  probe: (filePath) => ipcRenderer.invoke('media:probe', filePath),
  peaks: (filePath) => ipcRenderer.invoke('media:peaks', filePath),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },

  // projetos
  openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
  saveProject: (data, filePath, saveAs) => ipcRenderer.invoke('project:save', { data, filePath, saveAs }),
  autosaveWrite: (data) => ipcRenderer.invoke('autosave:write', data),
  autosaveRead: () => ipcRenderer.invoke('autosave:read'),
  autosaveClear: () => ipcRenderer.invoke('autosave:clear'),
  setDirty: (dirty, title) => ipcRenderer.send('app:dirty', dirty, title),
  pendingFiles: () => ipcRenderer.invoke('app:pendingFiles'),
  onOpenFiles: listen('app:openFiles'),

  // exportação
  chooseExportPath: (name) => ipcRenderer.invoke('dialog:saveExport', name),
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  joinPath: (dir, name) => ipcRenderer.invoke('path:join', dir, name),
  hardwareEncoders: () => ipcRenderer.invoke('export:hardware'),
  onExportEncoder: listen('export:encoder'),
  startExport: (job) => ipcRenderer.invoke('export:start', job),
  cancelExport: () => ipcRenderer.invoke('export:cancel'),
  onExportProgress: listen('export:progress'),
  showInFolder: (p) => ipcRenderer.invoke('shell:showItem', p),

  // app
  version: () => ipcRenderer.invoke('app:version'),
  onUpdateReady: listen('update:ready'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});

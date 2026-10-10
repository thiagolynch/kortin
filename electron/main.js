const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const engine = require('./engine');

// Protocolo "media://" para o preview tocar arquivos locais com segurança
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
]);

const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'mts', 'm2ts', '3gp'];
const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.3gp': 'video/3gpp',
};

// Só arquivos que o usuário importou podem ser lidos pelo preview
const allowedFiles = new Set();
let mainWindow = null;
let currentExport = null;

function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname.slice(1));
      if (!allowedFiles.has(filePath)) return new Response('Acesso negado', { status: 403 });

      const { size } = await fs.promises.stat(filePath);
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const range = request.headers.get('range');

      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : size - 1;
        if (!m[1] && m[2]) {
          start = Math.max(0, size - parseInt(m[2], 10));
          end = size - 1;
        }
        end = Math.min(end, size - 1);
        if (start > end) return new Response(null, { status: 416 });
        const stream = fs.createReadStream(filePath, { start, end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: {
            'Content-Type': type,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
        status: 200,
        headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
      });
    } catch (err) {
      return new Response(String(err.message || err), { status: 500 });
    }
  });
}

function filesFromArgv(argv) {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && VIDEO_EXT.includes(path.extname(a).slice(1).toLowerCase()))
    .map((a) => path.resolve(a))
    .filter((a) => fs.existsSync(a));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Klipo',
    backgroundColor: '#0e0f13',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links externos abrem no navegador, nunca dentro do app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // "Abrir com Klipo": vídeos passados na linha de comando entram no projeto
  mainWindow.webContents.once('did-finish-load', () => {
    const files = filesFromArgv(process.argv);
    if (files.length) mainWindow.webContents.send('app:openFiles', files);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---------- IPC ----------

ipcMain.handle('dialog:openVideos', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Importar vídeos',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Vídeos', extensions: VIDEO_EXT },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('media:probe', async (_e, filePath) => {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    throw new Error('Arquivo não encontrado.');
  }
  const info = await engine.probe(filePath);
  const thumb = await engine.thumbnail(filePath, Math.min(1, info.duration / 2));
  allowedFiles.add(filePath);
  return { ...info, path: filePath, name: path.basename(filePath), thumb };
});

ipcMain.handle('dialog:saveExport', async (_e, suggestedName) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar vídeo',
    defaultPath: path.join(app.getPath('videos'), suggestedName || 'klipo-video.mp4'),
    filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
  });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle('export:start', async (event, job) => {
  if (currentExport) throw new Error('Já existe uma exportação em andamento.');
  for (const c of job.clips) {
    if (!allowedFiles.has(c.path)) throw new Error('Arquivo não autorizado na linha do tempo.');
  }
  let last = -1;
  currentExport = engine.exportVideo(job.clips, job.options, (p) => {
    const pct = Math.round(p * 1000) / 10;
    if (pct !== last) {
      last = pct;
      event.sender.send('export:progress', pct);
    }
  });
  try {
    return await currentExport.promise;
  } finally {
    currentExport = null;
  }
});

ipcMain.handle('export:cancel', () => {
  if (currentExport) currentExport.cancel();
  return true;
});

ipcMain.handle('shell:showItem', (_e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
});

// ---------- Ciclo de vida ----------

app.whenReady().then(() => {
  registerMediaProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (currentExport) currentExport.cancel();
  if (process.platform !== 'darwin') app.quit();
});

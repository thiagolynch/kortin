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
const PROJECT_EXT = 'kortin';
const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.3gp': 'video/3gpp',
};

// Só arquivos que o usuário importou podem ser lidos pelo preview
const allowedFiles = new Set();
let mainWindow = null;
let currentExport = null;
let isDirty = false;
let pendingOpen = [];

const autosavePath = () => path.join(app.getPath('userData'), 'recuperacao.kortin');

// ---------- Uma única janela: "Abrir com Kortin" reaproveita o app aberto ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const files = filesFromArgv(argv);
    if (files.length) mainWindow.webContents.send('app:openFiles', files);
  });
}

function filesFromArgv(argv) {
  const exts = [...VIDEO_EXT, PROJECT_EXT];
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && exts.includes(path.extname(a).slice(1).toLowerCase()))
    .map((a) => path.resolve(a))
    .filter((a) => fs.existsSync(a));
}

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Kortin',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
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

  // Arquivos passados ao abrir ("Abrir com Kortin" ou duplo clique em um .kortin)
  pendingOpen = filesFromArgv(process.argv);

  // Aviso ao fechar com alterações não salvas
  mainWindow.on('close', (e) => {
    if (!isDirty) {
      try { fs.unlinkSync(autosavePath()); } catch {}
      return;
    }
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Voltar ao projeto', 'Sair mesmo assim'],
      defaultId: 0,
      cancelId: 0,
      title: 'Projeto não salvo',
      message: 'Você tem alterações não salvas.',
      detail: 'Se sair agora, o Kortin vai oferecer a recuperação deste projeto na próxima vez que abrir.',
    });
    if (choice === 0) e.preventDefault();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ---------- Mídia ----------

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

// ---------- Projetos ----------

function readProject(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data?.app !== 'kortin' || !Array.isArray(data.clips)) {
    throw new Error('Este arquivo não é um projeto do Kortin.');
  }
  return data;
}

ipcMain.handle('project:open', async (_e, filePath) => {
  let file = filePath;
  if (!file) {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Abrir projeto',
      properties: ['openFile'],
      filters: [{ name: 'Projeto Kortin', extensions: [PROJECT_EXT] }],
    });
    if (res.canceled) return null;
    file = res.filePaths[0];
  }
  return { path: file, data: readProject(file) };
});

ipcMain.handle('project:save', async (_e, { data, filePath, saveAs }) => {
  let file = filePath;
  if (!file || saveAs) {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar projeto',
      defaultPath: file || path.join(app.getPath('documents'), 'Meu projeto.kortin'),
      filters: [{ name: 'Projeto Kortin', extensions: [PROJECT_EXT] }],
    });
    if (res.canceled) return null;
    file = res.filePath;
  }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file); // grava em duas etapas para nunca corromper o arquivo
  return file;
});

ipcMain.handle('autosave:write', (_e, data) => {
  try {
    const tmp = `${autosavePath()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, autosavePath());
  } catch {}
});

ipcMain.handle('autosave:read', () => {
  try {
    const stat = fs.statSync(autosavePath());
    return { savedAt: stat.mtimeMs, data: readProject(autosavePath()) };
  } catch {
    return null;
  }
});

ipcMain.handle('autosave:clear', () => {
  try { fs.unlinkSync(autosavePath()); } catch {}
});

ipcMain.on('app:dirty', (_e, dirty, title) => {
  isDirty = !!dirty;
  if (mainWindow && title) mainWindow.setTitle(title);
});

ipcMain.handle('app:pendingFiles', () => {
  const files = pendingOpen;
  pendingOpen = [];
  return files;
});

// ---------- Exportação ----------

ipcMain.handle('dialog:saveExport', async (_e, suggestedName) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Exportar vídeo',
    defaultPath: path.join(app.getPath('videos'), suggestedName || 'kortin-video.mp4'),
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

// Janela principal com as proteções recomendadas pelo guia de segurança do Electron.
const fs = require('fs');
const path = require('path');
const { BrowserWindow, dialog, session, shell, app } = require('electron');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

function harden() {
  // Nenhuma permissão de navegador (câmera, microfone, localização, notificações web...)
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
    // Arrastar um link ou um .html para a janela não pode tirar o usuário do editor
    contents.on('will-navigate', (ev, url) => {
      if (!DEV_URL || !url.startsWith(DEV_URL)) ev.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

function create(ctx) {
  const win = new BrowserWindow({
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
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.on('close', (e) => {
    const { state } = ctx;
    if (state.currentExport) {
      const stop = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Continuar exportando', 'Cancelar e sair'],
        defaultId: 0,
        cancelId: 0,
        title: 'Exportação em andamento',
        message: 'Um vídeo ainda está sendo exportado.',
        detail: 'Se sair agora, a exportação é cancelada.',
      });
      if (stop === 0) return e.preventDefault();
      state.currentExport.cancel();
    }
    if (!state.isDirty) {
      try { fs.unlinkSync(ctx.autosavePath()); } catch { /* não havia */ }
      return undefined;
    }
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Voltar ao projeto', 'Sair mesmo assim'],
      defaultId: 0,
      cancelId: 0,
      title: 'Projeto não salvo',
      message: 'Você tem alterações não salvas.',
      detail: 'Se sair agora, o Kortin vai oferecer a recuperação deste projeto na próxima vez que abrir.',
    });
    if (choice === 0) e.preventDefault();
    return undefined;
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

module.exports = { harden, create };

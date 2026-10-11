// Ponto de entrada do processo principal: só monta as peças.
//   core/      → segurança (validação, autorizações) e log
//   services/  → FFmpeg, legenda, projetos, protocolo de mídia, atualização, limpeza
//   ipc/       → canais que a interface pode chamar (todos validados)
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const log = require('./core/logger');
const { Grants, isVideoPath, isProjectPath, assertLocalPath } = require('./core/security');
const mediaProtocol = require('./services/mediaProtocol');
const tempCleanup = require('./services/tempCleanup');
const updater = require('./services/updater');
const windowFactory = require('./window');

const ctx = {
  grants: new Grants(),
  state: { currentExport: null, currentStt: null, downloadAbort: null, isDirty: false, pendingOpen: [] },
  win: null,
  window: () => ctx.win,
  send: (channel, payload) => ctx.win?.webContents.send(channel, payload),
};

/** Arquivos recebidos pela linha de comando ("Abrir com Kortin"): autoriza e devolve os válidos. */
function filesFromArgv(argv) {
  const out = [];
  for (const a of argv.slice(1)) {
    if (a.startsWith('-')) continue;
    try {
      const p = assertLocalPath(path.resolve(a));
      if (!fs.existsSync(p)) continue;
      if (isVideoPath(p)) ctx.grants.allowMedia(p);
      else if (isProjectPath(p)) ctx.grants.allowProject(p);
      else continue;
      out.push(p);
    } catch { /* recusado */ }
  }
  return out;
}

mediaProtocol.registerPrivileged();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const win = ctx.win;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const files = filesFromArgv(argv);
    if (files.length) ctx.send('app:openFiles', files);
  });

  process.on('uncaughtException', (err) => log.error('main', 'exceção não tratada', err));
  process.on('unhandledRejection', (err) => log.error('main', 'promessa rejeitada sem tratamento', err));

  app.whenReady().then(() => {
    log.init(path.join(app.getPath('userData'), 'logs'));
    log.info('main', `Kortin ${app.getVersion()} iniciando`);
    windowFactory.harden();
    mediaProtocol.register(ctx.grants);

    require('./ipc/media').register(ctx);
    require('./ipc/project').register(ctx);
    require('./ipc/export').register(ctx);
    require('./ipc/captions').register(ctx);
    require('./ipc/highlights').register(ctx);
    require('./ipc/app').register(ctx);

    tempCleanup.cleanup(ctx.modelsDir());
    ctx.state.pendingOpen = filesFromArgv(process.argv);
    ctx.win = windowFactory.create(ctx);
    updater.setup(ctx.send);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) ctx.win = windowFactory.create(ctx);
    });
  });

  app.on('window-all-closed', () => {
    ctx.state.currentExport?.cancel();
    ctx.state.currentStt?.cancel();
    if (process.platform !== 'darwin') app.quit();
  });
}

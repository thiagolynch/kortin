// Informações do app e atualização.
const fs = require('fs');
const path = require('path');
const { app, ipcMain, shell } = require('electron');
const updater = require('../services/updater');
const { handle } = require('./handle');

function register(ctx) {
  handle('app:version', async () => app.getVersion());
  handle('update:install', async () => updater.install());
  // Pasta fixa (nunca vem do renderer): licenças e oferta de código-fonte dos componentes de terceiros
  handle('app:openLicenses', async () => {
    const dir = app.isPackaged ? path.join(process.resourcesPath, 'licenses') : path.join(__dirname, '..', '..', 'licenses');
    const file = path.join(dir, 'AVISOS-DE-TERCEIROS.txt');
    const err = await shell.openPath(fs.existsSync(file) ? file : dir);
    return !err;
  });
  ipcMain.on('app:dirty', (_e, dirty, title) => {
    ctx.state.isDirty = !!dirty;
    const win = ctx.window();
    if (win && typeof title === 'string') win.setTitle(title.slice(0, 200));
  });
}

module.exports = { register };

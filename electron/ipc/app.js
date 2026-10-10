// Informações do app e atualização.
const { app, ipcMain } = require('electron');
const updater = require('../services/updater');
const { handle } = require('./handle');

function register(ctx) {
  handle('app:version', async () => app.getVersion());
  handle('update:install', async () => updater.install());
  ipcMain.on('app:dirty', (_e, dirty, title) => {
    ctx.state.isDirty = !!dirty;
    const win = ctx.window();
    if (win && typeof title === 'string') win.setTitle(title.slice(0, 200));
  });
}

module.exports = { register };

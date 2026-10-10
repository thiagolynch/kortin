// Atualização automática pelo GitHub Releases (só na versão instalada).
const { app } = require('electron');
const log = require('../core/logger');

let updater = null;

function setup(send) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch (err) {
    log.warn('updater', 'electron-updater indisponível', err);
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-downloaded', (info) => send('update:ready', { version: info.version }));
  updater.on('error', (err) => log.warn('updater', 'falha ao verificar atualização', err));
  updater.checkForUpdates().catch(() => {});
}

function install() {
  if (updater) updater.quitAndInstall();
}

module.exports = { setup, install };

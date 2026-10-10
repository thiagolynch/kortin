// Registro de canais IPC com tratamento de erro padronizado:
// erros esperados (validação) chegam ao usuário com a mensagem; inesperados vão para o log.
const { ipcMain } = require('electron');
const log = require('../core/logger');

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      if (!err?.userFacing) log.error('ipc', `${channel} falhou`, err);
      // só a mensagem atravessa o IPC (nada de stack com caminhos internos)
      throw new Error(err?.message || 'Erro inesperado.');
    }
  });
}

module.exports = { handle };

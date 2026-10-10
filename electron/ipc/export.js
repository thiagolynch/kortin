// Exportação: escolha do destino (autorizado pelo usuário), placas de vídeo, fila e cancelamento.
const path = require('path');
const { app, dialog, shell, Notification } = require('electron');
const engine = require('../engine');
const { validateExportJob, ValidationError, assertLocalPath } = require('../core/security');
const { handle } = require('./handle');

const safeName = (name) => path.basename(String(name || 'kortin-video.mp4')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').slice(0, 120) || 'kortin-video.mp4';

function register(ctx) {
  const { grants, state } = ctx;

  handle('dialog:saveExport', async (_e, suggestedName) => {
    const res = await dialog.showSaveDialog(ctx.window(), {
      title: 'Exportar vídeo',
      defaultPath: path.join(app.getPath('videos'), safeName(suggestedName)),
      filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
    });
    if (res.canceled) return null;
    const out = res.filePath.toLowerCase().endsWith('.mp4') ? res.filePath : `${res.filePath}.mp4`;
    grants.allowOutput(out);
    return out;
  });

  handle('dialog:chooseFolder', async () => {
    const res = await dialog.showOpenDialog(ctx.window(), {
      title: 'Escolha a pasta para salvar os vídeos',
      defaultPath: app.getPath('videos'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled) return null;
    grants.allowOutputDir(res.filePaths[0]);
    return res.filePaths[0];
  });

  /** Caminhos de saída dentro de uma pasta já escolhida (substitui o antigo "path:join" genérico). */
  handle('export:outputsInFolder', async (_e, dir, names) => {
    const d = assertLocalPath(dir, 'pasta');
    if (!Array.isArray(names)) throw new ValidationError('Nomes inválidos.');
    return names.slice(0, 16).map((n) => path.join(d, safeName(n)));
  });

  handle('export:hardware', () => engine.detectHardwareEncoders());

  handle('export:start', async (event, rawJob) => {
    if (state.currentExport) throw new ValidationError('Já existe uma exportação em andamento.');
    const job = validateExportJob(rawJob, grants);
    state.currentExport = engine.exportVideo(
      job.clips,
      job.options,
      (p) => event.sender.send('export:progress', Math.round(p * 1000) / 10),
      (encoder) => event.sender.send('export:encoder', encoder)
    );
    try {
      const res = await state.currentExport.promise;
      if (res.ok) {
        grants.allowOutput(res.output); // para "Mostrar na pasta"
        notifyDone(ctx, res.output);
      }
      return res;
    } finally {
      state.currentExport = null;
    }
  });

  handle('export:cancel', async () => {
    state.currentExport?.cancel();
    return true;
  });

  handle('shell:showItem', async (_e, p) => {
    if (grants.hasOutput(p) || grants.hasMedia(p)) shell.showItemInFolder(p);
  });
}

function notifyDone(ctx, output) {
  const win = ctx.window();
  if (!Notification.isSupported() || (win && win.isFocused())) return;
  const n = new Notification({ title: 'Vídeo pronto', body: path.basename(output) });
  n.on('click', () => shell.showItemInFolder(output));
  n.show();
}

module.exports = { register };

// Importação de mídia: diálogo, arquivos arrastados, leitura e onda sonora.
const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const C = require('../../shared/constants.json');
const engine = require('../engine');
const { assertVideoPath, isVideoPath, isProjectPath, assertLocalPath } = require('../core/security');
const { handle } = require('./handle');

function register(ctx) {
  const { grants } = ctx;

  handle('dialog:openVideos', async () => {
    const res = await dialog.showOpenDialog(ctx.window(), {
      title: 'Importar vídeos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Vídeos', extensions: C.VIDEO_EXT }, { name: 'Todos os arquivos', extensions: ['*'] }],
    });
    if (res.canceled) return [];
    const ok = [];
    for (const p of res.filePaths) {
      try {
        const v = assertVideoPath(p);
        grants.allowMedia(v);
        ok.push(v);
      } catch {
        ok.push(p); // o erro aparece na leitura, com a mensagem certa
      }
    }
    return ok;
  });

  /** Arquivos arrastados para a janela: autoriza só vídeos e projetos locais que existem. */
  handle('files:authorize', async (_e, paths) => {
    if (!Array.isArray(paths)) return [];
    const accepted = [];
    for (const raw of paths.slice(0, 500)) {
      try {
        const p = assertLocalPath(raw);
        if (!fs.existsSync(p)) continue;
        if (isVideoPath(p)) grants.allowMedia(p);
        else if (isProjectPath(p)) grants.allowProject(p);
        else continue;
        accepted.push(p);
      } catch { /* caminho recusado: ignora */ }
    }
    return accepted;
  });

  handle('media:probe', async (_e, filePath) => {
    const p = assertVideoPath(filePath);
    if (!grants.hasMedia(p)) throw Object.assign(new Error('Arquivo não autorizado. Importe-o pelo botão Importar.'), { userFacing: true });
    if (!fs.existsSync(p)) throw Object.assign(new Error('Arquivo não encontrado.'), { userFacing: true });
    const info = await engine.probe(p);
    const thumb = await engine.thumbnail(p, Math.min(1, info.duration / 2));
    return { ...info, path: p, name: path.basename(p), thumb };
  });

  handle('media:peaks', async (_e, filePath) => {
    if (!grants.hasMedia(filePath)) return [];
    return engine.audioPeaks(filePath, 50);
  });
}

module.exports = { register };

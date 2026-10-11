// Importação de mídia: diálogo, arquivos arrastados, leitura e onda sonora.
const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const C = require('../../shared/constants.json');
const engine = require('../engine');
const { findByName } = require('../services/projectMedia');
const { createMediaCache } = require('../services/mediaCache');
const {
  assertVideoPath, assertAudioPath, assertMediaPath, isVideoPath, isAudioPath, isProjectPath, assertLocalPath,
} = require('../core/security');
const { handle } = require('./handle');

function register(ctx) {
  const { grants } = ctx;
  const cache = createMediaCache(path.join(app.getPath('userData'), 'cache', 'midia'));

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

  /** Música de fundo: diálogo de áudio; só o arquivo escolhido é autorizado. */
  handle('dialog:openMusic', async () => {
    const res = await dialog.showOpenDialog(ctx.window(), {
      title: 'Escolher música de fundo',
      properties: ['openFile'],
      filters: [{ name: 'Áudio', extensions: C.AUDIO_EXT }],
    });
    if (res.canceled) return null;
    const p = assertAudioPath(res.filePaths[0]);
    grants.allowMedia(p);
    return p;
  });

  handle('media:probeAudio', async (_e, filePath) => {
    const p = assertAudioPath(filePath);
    if (!grants.hasMedia(p)) throw Object.assign(new Error('Arquivo não autorizado.'), { userFacing: true });
    if (!fs.existsSync(p)) throw Object.assign(new Error('Arquivo não encontrado.'), { userFacing: true });
    const meta = await cache.remember('probeAudio', p, () => engine.probeAudio(p));
    return { ...meta, path: p, name: path.basename(p) };
  });

  /** "Localizar…" um vídeo que sumiu: o usuário aponta o arquivo; só ele é autorizado. */
  handle('media:locate', async (_e, name) => {
    const res = await dialog.showOpenDialog(ctx.window(), {
      title: `Localizar ${String(name || 'vídeo').slice(0, 120)}`,
      properties: ['openFile'],
      filters: isAudioPath(String(name || '')) ? [{ name: 'Áudio', extensions: C.AUDIO_EXT }] : [{ name: 'Vídeos', extensions: C.VIDEO_EXT }],
    });
    if (res.canceled) return null;
    const p = assertMediaPath(res.filePaths[0]);
    grants.allowMedia(p);
    return p;
  });

  /** "Procurar numa pasta": acha vários vídeos pelo nome dentro da pasta escolhida (busca limitada). */
  handle('media:searchFolder', async (_e, names) => {
    if (!Array.isArray(names) || !names.length) return { found: {}, complete: true };
    const res = await dialog.showOpenDialog(ctx.window(), { title: 'Procurar os vídeos nesta pasta', properties: ['openDirectory'] });
    if (res.canceled) return null;
    const root = assertLocalPath(res.filePaths[0], 'pasta');
    const clean = names.slice(0, 2000).map((n) => path.basename(String(n))).filter((n) => isVideoPath(n) || isAudioPath(n));
    const { found, complete } = await findByName(root, clean);
    for (const p of Object.values(found)) grants.allowMedia(assertMediaPath(p));
    return { found, complete };
  });

  /** Arquivos arrastados para a janela: autoriza só vídeos e projetos locais que existem. */
  handle('files:authorize', async (_e, paths) => {
    if (!Array.isArray(paths)) return [];
    const accepted = [];
    for (const raw of paths.slice(0, 500)) {
      try {
        const p = assertLocalPath(raw);
        if (!fs.existsSync(p)) continue;
        if (isVideoPath(p) || isAudioPath(p)) grants.allowMedia(p);
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
    // leitura + miniatura ficam em cache (chave inclui tamanho e data: vídeo alterado = recalcula)
    const meta = await cache.remember('probe', p, async () => {
      const info = await engine.probe(p);
      const thumb = await engine.thumbnail(p, Math.min(1, info.duration / 2));
      return { ...info, thumb };
    });
    return { ...meta, path: p, name: path.basename(p) };
  });

  handle('media:peaks', async (_e, filePath) => {
    if (!grants.hasMedia(filePath)) return [];
    // onda sonora: 50 pontos/s (1 h de vídeo ≈ 180 mil números); vazia não é guardada
    return cache.remember('peaks', filePath, async () => {
      const peaks = Array.from(await engine.audioPeaks(filePath, 50));
      return peaks.length ? peaks : null;
    }).then((v) => v || []);
  });
}

module.exports = { register };

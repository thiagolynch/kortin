// Projetos: abrir, salvar, recuperação automática e arquivos recebidos do Windows.
const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const C = require('../../shared/constants.json');
const store = require('../services/projectStore');
const media = require('../services/projectMedia');
const { assertProjectPath, assertVideoPath, ValidationError } = require('../core/security');
const { handle } = require('./handle');
const log = require('../core/logger');

function register(ctx) {
  const { grants, state } = ctx;
  const autosavePath = () => path.join(app.getPath('userData'), 'recuperacao.kortin');

  /** Autoriza os vídeos citados por um projeto; caminhos perigosos (rede) ficam de fora. */
  function grantProjectMedia(data) {
    for (const c of data.clips) {
      try {
        grants.allowMedia(assertVideoPath(c.path));
      } catch (err) {
        log.warn('project', `vídeo recusado no projeto: ${err.message}`);
      }
    }
    return data;
  }

  handle('project:open', async (_e, filePath) => {
    let file;
    if (filePath) {
      file = assertProjectPath(filePath);
      if (!grants.hasProject(file)) throw new ValidationError('Abra o projeto pelo botão Abrir.');
    } else {
      const res = await dialog.showOpenDialog(ctx.window(), {
        title: 'Abrir projeto',
        properties: ['openFile'],
        filters: [{ name: 'Projeto Kortin', extensions: [C.PROJECT_EXT] }],
      });
      if (res.canceled) return null;
      file = assertProjectPath(res.filePaths[0]);
    }
    // acha os vídeos mesmo se a pasta do projeto mudou de lugar ou de computador
    const { data, missing, relinked } = media.resolveMedia(store.readProject(file), file);
    grantProjectMedia(data);
    grants.allowProject(file);
    return { path: file, data, missing, relinked };
  });

  handle('project:save', async (_e, { data, filePath, saveAs } = {}) => {
    store.validateShape(data);
    let file = filePath && !saveAs && grants.hasProject(filePath) ? filePath : null;
    if (!file) {
      const res = await dialog.showSaveDialog(ctx.window(), {
        title: 'Salvar projeto',
        defaultPath: filePath && grants.hasProject(filePath) ? filePath : path.join(app.getPath('documents'), 'Meu projeto.kortin'),
        filters: [{ name: 'Projeto Kortin', extensions: [C.PROJECT_EXT] }],
      });
      if (res.canceled) return null;
      file = assertProjectPath(res.filePath.endsWith(`.${C.PROJECT_EXT}`) ? res.filePath : `${res.filePath}.${C.PROJECT_EXT}`);
    }
    // grava também o caminho relativo de cada vídeo: o projeto continua abrindo se a pasta mudar
    store.writeAtomic(file, media.withRelativePaths({ ...data, version: C.PROJECT_VERSION }, file), true);
    grants.allowProject(file);
    return file;
  });

  handle('autosave:write', async (_e, data) => {
    try {
      store.validateShape(data);
      store.writeAtomic(autosavePath(), data);
    } catch (err) {
      log.warn('autosave', 'não foi possível gravar a recuperação', err);
    }
  });

  handle('autosave:read', async () => {
    try {
      const file = autosavePath();
      const { mtimeMs } = fs.statSync(file);
      const raw = store.readProject(file);
      let projectFile = null;
      try { projectFile = raw._path ? assertProjectPath(raw._path) : null; } catch { /* caminho inválido */ }
      const { data, missing, relinked } = media.resolveMedia(raw, projectFile);
      return { savedAt: mtimeMs, data: grantProjectMedia(data), missing, relinked };
    } catch {
      return null;
    }
  });

  handle('autosave:clear', async () => {
    try { fs.unlinkSync(autosavePath()); } catch { /* não havia */ }
  });

  handle('app:pendingFiles', async () => {
    const files = state.pendingOpen;
    state.pendingOpen = [];
    return files;
  });

  ctx.autosavePath = autosavePath;
}

module.exports = { register };

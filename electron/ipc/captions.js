// Legenda automática: modelos, download e transcrição local.
const fs = require('fs');
const path = require('path');
const { app, net } = require('electron');
const C = require('../../shared/constants.json');
const stt = require('../transcribe');
const { ValidationError } = require('../core/security');
const { handle } = require('./handle');
const log = require('../core/logger');

function register(ctx) {
  const { grants, state } = ctx;
  const modelsDir = () => path.join(app.getPath('userData'), 'modelos');
  const transcriptsDir = () => path.join(app.getPath('userData'), 'transcricoes');
  const assertModel = (key) => {
    if (!Object.prototype.hasOwnProperty.call(stt.MODELS, key)) throw new ValidationError('Modelo de legenda desconhecido.');
    return key;
  };

  handle('captions:status', async () => ({ available: stt.isAvailable(), models: stt.modelStatus(modelsDir()) }));

  handle('captions:download', async (event, key) => {
    assertModel(key);
    if (state.downloadAbort) throw new ValidationError('Já existe um download em andamento.');
    state.downloadAbort = new AbortController();
    try {
      await stt.downloadModel(
        modelsDir(),
        key,
        (p, bytes) => event.sender.send('captions:download-progress', { key, p, bytes }),
        (url, opts) => net.fetch(url, opts),
        state.downloadAbort.signal
      );
      return { ok: true };
    } catch (err) {
      if (state.downloadAbort?.signal.aborted) return { cancelled: true };
      log.warn('captions', 'download do modelo falhou', err);
      throw new ValidationError(`Não foi possível baixar o modelo: ${err.message}`);
    } finally {
      state.downloadAbort = null;
    }
  });

  handle('captions:cancel-download', async () => state.downloadAbort?.abort());

  handle('captions:transcribe', async (event, { filePath, model, language } = {}) => {
    if (!grants.hasMedia(filePath)) throw new ValidationError('Arquivo não autorizado.');
    assertModel(model);
    if (!C.LANGUAGES.includes(language)) throw new ValidationError('Idioma não suportado.');
    if (state.currentStt) throw new ValidationError('Já existe uma transcrição em andamento.');

    const cached = path.join(transcriptsDir(), `${stt.cacheKey(filePath, model, language)}.json`);
    try {
      return JSON.parse(fs.readFileSync(cached, 'utf8'));
    } catch { /* sem cache: transcreve */ }

    let proc = null;
    state.currentStt = { cancel: () => proc && proc.kill('SIGKILL') };
    try {
      const res = await stt.transcribe(filePath, {
        modelsDir: modelsDir(),
        model,
        language,
        onSpawn: (p) => (proc = p),
        onProgress: (p) => event.sender.send('captions:progress', { filePath, p }),
      });
      if (!res.cancelled) {
        fs.mkdirSync(transcriptsDir(), { recursive: true });
        fs.writeFileSync(cached, JSON.stringify(res), 'utf8');
      }
      return res;
    } finally {
      state.currentStt = null;
    }
  });

  handle('captions:cancel', async () => state.currentStt?.cancel());

  ctx.modelsDir = modelsDir;
}

module.exports = { register };

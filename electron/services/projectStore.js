// Leitura, validação, migração e gravação atômica de projetos (.kortin) e da recuperação.
const fs = require('fs');
const C = require('../../shared/constants.json');
const { ValidationError } = require('../core/security');

const fail = (m) => { throw new ValidationError(m); };

/** Converte projetos de versões antigas para a atual (cada passo é idempotente). */
function migrate(data) {
  const out = { ...data, clips: [...data.clips] };
  const v = Number(out.version) || 1;
  if (v < 2) out.clips = out.clips.map((c) => ({ speed: 1, fadeIn: 0, fadeOut: 0, ...c }));
  if (v < 3) out.clips = out.clips.map((c) => ({ denoise: false, ...c }));
  // v4: sem mudança de formato; marca projetos gravados após a camada de validação
  out.version = C.PROJECT_VERSION;
  return out;
}

function validateShape(data) {
  if (!data || typeof data !== 'object' || data.app !== C.APP_ID || !Array.isArray(data.clips)) {
    fail('Este arquivo não é um projeto do Kortin.');
  }
  if (data.clips.length > C.LIMITS.maxClips) fail('O projeto tem clipes demais.');
  if (Number(data.version) > C.PROJECT_VERSION) {
    fail('Este projeto foi salvo por uma versão mais nova do Kortin. Atualize o app para abri-lo.');
  }
  for (const c of data.clips) {
    if (!c || typeof c.path !== 'string') fail('O projeto está corrompido.');
  }
  if (data.music != null && (typeof data.music !== 'object' || typeof data.music.path !== 'string')) {
    fail('O projeto está corrompido (música).');
  }
  if (data.titles != null && (!Array.isArray(data.titles) || data.titles.length > C.LIMITS.maxTitles)) {
    fail('O projeto está corrompido (títulos).');
  }
  return data;
}

function readProject(file) {
  const st = fs.statSync(file);
  if (st.size > C.LIMITS.maxProjectBytes) fail('O arquivo do projeto é grande demais.');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail('O arquivo do projeto está corrompido.');
  }
  return migrate(validateShape(data));
}

/** Grava em arquivo temporário e renomeia: o projeto nunca fica pela metade. */
function writeAtomic(file, data, pretty = false) {
  const json = JSON.stringify(data, null, pretty ? 2 : 0);
  if (Buffer.byteLength(json) > C.LIMITS.maxProjectBytes) fail('O projeto ficou grande demais para salvar.');
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd); // garante que foi para o disco antes de trocar
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

module.exports = { readProject, writeAtomic, migrate, validateShape };

// Camada de segurança do processo principal.
// Regra: o renderer é tratado como NÃO confiável. Tudo que chega por IPC é validado aqui,
// e só caminhos que o próprio usuário escolheu (diálogo, arrastar, "Abrir com") são usados.
const path = require('path');
const C = require('../../shared/constants.json');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.userFacing = true;
  }
}

const fail = (msg) => {
  throw new ValidationError(msg);
};

// ---------------- Caminhos ----------------

const VIDEO_EXT = new Set(C.VIDEO_EXT);
const extOf = (p) => path.extname(p).slice(1).toLowerCase();

/**
 * Caminho local e absoluto. Recusa:
 *  - caminhos de rede (\\servidor\pasta): um projeto malicioso poderia fazer o Windows
 *    enviar suas credenciais (hash NTLM) para um servidor externo só por "ler" o arquivo
 *  - caminhos de dispositivo (\\?\, \\.\) e bytes nulos
 */
function assertLocalPath(p, label = 'arquivo') {
  if (typeof p !== 'string' || !p || p.length > 4096) fail(`Caminho de ${label} inválido.`);
  if (p.includes('\0')) fail(`Caminho de ${label} inválido.`);
  if (/^(\\\\|\/\/)/.test(p)) fail(`Arquivos em pastas de rede não são suportados por segurança: ${path.basename(p)}`);
  if (!path.isAbsolute(p)) fail(`Caminho de ${label} precisa ser completo.`);
  return path.normalize(p);
}

const isVideoPath = (p) => VIDEO_EXT.has(extOf(p));
const isProjectPath = (p) => extOf(p) === C.PROJECT_EXT;

function assertVideoPath(p) {
  const n = assertLocalPath(p, 'vídeo');
  if (!isVideoPath(n)) fail(`Formato não suportado: ${path.basename(n)}`);
  return n;
}

function assertProjectPath(p) {
  const n = assertLocalPath(p, 'projeto');
  if (!isProjectPath(n)) fail('O arquivo precisa ter a extensão .kortin.');
  return n;
}

// Comparação de caminhos: no Windows maiúsculas e minúsculas são o mesmo arquivo
const key = (p) => (process.platform === 'win32' ? path.normalize(p).toLowerCase() : path.normalize(p));

/** Registro do que o usuário autorizou nesta sessão */
class Grants {
  constructor() {
    this.media = new Set(); // vídeos que podem ser lidos (preview, legenda, exportação)
    this.projects = new Set(); // projetos que podem ser abertos/regravados
    this.outputs = new Set(); // arquivos de saída escolhidos no diálogo
    this.outputDirs = new Set(); // pastas de saída escolhidas no diálogo
  }

  allowMedia(p) {
    this.media.add(key(p));
  }

  hasMedia(p) {
    return typeof p === 'string' && this.media.has(key(p));
  }

  allowProject(p) {
    this.projects.add(key(p));
  }

  hasProject(p) {
    return typeof p === 'string' && this.projects.has(key(p));
  }

  allowOutput(p) {
    this.outputs.add(key(p));
  }

  allowOutputDir(d) {
    this.outputDirs.add(key(d));
  }

  /** A saída precisa ter sido escolhida pelo usuário (arquivo ou pasta) e ser .mp4 */
  hasOutput(p) {
    if (typeof p !== 'string' || extOf(p) !== 'mp4') return false;
    const k = key(p);
    if (this.outputs.has(k)) return true;
    return this.outputDirs.has(key(path.dirname(p)));
  }
}

// ---------------- Números ----------------

function num(v, label, { min = -Infinity, max = Infinity, int = false } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`Valor inválido em ${label}.`);
  if (int && !Number.isInteger(v)) fail(`Valor inválido em ${label}.`);
  if (v < min || v > max) fail(`Valor fora do limite em ${label}.`);
  return v;
}

const oneOf = (v, list, label) => (list.includes(v) ? v : fail(`Opção inválida em ${label}.`));

// ---------------- Exportação ----------------

const ASPECT_SIZES = Object.values(C.ASPECTS).map((a) => `${a.width}x${a.height}`);

function validateClip(c, grants, i) {
  if (!c || typeof c !== 'object') fail(`Clipe ${i + 1} inválido.`);
  const p = assertVideoPath(c.path);
  if (!grants.hasMedia(p)) fail(`O vídeo do clipe ${i + 1} não foi autorizado. Importe-o de novo.`);
  const inPoint = num(c.inPoint, 'início do clipe', { min: 0, max: C.LIMITS.maxDurationSeconds });
  const outPoint = num(c.outPoint, 'fim do clipe', { min: 0, max: C.LIMITS.maxDurationSeconds });
  if (outPoint - inPoint < C.MIN_CLIP - 1e-6) fail(`O clipe ${i + 1} é curto demais.`);
  const speed = c.speed == null ? 1 : oneOf(c.speed, C.SPEEDS, 'velocidade');
  return {
    path: p,
    inPoint,
    outPoint,
    speed,
    hasAudio: !!c.hasAudio,
    volume: c.volume == null ? 1 : num(c.volume, 'volume', { min: 0, max: C.MAX_VOLUME }),
    fadeIn: c.fadeIn == null ? 0 : num(c.fadeIn, 'fade de entrada', { min: 0, max: C.MAX_FADE }),
    fadeOut: c.fadeOut == null ? 0 : num(c.fadeOut, 'fade de saída', { min: 0, max: C.MAX_FADE }),
    denoise: !!c.denoise,
  };
}

function validateCaptions(captions) {
  if (captions == null) return undefined;
  if (typeof captions !== 'object' || !Array.isArray(captions.cues)) fail('Legendas inválidas.');
  if (captions.cues.length > C.LIMITS.maxCues) fail('Legendas demais neste vídeo.');
  const s = captions.settings || {};
  const settings = {
    style: oneOf(s.style ?? 'classica', C.CAPTION_STYLES, 'estilo da legenda'),
    size: oneOf(s.size ?? 'm', Object.keys(C.CAPTION_SIZES), 'tamanho da legenda'),
    position: num(s.position ?? 0.72, 'altura da legenda', { min: 0, max: 1 }),
    uppercase: s.uppercase == null ? null : !!s.uppercase,
  };
  const cues = captions.cues.map((cue) => {
    const start = num(cue.start, 'tempo da legenda', { min: 0, max: C.LIMITS.maxDurationSeconds });
    const end = num(cue.end, 'tempo da legenda', { min: 0, max: C.LIMITS.maxDurationSeconds });
    if (!Array.isArray(cue.words) || cue.words.length > C.LIMITS.maxWordsPerCue) fail('Legenda inválida.');
    const words = cue.words.map((w) => ({
      start: num(w.start, 'tempo da palavra', { min: 0, max: C.LIMITS.maxDurationSeconds }),
      end: num(w.end, 'tempo da palavra', { min: 0, max: C.LIMITS.maxDurationSeconds }),
      text: String(w.text ?? '').slice(0, C.LIMITS.maxWordChars),
    }));
    return { start, end, words };
  });
  return { cues, settings };
}

/**
 * Valida um trabalho de exportação vindo do renderer.
 * Números entram em uma linha de filtros do FFmpeg: sem esta validação, um texto como
 * "1080,movie=C\\:/segredo.txt" viraria um filtro extra (injeção de filtergraph).
 */
function validateExportJob(job, grants) {
  if (!job || typeof job !== 'object' || !Array.isArray(job.clips) || !job.clips.length) fail('Nada para exportar.');
  if (job.clips.length > C.LIMITS.maxClips) fail('Clipes demais para exportar de uma vez.');
  const o = job.options || {};
  const width = num(o.width, 'largura', { int: true, min: 2, max: 7680 });
  const height = num(o.height, 'altura', { int: true, min: 2, max: 7680 });
  if (!ASPECT_SIZES.includes(`${width}x${height}`)) fail('Formato de vídeo não suportado.');
  const output = assertLocalPath(o.output, 'saída');
  if (!grants.hasOutput(output)) fail('Escolha de novo onde salvar o vídeo.');
  const clips = job.clips.map((c, i) => validateClip(c, grants, i));
  if (clips.some((c) => key(c.path) === key(output))) fail('O vídeo exportado não pode substituir um dos vídeos usados no projeto.');
  return {
    clips,
    options: {
      width,
      height,
      output,
      fit: oneOf(o.fit ?? 'blur', C.FITS, 'enquadramento'),
      fps: oneOf(o.fps ?? 30, C.FPS, 'quadros por segundo'),
      crf: num(o.crf ?? 20, 'qualidade', { int: true, min: 0, max: 51 }),
      preset: oneOf(o.preset ?? 'veryfast', C.X264_PRESETS, 'velocidade de compressão'),
      encoder: oneOf(o.encoder ?? 'libx264', C.ENCODERS, 'codificador'),
      captions: validateCaptions(o.captions),
    },
  };
}

module.exports = {
  ValidationError,
  Grants,
  assertLocalPath,
  assertVideoPath,
  assertProjectPath,
  isVideoPath,
  isProjectPath,
  validateExportJob,
  validateCaptions,
  num,
  oneOf,
  pathKey: key,
};

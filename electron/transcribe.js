// Transcrição local com whisper.cpp: o áudio nunca sai do computador.
// Gera a lista de palavras com o tempo de cada uma (em segundos do arquivo original).
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FFMPEG } = require('./engine');

const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

/** Modelos oferecidos: baixados uma única vez, do repositório oficial do whisper.cpp */
const MODELS = {
  rapido: { file: 'ggml-base.bin', sizeMB: 148, label: 'Rápido', hint: 'Bom para fala clara, roda em qualquer PC' },
  preciso: { file: 'ggml-small.bin', sizeMB: 488, label: 'Preciso', hint: 'Acerta mais nomes e gírias; leva ~3x mais tempo' },
  maximo: { file: 'ggml-large-v3-turbo-q5_0.bin', sizeMB: 574, label: 'Máximo', hint: 'O mais preciso; ideal para PC com processador recente' },
};

// Frase de exemplo que ensina o modelo a pontuar em português
const PROMPTS = {
  pt: 'Olá, tudo bem? Hoje eu vou mostrar como funciona. Então, vamos lá!',
  en: 'Hello, how are you? Today I will show you how it works. So, let us begin!',
  es: 'Hola, ¿qué tal? Hoy te voy a mostrar cómo funciona. Entonces, ¡vamos!',
};

const exe = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
const plat = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';

/** Onde estão os binários: empacotado (resources/whisper) ou em desenvolvimento (vendor/whisper/<plataforma>) */
function whisperDir() {
  if (process.env.KORTIN_WHISPER_DIR) return process.env.KORTIN_WHISPER_DIR;
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'whisper'))) {
    return path.join(process.resourcesPath, 'whisper');
  }
  return path.join(__dirname, '..', 'vendor', 'whisper', plat);
}

function binaries() {
  const dir = whisperDir();
  return ['fast', 'compat'].map((v) => path.join(dir, v, exe)).filter((p) => fs.existsSync(p));
}

const isAvailable = () => binaries().length > 0;

function modelPath(modelsDir, key) {
  const m = MODELS[key];
  if (!m) throw new Error('Modelo desconhecido.');
  return path.join(modelsDir, m.file);
}

function modelStatus(modelsDir) {
  return Object.fromEntries(
    Object.entries(MODELS).map(([key, m]) => {
      const p = path.join(modelsDir, m.file);
      return [key, { ...m, installed: fs.existsSync(p) && fs.statSync(p).size > 10e6 }];
    })
  );
}

/**
 * Baixa o modelo com progresso. `fetchImpl` = net.fetch do Electron (respeita o proxy do Windows).
 * Grava em .part e só renomeia no fim, para nunca deixar um modelo pela metade.
 */
async function downloadModel(modelsDir, key, onProgress, fetchImpl = fetch, signal) {
  const m = MODELS[key];
  const dest = modelPath(modelsDir, key);
  fs.mkdirSync(modelsDir, { recursive: true });
  const part = `${dest}.part`;
  const res = await fetchImpl(`${HF}/${m.file}`, { signal });
  if (!res.ok || !res.body) throw new Error(`Não foi possível baixar o modelo (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || m.sizeMB * 1e6;
  const out = fs.createWriteStream(part);
  let received = 0;
  let last = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      const now = Date.now();
      if (onProgress && now - last > 200) {
        last = now;
        onProgress(Math.min(0.999, received / total), received);
      }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  } catch (err) {
    out.destroy();
    try { fs.unlinkSync(part); } catch {}
    throw err;
  }
  if (received < 10e6) {
    try { fs.unlinkSync(part); } catch {}
    throw new Error('O download veio incompleto. Verifique a internet e tente de novo.');
  }
  fs.renameSync(part, dest);
  if (onProgress) onProgress(1, received);
  return dest;
}

function runProcess(cmd, args, { onStderr, onSpawn, cwd } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { windowsHide: true, cwd });
    if (onSpawn) onSpawn(proc);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      const t = d.toString();
      stderr = (stderr + t).slice(-20000);
      if (onStderr) onStderr(t);
    });
    proc.stdout.on('data', () => {});
    proc.on('error', (err) => resolve({ code: -1, signal: null, stderr: String(err) }));
    proc.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
}

/** Converte a saída do whisper (uma "palavra" por segmento) em [{ s, e, w }] */
function parseWords(json) {
  const words = [];
  for (const seg of json.transcription || []) {
    let text = String(seg.text || '').trim();
    if (!text || /^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) continue; // [Música], (risos)…
    const s = (seg.offsets?.from ?? 0) / 1000;
    const e = (seg.offsets?.to ?? 0) / 1000;
    // pontuação solta vai para a palavra anterior
    if (/^[.,!?;:…]+$/.test(text) && words.length) {
      words[words.length - 1].w += text;
      continue;
    }
    // o whisper às vezes junta a pontuação no começo da próxima palavra
    const lead = /^([.,!?;:…]+)\s*(.+)$/.exec(text);
    if (lead && words.length) {
      words[words.length - 1].w += lead[1];
      text = lead[2];
    }
    words.push({ s: Math.round(s * 1000) / 1000, e: Math.round(Math.max(e, s + 0.05) * 1000) / 1000, w: text });
  }
  return words;
}

/**
 * Transcreve um arquivo. Retorna { words, model, language }.
 * onProgress(0..1) · onSpawn(proc) para permitir cancelar.
 */
async function transcribe(file, { modelsDir, model = 'rapido', language = 'pt', onProgress, onSpawn } = {}) {
  const bins = binaries();
  if (!bins.length) throw new Error('O componente de legenda não está instalado nesta versão do Kortin.');
  const modelFile = modelPath(modelsDir, model);
  if (!fs.existsSync(modelFile)) throw new Error('O modelo de legenda ainda não foi baixado.');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kortin-stt-'));
  try {
    // 1) áudio em 16 kHz mono, o formato que o whisper espera
    if (onProgress) onProgress(0.01);
    const wav = path.join(work, 'audio.wav');
    const conv = await runProcess(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], { onSpawn });
    if (conv.code !== 0 || !fs.existsSync(wav)) throw new Error('Não foi possível ler o áudio deste vídeo.');

    // 2) transcrição palavra a palavra (tenta a versão rápida; se o processador não suportar, usa a compatível)
    const threads = Math.max(1, Math.min(8, os.cpus().length - 1));
    const args = [
      '-m', modelFile, '-f', wav, '-l', language, '-t', String(threads),
      '-ml', '1', '-sow', '-oj', '-of', path.join(work, 'saida'), '-pp',
      '--prompt', PROMPTS[language] || PROMPTS.pt,
    ];
    let res;
    for (const bin of bins) {
      res = await runProcess(bin, args, {
        onSpawn,
        onStderr: (t) => {
          const m = /progress\s*=\s*(\d+)%/.exec(t);
          if (m && onProgress) onProgress(0.05 + 0.9 * Math.min(1, Number(m[1]) / 100));
        },
      });
      const crashed = res.signal === 'SIGILL' || res.code === 3221225501 || res.code === -1073741795 || res.code === 132;
      if (!crashed) break;
    }
    if (res.signal === 'SIGKILL' || res.signal === 'SIGTERM') return { cancelled: true };
    const outJson = path.join(work, 'saida.json');
    if (res.code !== 0 || !fs.existsSync(outJson)) {
      const tail = res.stderr.trim().split('\n').slice(-4).join('\n');
      throw new Error(`A transcrição falhou.\n${tail}`);
    }
    const raw = fs.readFileSync(outJson, 'utf8');
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      json = JSON.parse(raw.replace(/[\u0000-\u001f]/g, ' '));
    }
    if (onProgress) onProgress(1);
    return { words: parseWords(json), model, language };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** Chave do cache: mesmo arquivo + mesmo modelo + mesmo idioma = mesma transcrição */
function cacheKey(file, model, language) {
  const st = fs.statSync(file);
  return crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}|${model}|${language}`).digest('hex');
}

module.exports = { MODELS, isAvailable, binaries, modelStatus, modelPath, downloadModel, transcribe, parseWords, cacheKey };

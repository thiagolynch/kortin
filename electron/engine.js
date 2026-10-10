// Motor de vídeo do Kortin: leitura de arquivos, miniaturas e exportação via FFmpeg.
// Este arquivo não depende do Electron, então pode ser testado com Node puro.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const captions = require('./captions');

function getFfmpegPath() {
  if (process.env.KORTIN_FFMPEG) return process.env.KORTIN_FFMPEG;
  try {
    const p = require('ffmpeg-static');
    if (p) {
      // No app empacotado, o binário fica fora do .asar
      const unpacked = p.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) return unpacked;
      if (fs.existsSync(p)) return p;
    }
  } catch (_) {
    /* sem ffmpeg-static: usa o do sistema */
  }
  return 'ffmpeg';
}

const FFMPEG = getFfmpegPath();

function run(args, { onStdout, onSpawn, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true, cwd });
    if (onSpawn) onSpawn(proc);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200000) stderr = stderr.slice(-100000);
    });
    proc.stdout.on('data', (d) => onStdout && onStdout(d.toString()));
    proc.on('error', reject);
    proc.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
}

function parseTime(h, m, s) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

// Lê informações do vídeo a partir da saída do "ffmpeg -i"
function parseProbe(text) {
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const v = /Stream #\d+:\d+[^\n]*?: Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(text);
  const fps = /Stream #\d+:\d+[^\n]*?: Video:[^\n]*?(\d+(?:\.\d+)?) fps/.exec(text);
  const hasAudio = /Stream #\d+:\d+[^\n]*?: Audio:/.test(text);
  const rot =
    /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(text) || /rotate\s*:\s*(-?\d+)/.exec(text);

  if (!v) throw new Error('Este arquivo não tem uma trilha de vídeo.');
  if (!d) throw new Error('Não foi possível ler a duração do vídeo.');

  let width = Number(v[1]);
  let height = Number(v[2]);
  const rotation = rot ? Math.round(Number(rot[1])) : 0;
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];

  return {
    duration: parseTime(d[1], d[2], d[3]),
    width,
    height,
    fps: fps ? Number(fps[1]) : 30,
    hasAudio,
    rotation,
  };
}

async function probe(file) {
  const { stderr } = await run(['-hide_banner', '-i', file]);
  if (/No such file|Invalid data found/.test(stderr)) {
    throw new Error('Formato de arquivo não suportado.');
  }
  return parseProbe(stderr);
}

async function thumbnail(file, atSeconds) {
  const out = path.join(
    os.tmpdir(),
    `kortin-thumb-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  );
  await run([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', Math.max(0, atSeconds).toFixed(3),
    '-i', file,
    '-frames:v', '1',
    '-vf', 'scale=320:-2',
    '-q:v', '5',
    out,
  ]);
  try {
    const buf = fs.readFileSync(out);
    fs.unlinkSync(out);
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const n = (x) => Number(x).toFixed(3);

// ---------------- Codificadores (CPU e placa de vídeo) ----------------

const HW_ENCODERS = [
  { id: 'h264_nvenc', label: 'NVIDIA' },
  { id: 'h264_qsv', label: 'Intel' },
  { id: 'h264_amf', label: 'AMD' },
];

let hwCache = null;

/** Descobre quais codificadores de placa de vídeo funcionam neste PC (testa de verdade). */
function detectHardwareEncoders() {
  if (hwCache) return hwCache;
  hwCache = (async () => {
    if (process.env.KORTIN_NO_HW) return [];
    const { stdout } = await runCapture(['-hide_banner', '-encoders']);
    const working = [];
    for (const enc of HW_ENCODERS) {
      if (!stdout.includes(enc.id)) continue;
      const { code } = await run([
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x240:d=0.2',
        '-frames:v', '3', ...encoderArgs(enc.id, 23, 'veryfast'), '-f', 'null', '-',
      ]);
      if (code === 0) working.push(enc);
    }
    return working;
  })().catch(() => []);
  return hwCache;
}

function runCapture(args) {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true });
    let stdout = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', () => {});
    proc.on('error', () => resolve({ code: -1, stdout }));
    proc.on('close', (code) => resolve({ code, stdout }));
  });
}

function encoderArgs(encoder, crf, preset) {
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(crf + 1), '-b:v', '0', '-pix_fmt', 'yuv420p'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', String(crf + 1), '-pix_fmt', 'nv12'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp',
        '-qp_i', String(crf), '-qp_p', String(crf + 2), '-qp_b', String(crf + 4), '-pix_fmt', 'yuv420p'];
    default:
      return ['-c:v', 'libx264', '-preset', preset || 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
  }
}

// ---------------- Linha do tempo -> FFmpeg ----------------

/** Encadeia atempo (cada um aceita 0,5x a 2x) para qualquer velocidade. */
function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  while (s > 2) { parts.push('atempo=2'); s /= 2; }
  if (Math.abs(s - 1) > 1e-6) parts.push(`atempo=${s.toFixed(5)}`);
  return parts.join(',');
}

/** Duração do clipe na linha do tempo (já com a velocidade aplicada). */
const outDuration = (c) => (c.outPoint - c.inPoint) / (c.speed || 1);

/**
 * Monta os argumentos do FFmpeg para exportar a linha do tempo.
 * clips: [{ path, inPoint, outPoint, hasAudio, volume? (0 a 2), speed? (0,25 a 4), fadeIn?, fadeOut? }]
 * opts:  { width, height, fit: 'blur'|'cover'|'contain', fps, crf, preset, encoder?, output }
 */
function buildExportArgs(clips, opts) {
  if (!clips.length) throw new Error('A linha do tempo está vazia.');
  const W = opts.width;
  const H = opts.height;
  const fps = opts.fps || 30;
  const fit = opts.fit || 'blur';

  const args = ['-hide_banner', '-y'];
  const filters = [];
  let silentIndex = clips.length;
  const silentInputs = [];

  clips.forEach((c) => {
    args.push('-ss', n(c.inPoint), '-t', n(c.outPoint - c.inPoint), '-i', c.path);
  });

  clips.forEach((c, i) => {
    const speed = c.speed || 1;
    const srcDur = c.outPoint - c.inPoint;
    const dur = outDuration(c);
    const src = `[${i}:v:0]`;
    const pts = speed === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${speed.toFixed(5)}`;
    const tail = `setsar=1,fps=${fps},format=yuv420p,trim=duration=${n(dur)},setpts=PTS-STARTPTS[v${i}]`;

    if (fit === 'cover') {
      filters.push(`${src}${pts},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${tail}`);
    } else if (fit === 'contain') {
      filters.push(
        `${src}${pts},scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,${tail}`
      );
    } else {
      // Fundo desfocado (estilo Reels/TikTok)
      filters.push(`${src}${pts},split=2[bg${i}][fg${i}]`);
      filters.push(
        `[bg${i}]scale=${Math.round(W / 4)}:${Math.round(H / 4)}:force_original_aspect_ratio=increase,` +
          `crop=${Math.round(W / 4)}:${Math.round(H / 4)},boxblur=10:2,scale=${W}:${H}[bgb${i}]`
      );
      filters.push(`[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fgs${i}]`);
      filters.push(`[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,${tail}`);
    }

    const afmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
    const volume = c.volume ?? 1;
    if (c.hasAudio && volume > 0) {
      const chain = [afmt, 'asetpts=PTS-STARTPTS', `atrim=0:${n(srcDur)}`];
      const tempo = atempoChain(speed);
      if (tempo) chain.push(tempo);
      chain.push(`apad=whole_dur=${n(dur)}`, `atrim=0:${n(dur)}`);
      if (c.denoise) chain.push('afftdn=nf=-25'); // limpeza de ruído de fundo
      if (volume !== 1) chain.push(`volume=${volume.toFixed(3)}`);
      const fi = Math.min(c.fadeIn || 0, dur / 2);
      const fo = Math.min(c.fadeOut || 0, dur / 2);
      if (fi > 0) chain.push(`afade=t=in:st=0:d=${n(fi)}`);
      if (fo > 0) chain.push(`afade=t=out:st=${n(dur - fo)}:d=${n(fo)}`);
      filters.push(`[${i}:a:0]${chain.join(',')}[a${i}]`);
    } else {
      silentInputs.push(dur);
      filters.push(`[${silentIndex}:a]${afmt},atrim=0:${n(dur)}[a${i}]`);
      silentIndex++;
    }
  });

  silentInputs.forEach((dur) => {
    args.push('-f', 'lavfi', '-t', n(dur), '-i', 'anullsrc=r=48000:cl=stereo');
  });

  const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join('');
  filters.push(`${concatInputs}concat=n=${clips.length}:v=1:a=1[outv0][outa]`);
  // Legenda queimada no vídeo (o .ass é preparado em exportVideo)
  filters.push(opts.captionFilter ? `[outv0]${opts.captionFilter}[outv]` : '[outv0]null[outv]');

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[outv]', '-map', '[outa]',
    ...encoderArgs(opts.encoder || 'libx264', opts.crf ?? 20, opts.preset),
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    opts.output
  );
  return args;
}

/**
 * Exporta e chama onProgress(0..1). Se a placa de vídeo falhar, refaz automaticamente na CPU.
 * Retorna { promise, cancel }. O resultado traz { ok, output, encoder, fellBack }.
 */
function exportVideo(clips, opts, onProgress, onEncoder) {
  const total = clips.reduce((s, c) => s + outDuration(c), 0);
  let proc = null;
  let cancelled = false;
  let workDir;
  let captionFilter = null;
  if (opts.captions?.cues?.length) {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kortin-exp-'));
    captionFilter = captions.prepareCaptionDir(workDir, opts.captions.cues, opts.captions.settings || {}, opts.width, opts.height);
  }

  const attempt = (encoder) => {
    let buffer = '';
    if (onEncoder) onEncoder(encoder);
    return run(buildExportArgs(clips, { ...opts, encoder, captionFilter }), {
      cwd: workDir,
      onSpawn: (p) => (proc = p),
      onStdout: (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
          if (m && total > 0 && onProgress) onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
        }
      },
    });
  };

  const promise = (async () => {
    try {
      const wanted = opts.encoder || 'libx264';
      let encoder = wanted;
      let res = await attempt(encoder);
      let fellBack = false;
      if (!cancelled && res.code !== 0 && encoder !== 'libx264') {
        fellBack = true;
        encoder = 'libx264';
        if (onProgress) onProgress(0);
        res = await attempt(encoder);
      }
      if (cancelled) {
        try { fs.unlinkSync(opts.output); } catch {}
        return { cancelled: true };
      }
      if (res.code !== 0) {
        const lastLines = res.stderr.trim().split('\n').slice(-6).join('\n');
        throw new Error(`Falha na exportação (código ${res.code}).\n${lastLines}`);
      }
      if (onProgress) onProgress(1);
      return { ok: true, output: opts.output, encoder, fellBack };
    } finally {
      if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
    }
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (proc) proc.kill('SIGKILL');
    },
  };
}

// ---------------- Onda sonora ----------------

/**
 * Lê o áudio e devolve os picos (0 a 255) em `perSecond` pontos por segundo.
 * Retorna [] se o vídeo não tiver áudio.
 */
function audioPeaks(file, perSecond = 50) {
  const rate = 8000;
  const win = Math.round(rate / perSecond);
  return new Promise((resolve) => {
    const proc = spawn(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-'],
      { windowsHide: true }
    );
    const peaks = [];
    let count = 0;
    let max = 0;
    let leftover = null;
    proc.stdout.on('data', (chunk) => {
      let buf = leftover ? Buffer.concat([leftover, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      for (let i = 0; i < usable; i += 2) {
        const v = Math.abs(buf.readInt16LE(i));
        if (v > max) max = v;
        if (++count === win) {
          // raiz quadrada realça falas baixas sem estourar as altas
          peaks.push(Math.min(255, Math.round(Math.sqrt(max / 32768) * 255)));
          count = 0;
          max = 0;
        }
      }
      leftover = usable < buf.length ? buf.subarray(usable) : null;
    });
    proc.stderr.on('data', () => {});
    proc.on('error', () => resolve([]));
    proc.on('close', () => {
      if (count > 0) peaks.push(Math.min(255, Math.round(Math.sqrt(max / 32768) * 255)));
      resolve(peaks);
    });
  });
}

module.exports = {
  FFMPEG, HW_ENCODERS, probe, parseProbe, thumbnail, buildExportArgs, exportVideo,
  detectHardwareEncoders, encoderArgs, atempoChain, outDuration, audioPeaks,
};

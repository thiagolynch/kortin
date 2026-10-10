// Motor de vídeo do Klipo: leitura de arquivos, miniaturas e exportação via FFmpeg.
// Este arquivo não depende do Electron, então pode ser testado com Node puro.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getFfmpegPath() {
  if (process.env.KLIPO_FFMPEG) return process.env.KLIPO_FFMPEG;
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

function run(args, { onStdout, onSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { windowsHide: true });
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
    `klipo-thumb-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
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

/**
 * Monta os argumentos do FFmpeg para exportar a linha do tempo.
 * clips: [{ path, inPoint, outPoint, hasAudio }]
 * opts:  { width, height, fit: 'blur'|'cover'|'contain', fps, crf, preset, output }
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
    const dur = c.outPoint - c.inPoint;
    args.push('-ss', n(c.inPoint), '-t', n(dur), '-i', c.path);
  });

  clips.forEach((c, i) => {
    const dur = c.outPoint - c.inPoint;
    const src = `[${i}:v:0]`;
    const tail = `setsar=1,fps=${fps},format=yuv420p,trim=duration=${n(dur)},setpts=PTS-STARTPTS[v${i}]`;

    if (fit === 'cover') {
      filters.push(
        `${src}setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${tail}`
      );
    } else if (fit === 'contain') {
      filters.push(
        `${src}setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,` +
          `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,${tail}`
      );
    } else {
      // Fundo desfocado (estilo Reels/TikTok)
      filters.push(`${src}setpts=PTS-STARTPTS,split=2[bg${i}][fg${i}]`);
      filters.push(
        `[bg${i}]scale=${Math.round(W / 4)}:${Math.round(H / 4)}:force_original_aspect_ratio=increase,` +
          `crop=${Math.round(W / 4)}:${Math.round(H / 4)},boxblur=10:2,scale=${W}:${H}[bgb${i}]`
      );
      filters.push(
        `[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fgs${i}]`
      );
      filters.push(`[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,${tail}`);
    }

    const afmt = `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo`;
    if (c.hasAudio) {
      filters.push(
        `[${i}:a:0]${afmt},asetpts=PTS-STARTPTS,atrim=0:${n(dur)},apad=whole_dur=${n(dur)}[a${i}]`
      );
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
  filters.push(`${concatInputs}concat=n=${clips.length}:v=1:a=1[outv][outa]`);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[outv]', '-map', '[outa]',
    '-c:v', 'libx264', '-preset', opts.preset || 'veryfast', '-crf', String(opts.crf ?? 20),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    opts.output
  );
  return args;
}

/** Exporta e chama onProgress(0..1). Retorna { promise, cancel }. */
function exportVideo(clips, opts, onProgress) {
  const total = clips.reduce((s, c) => s + (c.outPoint - c.inPoint), 0);
  const args = buildExportArgs(clips, opts);
  let proc = null;
  let cancelled = false;
  let buffer = '';

  const promise = run(args, {
    onSpawn: (p) => (proc = p),
    onStdout: (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
        if (m && total > 0 && onProgress) {
          onProgress(Math.min(1, Number(m[1]) / 1e6 / total));
        }
      }
    },
  }).then(({ code, stderr }) => {
    if (cancelled) {
      try { fs.unlinkSync(opts.output); } catch {}
      return { cancelled: true };
    }
    if (code !== 0) {
      const lastLines = stderr.trim().split('\n').slice(-6).join('\n');
      throw new Error(`Falha na exportação (código ${code}).\n${lastLines}`);
    }
    if (onProgress) onProgress(1);
    return { ok: true, output: opts.output };
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (proc) proc.kill('SIGKILL');
    },
  };
}

module.exports = { FFMPEG, probe, parseProbe, thumbnail, buildExportArgs, exportVideo };

// Tradução da linha do tempo para o grafo de filtros do FFmpeg.
// Funções puras: recebem dados já validados (ver core/security.js) e devolvem texto/argumentos.
const { encoderArgs } = require('./encoders');
const C = require('../../../shared/constants.json');

const n = (x) => Number(x).toFixed(3);

/** Duração do clipe na linha do tempo (já com a velocidade aplicada). */
const outDuration = (c) => (c.outPoint - c.inPoint) / (c.speed || 1);

/**
 * Duração de cada clipe arredondada para quadros inteiros, sem acumular erro:
 * as bordas são arredondadas na timeline inteira (round(fim·fps) − round(início·fps)).
 * Sem isso, cada clipe curto ganha até 1 quadro e a legenda vai dessincronizando.
 * Clipes menores que meio quadro somem (não aparecem em vídeo nenhum).
 * Devolve cópias com `dur` (segundos exatos em quadros).
 */
function frameAccurate(clips, fps) {
  let t = 0;
  const out = [];
  for (const c of clips) {
    const start = t;
    t += outDuration(c);
    const frames = Math.round(t * fps) - Math.round(start * fps);
    if (frames > 0) out.push({ ...c, dur: frames / fps });
  }
  return out;
}

const durOf = (c) => c.dur ?? outDuration(c);

/** Encadeia atempo (cada filtro aceita 0,5x a 2x) para qualquer velocidade. */
function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  while (s > 2) { parts.push('atempo=2'); s /= 2; }
  if (Math.abs(s - 1) > 1e-6) parts.push(`atempo=${s.toFixed(5)}`);
  return parts.join(',');
}

/**
 * Filtro de cor: a mesma matriz 3x3 que a prévia usa (SVG feColorMatrix em sRGB), aplicada com
 * colorchannelmixer, mais contraste opcional. Assim o que se vê na prévia é o que sai no vídeo.
 */
function colorFilter(name) {
  const f = C.FILTERS[name];
  if (!f) return '';
  const [rr, rg, rb, gr, gg, gb, br, bg, bb] = f.matrix;
  const mix = `colorchannelmixer=rr=${rr}:rg=${rg}:rb=${rb}:gr=${gr}:gg=${gg}:gb=${gb}:br=${br}:bg=${bg}:bb=${bb}`;
  return f.contrast ? `${mix},eq=contrast=${f.contrast}` : mix;
}

/** Fade da imagem (pelo preto) no começo/fim do clipe, dentro da duração do clipe. */
function videoFades(c, dur) {
  const fi = Math.min(c.videoFadeIn || 0, dur / 2);
  const fo = Math.min(c.videoFadeOut || 0, dur / 2);
  const out = [];
  if (fi > 0) out.push(`fade=t=in:st=0:d=${n(fi)}`);
  if (fo > 0) out.push(`fade=t=out:st=${n(dur - fo)}:d=${n(fo)}`);
  return out.join(',');
}

function videoChain(i, c, { W, H, fps, fit }) {
  const speed = c.speed || 1;
  const dur = durOf(c);
  const src = `[${i}:v:0]`;
  const pts = speed === 1 ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${speed.toFixed(5)}`;
  const color = colorFilter(c.filter);
  const fades = videoFades(c, dur);
  // tpad garante pelo menos 1 quadro em clipes muito curtos (ex.: 0,1 s a 4x)
  const tail = `setsar=1,${color ? `${color},` : ''}fps=${fps},format=yuv420p,tpad=stop_mode=clone:stop_duration=${n(1 / fps)},trim=duration=${n(dur)},setpts=PTS-STARTPTS${fades ? `,${fades}` : ''}[v${i}]`;
  if (fit === 'cover') {
    return [`${src}${pts},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},${tail}`];
  }
  if (fit === 'contain') {
    return [`${src}${pts},scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,${tail}`];
  }
  const bw = Math.round(W / 4);
  const bh = Math.round(H / 4);
  return [
    `${src}${pts},split=2[bg${i}][fg${i}]`,
    `[bg${i}]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=10:2,scale=${W}:${H}[bgb${i}]`,
    `[fg${i}]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2[fgs${i}]`,
    `[bgb${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2,${tail}`,
  ];
}

const AFMT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';

function audioChain(i, c, silentIndex) {
  const dur = durOf(c);
  const volume = c.volume ?? 1;
  if (!c.hasAudio || volume <= 0) return { filter: `[${silentIndex}:a]${AFMT},atrim=0:${n(dur)}[a${i}]`, silent: true };
  const chain = [AFMT, 'asetpts=PTS-STARTPTS', `atrim=0:${n(c.outPoint - c.inPoint)}`];
  const tempo = atempoChain(c.speed || 1);
  if (tempo) chain.push(tempo);
  chain.push(`apad=whole_dur=${n(dur)}`, `atrim=0:${n(dur)}`);
  if (c.denoise) chain.push('afftdn=nf=-25');
  if (volume !== 1) chain.push(`volume=${volume.toFixed(3)}`);
  const fi = Math.min(c.fadeIn || 0, dur / 2);
  const fo = Math.min(c.fadeOut || 0, dur / 2);
  if (fi > 0) chain.push(`afade=t=in:st=0:d=${n(fi)}`);
  if (fo > 0) chain.push(`afade=t=out:st=${n(dur - fo)}:d=${n(fo)}`);
  return { filter: `[${i}:a:0]${chain.join(',')}[a${i}]`, silent: false };
}

// Abaixamento automático (ducking): a voz controla um compressor na música.
// Quando há fala, a música cai ~12 dB em 20 ms e volta em ~0,4 s depois que a fala para.
const DUCK = 'sidechaincompress=threshold=0.02:ratio=12:attack=20:release=400:makeup=1';

/** Entrada da música: repete sem parar (-stream_loop) e é cortada no tamanho do vídeo. */
const musicInput = (music) => ['-stream_loop', '-1', '-i', music.path];

/**
 * Filtros que misturam a música no áudio principal. mainLabel: rótulo do áudio do vídeo (ex.: "[amain]").
 * Termina em [outa]. alimiter evita estourar quando voz e música somam.
 */
function musicMix(mainLabel, musicIndex, total, music) {
  const fi = Math.min(music.fadeIn || 0, total / 2);
  const fo = Math.min(music.fadeOut || 0, total / 2);
  const chain = [AFMT, `atrim=0:${n(total)}`, 'asetpts=PTS-STARTPTS', `volume=${(music.volume ?? 0.25).toFixed(3)}`];
  if (fi > 0) chain.push(`afade=t=in:st=0:d=${n(fi)}`);
  if (fo > 0) chain.push(`afade=t=out:st=${n(total - fo)}:d=${n(fo)}`);
  const out = [`[${musicIndex}:a:0]${chain.join(',')}[mus]`];
  if (music.duck) {
    out.push(`${mainLabel}asplit=2[amix][aside]`, `[mus][aside]${DUCK}[mduck]`, '[amix][mduck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[outa]');
  } else {
    out.push(`${mainLabel}[mus]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[outa]`);
  }
  return out;
}

/**
 * Monta { inputs, graph } para a exportação.
 * inputs: argumentos de entrada · graph: o texto do -filter_complex (vai para um arquivo)
 */
function buildGraph(clips, opts) {
  if (!clips.length) throw new Error('A linha do tempo está vazia.');
  const ctx = { W: opts.width, H: opts.height, fps: opts.fps || 30, fit: opts.fit || 'blur' };
  const inputs = [];
  const filters = [];
  const silent = [];

  clips.forEach((c) => inputs.push('-ss', n(c.inPoint), '-t', n(c.outPoint - c.inPoint), '-i', c.path));
  let silentIndex = clips.length;
  clips.forEach((c, i) => {
    filters.push(...videoChain(i, c, ctx));
    const a = audioChain(i, c, silentIndex);
    filters.push(a.filter);
    if (a.silent) {
      silent.push(durOf(c));
      silentIndex++;
    }
  });
  silent.forEach((dur) => inputs.push('-f', 'lavfi', '-t', n(dur), '-i', 'anullsrc=r=48000:cl=stereo'));

  const music = opts.music || null;
  filters.push(`${clips.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${clips.length}:v=1:a=1[outv0][${music ? 'amain' : 'outa'}]`);
  if (music) {
    inputs.push(...musicInput(music));
    filters.push(...musicMix('[amain]', silentIndex, clips.reduce((t, c) => t + durOf(c), 0), music));
  }
  filters.push(opts.captionFilter ? `[outv0]${opts.captionFilter}[outv]` : '[outv0]null[outv]');
  return { inputs, graph: filters.join(';\n') };
}

/**
 * Argumentos completos. O grafo vai num arquivo (-filter_complex_script) porque com muitos
 * clipes ele passa do limite de 32.767 caracteres da linha de comando do Windows.
 */
function buildExportArgs(clips, opts, { graphFile, intermediate = false } = {}) {
  const { inputs, graph } = buildGraph(clips, opts);
  // intermediário (exportação em partes): qualidade alta e áudio PCM, que emenda sem estalo
  const codec = intermediate
    ? [...encoderArgs('libx264', INTERMEDIATE_CRF, 'veryfast'), '-c:a', 'pcm_s16le']
    : [...encoderArgs(opts.encoder || 'libx264', opts.crf ?? 20, opts.preset), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
  return [
    '-hide_banner', '-y', '-nostdin',
    ...inputs,
    ...(graphFile ? ['-filter_complex_script', graphFile] : ['-filter_complex', graph]),
    '-map', '[outv]', '-map', '[outa]',
    ...codec,
    '-progress', 'pipe:1', '-nostats',
    opts.output,
  ];
}

/**
 * Passo final da exportação em partes: emenda os intermediários (concat demuxer, sem decodificar
 * todos ao mesmo tempo), aplica a legenda e codifica no formato pedido.
 */
function buildConcatArgs(listFile, opts) {
  // com música, o passo final vira um grafo: vídeo (+legenda) e áudio misturado com a música
  const mix = opts.music
    ? [
      ...musicInput(opts.music),
      '-filter_complex', [`[0:v:0]${opts.captionFilter || 'null'}[outv]`, ...musicMix('[0:a:0]', 1, opts.total, opts.music)].join(';'),
      '-map', '[outv]', '-map', '[outa]',
    ]
    : [...(opts.captionFilter ? ['-vf', opts.captionFilter] : []), '-map', '0:v:0', '-map', '0:a:0'];
  return [
    '-hide_banner', '-y', '-nostdin',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    ...mix,
    ...encoderArgs(opts.encoder || 'libx264', opts.crf ?? 20, opts.preset),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    opts.output,
  ];
}

const INTERMEDIATE_CRF = 12;

module.exports = { atempoChain, outDuration, frameAccurate, colorFilter, buildGraph, buildExportArgs, buildConcatArgs };

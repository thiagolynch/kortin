// Exportação: prepara a pasta de trabalho (grafo + legenda), roda o FFmpeg, mede o progresso
// e, se a placa de vídeo falhar, refaz pelo processador.
//
// Memória: cada vídeo de entrada abre um decodificador (~60 MB em 1080p, mais em PCs com muitos
// núcleos). Com 100+ clipes — comum depois da "limpeza da fala" — um grafo único estoura a RAM.
// Acima de CHUNK_SIZE clipes, a timeline é renderizada em partes de no máximo CHUNK_SIZE entradas
// e as partes são emendadas no final. A memória fica limitada, seja qual for o tamanho do projeto.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, lastLines } = require('./process');
const { buildGraph, buildExportArgs, buildConcatArgs, frameAccurate } = require('./filtergraph');
const ass = require('../captions/ass');

const PROGRESS_INTERVAL_MS = 100;
const CHUNK_SIZE = 16;
const CHUNK_PHASE = 0.7; // na exportação em partes, as partes valem 70% da barra

function makeWorkDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kortin-exp-'));
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Lê "out_time_us=" da saída -progress e devolve segundos já gerados */
function progressParser(onSeconds) {
  let buffer = '';
  return (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const m = /^out_time_(?:us|ms)=(\d+)/.exec(line.trim());
      if (m) onSeconds(Number(m[1]) / 1e6);
    }
  };
}

function failure(res) {
  if (/No space left on device/i.test(res.stderr)) return new Error('Não há espaço suficiente no disco para salvar o vídeo.');
  return new Error(`Falha na exportação (código ${res.code ?? 'interrompido'}).\n${lastLines(res.stderr)}`);
}

/**
 * Exporta. onProgress(0..1) é chamado no máximo a cada 100 ms. Retorna { promise, cancel }.
 * O resultado traz { ok, output, encoder, fellBack, parts } ou { cancelled: true }.
 */
function exportVideo(timeline, opts, onProgress, onEncoder) {
  // durações em quadros inteiros na timeline toda (as partes somam exatamente o total)
  const clips = frameAccurate(timeline, opts.fps || 30);
  if (!clips.length) throw new Error('A linha do tempo é curta demais para gerar um vídeo.');
  const total = clips.reduce((s, c) => s + c.dur, 0);
  let proc = null;
  let cancelled = false;
  const workDir = makeWorkDir();
  const tmpOut = `${opts.output}.parcial.mp4`; // só vira o arquivo final se terminar bem

  let lastSent = 0;
  const report = (p, force = false) => {
    if (!onProgress) return;
    const now = Date.now();
    if (force || now - lastSent >= PROGRESS_INTERVAL_MS) {
      lastSent = now;
      onProgress(Math.max(0, Math.min(1, p)));
    }
  };

  const ffmpeg = (args, onSeconds) => run(args, {
    cwd: workDir,
    onSpawn: (p) => (proc = p),
    onStdout: progressParser(onSeconds),
  });

  const cleanup = () => {
    fs.rmSync(workDir, { recursive: true, force: true });
    try { fs.unlinkSync(tmpOut); } catch { /* já foi movido ou não existe */ }
  };

  /** Roda o passo final com o codificador pedido; se a placa falhar, refaz pelo processador. */
  const withFallback = async (makeArgs, onSeconds) => {
    let encoder = opts.encoder || 'libx264';
    if (onEncoder) onEncoder(encoder);
    let res = await ffmpeg(makeArgs(encoder), onSeconds);
    let fellBack = false;
    if (!cancelled && res.code !== 0 && encoder !== 'libx264') {
      fellBack = true;
      encoder = 'libx264';
      if (onEncoder) onEncoder(encoder);
      report(0, true);
      res = await ffmpeg(makeArgs(encoder), onSeconds);
    }
    return { res, encoder, fellBack };
  };

  // legenda e títulos vão no mesmo .ass (uma passada do filtro "ass")
  const cues = opts.captions?.cues || [];
  const titles = opts.titles || [];
  const captionFilter = cues.length || titles.length
    ? ass.prepareCaptionDir(workDir, cues, opts.captions?.settings || {}, opts.width, opts.height, titles)
    : null;

  // Um passo só: grafo completo (projetos pequenos, o caso comum)
  const single = async () => {
    fs.writeFileSync(path.join(workDir, 'grafo.txt'), buildGraph(clips, { ...opts, captionFilter }).graph, 'utf8');
    return withFallback(
      (encoder) => buildExportArgs(clips, { ...opts, encoder, captionFilter, output: tmpOut }, { graphFile: 'grafo.txt' }),
      (s) => total > 0 && report(s / total)
    );
  };

  // Em partes: cada parte tem no máximo CHUNK_SIZE entradas abertas ao mesmo tempo
  const chunked = async () => {
    const parts = chunk(clips, CHUNK_SIZE);
    const names = [];
    let done = 0;
    for (let i = 0; i < parts.length; i++) {
      if (cancelled) return null;
      const name = `parte-${String(i).padStart(4, '0')}.mkv`;
      const graphName = `grafo-${i}.txt`;
      // partes sem música nem sobreposição: entram uma vez só, no passo final
      const partOpts = { ...opts, music: null, overlay: null };
      fs.writeFileSync(path.join(workDir, graphName), buildGraph(parts[i], partOpts).graph, 'utf8');
      const partDur = parts[i].reduce((s, c) => s + c.dur, 0);
      const res = await ffmpeg(
        buildExportArgs(parts[i], { ...partOpts, output: name }, { graphFile: graphName, intermediate: true }),
        (s) => report(((done + Math.min(s, partDur)) / total) * CHUNK_PHASE)
      );
      if (cancelled) return null;
      if (res.code !== 0) throw failure(res);
      done += partDur;
      names.push(name);
    }
    fs.writeFileSync(path.join(workDir, 'lista.txt'), names.map((n) => `file '${n}'`).join('\n'), 'utf8');
    const out = await withFallback(
      (encoder) => buildConcatArgs('lista.txt', { ...opts, encoder, captionFilter, total, output: tmpOut }),
      (s) => report(CHUNK_PHASE + (s / total) * (1 - CHUNK_PHASE))
    );
    return { ...out, parts: parts.length };
  };

  const promise = (async () => {
    try {
      const out = clips.length > CHUNK_SIZE ? await chunked() : await single();
      if (cancelled || !out) return { cancelled: true };
      if (out.res.code !== 0) throw failure(out.res);
      fs.renameSync(tmpOut, opts.output);
      report(1, true);
      return { ok: true, output: opts.output, encoder: out.encoder, fellBack: out.fellBack, parts: out.parts || 1 };
    } finally {
      cleanup();
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

module.exports = { exportVideo, CHUNK_SIZE };

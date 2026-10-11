// Melhores momentos: acha trechos de um vídeo prontos para virar um "short" (TikTok, Reels,
// YouTube Shorts — todos usam o mesmo formato vertical 9:16, por isso um só corte serve às três).
// 100% local: só olha a onda sonora (RMS dos picos já extraídos por waveform.js) e, se houver
// transcrição, a densidade de fala — sem IA paga nem chamada de rede. Lógica pura, sem FFmpeg aqui,
// para poder ser testada com dados sintéticos.

const MIN_GAP_RATIO = 0.3; // dois trechos escolhidos não podem se sobrepor em mais que 30% da duração do corte

/** Energia (RMS) por segundo a partir dos picos 0..255 de audioPeaks (perSecond amostras/s). */
function energyPerSecond(peaks, perSecond, totalSeconds) {
  const secs = Math.max(1, Math.ceil(totalSeconds));
  const out = new Array(secs).fill(0);
  for (let s = 0; s < secs; s++) {
    const from = Math.floor(s * perSecond);
    const to = Math.min(peaks.length, Math.floor((s + 1) * perSecond));
    if (to <= from) continue;
    let sum = 0;
    for (let i = from; i < to; i++) sum += peaks[i] * peaks[i]; // RMS: picos altos pesam mais que vários picos médios
    out[s] = Math.sqrt(sum / (to - from));
  }
  return out;
}

/** Densidade de fala por segundo (quantas palavras começam nele); frases com "!"/"?" pesam mais. */
function speechPerSecond(words, totalSeconds) {
  const secs = Math.max(1, Math.ceil(totalSeconds));
  const out = new Array(secs).fill(0);
  for (const w of words || []) {
    const s = Math.max(0, Math.min(secs - 1, Math.floor(w.start)));
    out[s] += 1 + (/[!?]$/.test(String(w.text || '').trim()) ? 1.5 : 0);
  }
  return out;
}

function normalize(arr) {
  const max = arr.reduce((m, v) => Math.max(m, v), 0);
  if (!max) return arr.map(() => 0);
  return arr.map((v) => v / max);
}

/**
 * @param {number[]} peaks picos 0..255 (de engine.audioPeaks)
 * @param {number} perSecond amostras por segundo em `peaks`
 * @param {number} totalSeconds duração total do trecho analisado, em segundos
 * @param {{start:number, text?:string}[]} [words] palavras com tempo de início (opcional; melhora o ranking)
 * @param {{clipSeconds?: number, count?: number}} [opts]
 * @returns {{start:number, end:number, score:number, reason:string}[]} ordenado pelo tempo no vídeo
 */
function findHighlights(peaks, perSecond, totalSeconds, words = [], opts = {}) {
  const clipSeconds = Math.max(5, Math.min(90, opts.clipSeconds || 30));
  const count = Math.max(1, Math.min(10, opts.count || 5));
  if (!Array.isArray(peaks) || !peaks.length || totalSeconds < clipSeconds) return [];

  const energy = normalize(energyPerSecond(peaks, perSecond, totalSeconds));
  const speech = words.length ? normalize(speechPerSecond(words, totalSeconds)) : null;
  const score = energy.map((e, i) => (speech ? e * 0.55 + speech[i] * 0.45 : e));

  const step = Math.max(1, Math.round(clipSeconds / 6));
  const windows = [];
  for (let t = 0; t + clipSeconds <= totalSeconds; t += step) {
    let sum = 0;
    for (let s = t; s < t + clipSeconds; s++) sum += score[Math.min(score.length - 1, s)];
    windows.push({ start: t, end: t + clipSeconds, avg: sum / clipSeconds });
  }
  windows.sort((a, b) => b.avg - a.avg);

  const picked = [];
  for (const w of windows) {
    if (picked.length >= count) break;
    const overlaps = picked.some((p) => Math.min(p.end, w.end) - Math.max(p.start, w.start) > clipSeconds * MIN_GAP_RATIO);
    if (overlaps) continue;
    picked.push(w);
  }
  const maxAvg = picked.reduce((m, w) => Math.max(m, w.avg), 0) || 1;
  return picked
    .sort((a, b) => a.start - b.start)
    .map((w) => ({
      start: w.start,
      end: w.end,
      score: Math.round((w.avg / maxAvg) * 100),
      reason: speech ? 'pico de energia e fala' : 'pico de energia sonora',
    }));
}

module.exports = { findHighlights, energyPerSecond, speechPerSecond, normalize };

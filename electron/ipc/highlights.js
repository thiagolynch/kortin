// Melhores momentos: acha trechos do vídeo prontos para virar um short (TikTok/Reels/YouTube
// Shorts usam o mesmo formato vertical, então um corte serve às três). Só processa a onda sonora
// (e a transcrição, se já existir) localmente — nenhuma chamada de rede, nenhuma IA paga.
const C = require('../../shared/constants.json');
const engine = require('../engine');
const { ValidationError, assertVideoPath } = require('../core/security');
const { handle } = require('./handle');

const PEAKS_PER_SECOND = 20; // resolução suficiente para achar picos sem pesar demais em vídeos longos

function num(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function register(ctx) {
  const { grants } = ctx;

  handle('highlights:find', async (_e, raw) => {
    const filePath = assertVideoPath(raw?.filePath);
    if (!grants.hasMedia(filePath)) throw new ValidationError('Arquivo não autorizado. Importe-o pelo botão Importar.');

    const info = await engine.probe(filePath);
    const rangeStart = num(raw?.start, 0, info.duration, 0);
    const rangeEnd = num(raw?.end, rangeStart, info.duration, info.duration);
    const clipSeconds = num(raw?.clipSeconds, 5, 90, 30);
    const count = num(raw?.count, 1, 10, 5);
    if (!Array.isArray(raw?.words) || raw.words.length > C.LIMITS.maxWordsPerCue * C.LIMITS.maxCues) {
      throw new ValidationError('Transcrição inválida.');
    }
    const words = raw.words
      .filter((w) => w && typeof w === 'object' && Number.isFinite(Number(w.start)))
      .map((w) => ({ start: Number(w.start) - rangeStart, text: String(w.text ?? '').slice(0, 80) }))
      .filter((w) => w.start >= 0);

    const peaks = await engine.audioPeaks(filePath, PEAKS_PER_SECOND);
    const fromIdx = Math.floor(rangeStart * PEAKS_PER_SECOND);
    const toIdx = Math.ceil(rangeEnd * PEAKS_PER_SECOND);
    const slice = peaks.slice(fromIdx, toIdx);

    const found = engine.findHighlights(slice, PEAKS_PER_SECOND, rangeEnd - rangeStart, words, { clipSeconds, count });
    // devolve em tempo absoluto do arquivo (o range era um recorte para analisar só o clipe em uso)
    return found.map((h) => ({ start: h.start + rangeStart, end: h.end + rangeStart, score: h.score, reason: h.reason }));
  });
}

module.exports = { register };

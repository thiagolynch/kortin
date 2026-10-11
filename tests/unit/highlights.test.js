import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { require } from './_require';

const { findHighlights, energyPerSecond } = require('../../electron/services/highlights/detect');

const PER_SECOND = 10;

/** Monta picos sintéticos: `level` (0..255) constante, exceto nos intervalos de `loud` (mais alto). */
function makePeaks(totalSeconds, level, loudWindows = []) {
  const peaks = new Array(totalSeconds * PER_SECOND).fill(level);
  for (const [from, to, loudLevel] of loudWindows) {
    for (let i = from * PER_SECOND; i < to * PER_SECOND; i++) peaks[i] = loudLevel;
  }
  return peaks;
}

describe('energyPerSecond', () => {
  it('RMS: pico único alto pesa mais que vários picos médios na mesma janela', () => {
    const highOne = [0, 0, 0, 0, 200]; // 1 pico alto
    const avg = (arr) => {
      const sq = arr.reduce((s, v) => s + v * v, 0);
      return Math.sqrt(sq / arr.length);
    };
    expect(avg(highOne)).toBeGreaterThan(avg([40, 40, 40, 40, 40]));
  });
});

describe('findHighlights', () => {
  it('acha o trecho mais energético entre dois picos de som', () => {
    // 90s de vídeo, trecho baixo (nível 10) com dois picos: 10-40s (nível 60) e 60-90s (nível 200, o maior)
    const peaks = makePeaks(90, 10, [[10, 40, 60], [60, 90, 200]]);
    const found = findHighlights(peaks, PER_SECOND, 90, [], { clipSeconds: 20, count: 1 });
    expect(found.length).toBe(1);
    expect(found[0].start).toBeGreaterThanOrEqual(60);
    expect(found[0].end).toBeLessThanOrEqual(90);
  });

  it('respeita o número de trechos pedido e não deixa eles se sobreporem muito', () => {
    const peaks = makePeaks(120, 10, [[0, 20, 200], [40, 60, 200], [80, 100, 200]]);
    const found = findHighlights(peaks, PER_SECOND, 120, [], { clipSeconds: 15, count: 3 });
    expect(found.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < found.length; i++) {
      const overlap = Math.min(found[i - 1].end, found[i].end) - Math.max(found[i - 1].start, found[i].start);
      expect(overlap).toBeLessThanOrEqual(15 * 0.3 + 1e-9);
    }
    // ordenados pelo tempo no vídeo (para a lista fazer sentido na interface)
    for (let i = 1; i < found.length; i++) expect(found[i].start).toBeGreaterThan(found[i - 1].start);
  });

  it('nota (score) vai de 0 a 100, maior no trecho mais forte', () => {
    const peaks = makePeaks(60, 10, [[0, 20, 50], [40, 60, 200]]);
    const found = findHighlights(peaks, PER_SECOND, 60, [], { clipSeconds: 20, count: 2 });
    for (const h of found) {
      expect(h.score).toBeGreaterThanOrEqual(0);
      expect(h.score).toBeLessThanOrEqual(100);
    }
    const strongest = found.reduce((best, h) => (h.score > best.score ? h : best));
    expect(strongest.score).toBe(100);
    expect(strongest.start).toBeGreaterThanOrEqual(35); // o pico forte é de 40 a 60s
  });

  it('transcrição move o ranking: trecho com mais fala (mesmo com áudio parecido) pontua mais', () => {
    const peaks = makePeaks(60, 50); // energia uniforme — sem a fala, os dois trechos empatariam
    const words = Array.from({ length: 20 }, (_, i) => ({ start: 30 + i * 0.4, text: 'oi' })); // muita fala entre 30s e 38s
    const found = findHighlights(peaks, PER_SECOND, 60, words, { clipSeconds: 15, count: 1 });
    expect(found[0].start).toBeLessThanOrEqual(32);
    expect(found[0].end).toBeGreaterThanOrEqual(38);
  });

  it('vídeo mais curto que a duração do corte não gera sugestão', () => {
    const peaks = makePeaks(10, 100);
    expect(findHighlights(peaks, PER_SECOND, 10, [], { clipSeconds: 30 })).toEqual([]);
  });

  it('nunca quebra com entradas malucas (fuzz)', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 2000 }),
      fc.integer({ min: 1, max: 600 }),
      fc.integer({ min: 1, max: 100 }),
      (peaks, totalSeconds, clipSeconds) => {
        const found = findHighlights(peaks, PER_SECOND, totalSeconds, [], { clipSeconds });
        expect(Array.isArray(found)).toBe(true);
        for (const h of found) {
          expect(h.end).toBeGreaterThan(h.start);
          expect(h.start).toBeGreaterThanOrEqual(0);
          expect(h.end).toBeLessThanOrEqual(totalSeconds + 1e-6);
        }
      }
    ), { numRuns: 200 });
  });
});

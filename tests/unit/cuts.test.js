import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FILLERS, applyCuts, findRestarts, suggestCuts } from '../../src/lib/captions';
import { MIN_CLIP, buildSegments, totalOf } from '../../src/lib/timeline';

const W = (list) => {
  let t = 0;
  return list.map(([w, gap = 0.05, dur = 0.3]) => {
    const s = t + gap;
    t = s + dur;
    return { s, e: t, w };
  });
};
const clipFor = (words, extra = {}) => ({ id: 'c1', path: '/a.mp4', duration: words.at(-1).e + 1, inPoint: 0, outPoint: words.at(-1).e + 1, speed: 1, ...extra });

describe('findRestarts', () => {
  it('acha "hoje eu vou… hoje eu vou mostrar"', () => {
    const words = W([['Hoje'], ['eu'], ['vou'], ['Hoje,', 0.4], ['eu'], ['vou'], ['mostrar']]);
    expect(findRestarts(words)).toEqual([[0, 3]]);
  });
  it('não confunde palavras repetidas soltas com recomeço', () => {
    expect(findRestarts(W([['muito'], ['muito'], ['bom'], ['mesmo']]))).toEqual([]);
  });
  it('ignora repetição distante (mais de 8 s)', () => {
    const words = W([['vamos'], ['lá'], ['agora', 9], ['vamos'], ['lá']]);
    expect(findRestarts(words)).toEqual([]);
  });
});

describe('suggestCuts', () => {
  const words = W([['Olá,'], ['é,', 0.05], ['tudo'], ['bem?'], ['Hoje', 1.5], ['eu'], ['vou'], ['Hoje', 0.3], ['eu'], ['vou'], ['mostrar']]);
  const clip = clipFor(words);
  const tr = { '/a.mp4': { words } };

  it('gera os três tipos, com motivo e posição na timeline', () => {
    const s = suggestCuts([clip], tr, { minPause: 0.7, fillers: FILLERS.filter((f) => f.on) });
    expect(s.map((x) => x.type).sort()).toEqual(['filler', 'pause', 'pause', 'restart']);
    const restart = s.find((x) => x.type === 'restart');
    expect(restart.reason).toMatch(/Recomeçou: “Hoje eu vou”/);
    for (const x of s) {
      expect(x.end).toBeGreaterThan(x.start);
      expect(x.id).toMatch(/^c1:/);
    }
  });

  it('limite de pausa maior = menos sugestões; zero desliga', () => {
    const few = suggestCuts([clip], tr, { minPause: 1.4, restarts: false });
    const many = suggestCuts([clip], tr, { minPause: 0.2, restarts: false });
    expect(many.length).toBeGreaterThan(few.length);
    expect(suggestCuts([clip], tr, { minPause: 0, restarts: false })).toEqual([]);
  });

  it('ids estáveis entre recálculos', () => {
    const a = suggestCuts([clip], tr).map((x) => x.id);
    expect(suggestCuts([clip], tr).map((x) => x.id)).toEqual(a);
  });

  it('respeita velocidade e posição do clipe na timeline', () => {
    const fast = { ...clip, id: 'c2', speed: 2 };
    const first = { id: 'c0', path: '/b.mp4', duration: 3, inPoint: 0, outPoint: 3, speed: 1 };
    const s = suggestCuts([first, fast], tr, { minPause: 0.7, restarts: false });
    const p = s.find((x) => x.clipId === 'c2');
    expect(p.start).toBeCloseTo(3 + p.srcStart / 2, 6);
    expect(p.seconds).toBeCloseTo((p.srcEnd - p.srcStart) / 2, 6);
  });
});

describe('applyCuts', () => {
  const wordsArb = fc.array(fc.record({ gap: fc.double({ min: 0, max: 2, noNaN: true }), dur: fc.double({ min: 0.05, max: 0.6, noNaN: true }), w: fc.constantFrom('olá', 'é', 'hum', 'tudo', 'bem', 'hoje', 'eu', 'vou') }), { minLength: 2, maxLength: 120 })
    .map((l) => W(l.map((x) => [x.w, x.gap, x.dur])));

  it('aplicar um subconjunto qualquer: nunca aumenta, nunca cria clipe < MIN_CLIP, remove o que diz', () => {
    fc.assert(fc.property(wordsArb, fc.array(fc.boolean(), { maxLength: 200 }), (words, picks) => {
      const clip = clipFor(words);
      const all = suggestCuts([clip], { '/a.mp4': { words } }, { minPause: 0.5, fillers: FILLERS, restarts: true });
      const chosen = all.filter((_, i) => picks[i]);
      const before = totalOf(buildSegments([clip]));
      const res = applyCuts([clip], chosen);
      const after = totalOf(buildSegments(res.clips));
      expect(after).toBeLessThanOrEqual(before + 1e-9);
      expect(before - after).toBeCloseTo(res.seconds, 6);
      for (const c of res.clips) expect(c.outPoint - c.inPoint).toBeGreaterThanOrEqual(MIN_CLIP - 1e-9);
      if (!chosen.length) expect(res.clips).toEqual([clip]);
    }), { numRuns: 200 });
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { cueAt, cueIndexAt, deriveCues, editCue, firstWordEndingAfter, planCleanup } from '../../src/lib/captions';
import { buildSegments } from '../../src/lib/timeline';

// transcrição sintética: palavras em ordem, com pausas aleatórias
const wordsArb = fc.array(fc.record({
  gap: fc.double({ min: 0, max: 1.5, noNaN: true }),
  dur: fc.double({ min: 0.05, max: 0.8, noNaN: true }),
  w: fc.constantFrom('olá', 'é', 'tudo', 'bem?', 'hoje', 'o', 'Kortin.', 'hum,', 'muito', 'fácil!', 'de'),
}), { minLength: 1, maxLength: 300 }).map((list) => {
  let t = 0;
  return list.map(({ gap, dur, w }) => {
    const s = t + gap;
    t = s + dur;
    return { s, e: t, w };
  });
});

describe('deriveCues', () => {
  it('legendas em ordem, sem sobreposição e dentro da timeline', () => {
    fc.assert(fc.property(wordsArb, fc.integer({ min: 12, max: 42 }), (words, maxChars) => {
      const end = words.at(-1).e;
      const clips = [
        { id: 'a', path: '/a.mp4', duration: end, inPoint: 0, outPoint: end / 2, speed: 1 },
        { id: 'b', path: '/a.mp4', duration: end, inPoint: end / 3, outPoint: end, speed: 2 },
      ].filter((c) => c.outPoint - c.inPoint > 0.1);
      const segs = buildSegments(clips);
      const cues = deriveCues(segs, { '/a.mp4': { words } }, { maxChars });
      const total = segs.reduce((n, s) => n + s.len, 0);
      for (let i = 0; i < cues.length; i++) {
        expect(cues[i].end).toBeGreaterThan(cues[i].start);
        expect(cues[i].start).toBeGreaterThanOrEqual(-1e-9);
        expect(cues[i].end).toBeLessThanOrEqual(total + 1e-6);
        if (i) expect(cues[i].start).toBeGreaterThanOrEqual(cues[i - 1].end - 1e-9);
      }
    }), { numRuns: 150 });
  });

  it('cueIndexAt (binária) equivale à busca linear', () => {
    fc.assert(fc.property(wordsArb, fc.double({ min: -1, max: 400, noNaN: true }), (words, t) => {
      const end = words.at(-1).e;
      const segs = buildSegments([{ id: 'a', path: '/a.mp4', duration: end, inPoint: 0, outPoint: end, speed: 1 }]);
      const cues = deriveCues(segs, { '/a.mp4': { words } });
      const linear = cues.findIndex((c) => t >= c.start && t < c.end);
      expect(cueIndexAt(cues, t)).toBe(linear);
      expect(cueAt(cues, t)).toBe(linear < 0 ? null : cues[linear]);
    }));
  });

  it('firstWordEndingAfter equivale à busca linear', () => {
    fc.assert(fc.property(wordsArb, fc.double({ min: -1, max: 400, noNaN: true }), (words, t) => {
      const linear = words.findIndex((w) => w.e > t);
      expect(firstWordEndingAfter(words, t)).toBe(linear < 0 ? words.length : linear);
    }));
  });

  it('suporta 20 mil palavras em tempo razoável (sem O(n²))', () => {
    const words = Array.from({ length: 20000 }, (_, i) => ({ s: i * 0.3, e: i * 0.3 + 0.25, w: i % 9 ? 'palavra' : 'fim.' }));
    const clips = Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, path: '/a.mp4', duration: 6000, inPoint: i * 30, outPoint: i * 30 + 29, speed: 1 }));
    const t0 = performance.now();
    const cues = deriveCues(buildSegments(clips), { '/a.mp4': { words } });
    expect(cues.length).toBeGreaterThan(1000);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('editCue', () => {
  it('troca o texto mantendo o intervalo de tempo', () => {
    const words = [{ s: 0, e: 0.5, w: 'ola' }, { s: 0.5, e: 1, w: 'mundo' }, { s: 2, e: 3, w: 'fim' }];
    const segs = buildSegments([{ id: 'a', path: '/a.mp4', duration: 3, inPoint: 0, outPoint: 3, speed: 1 }]);
    const [cue] = deriveCues(segs, { '/a.mp4': { words } });
    const next = editCue({ '/a.mp4': { words } }, cue, 'Oi gente boa');
    const w = next['/a.mp4'].words;
    expect(w.map((x) => x.w)).toEqual(['Oi', 'gente', 'boa', 'fim']);
    expect(w[0].s).toBe(0);
    expect(w[2].e).toBeCloseTo(1, 9);
    expect(next['/a.mp4'].edited).toBe(true);
  });
});

describe('planCleanup', () => {
  it('nunca aumenta a duração e mantém clipes válidos', () => {
    fc.assert(fc.property(wordsArb, (words) => {
      const end = words.at(-1).e + 1;
      const clips = [{ id: 'a', path: '/a.mp4', duration: end, inPoint: 0, outPoint: end, speed: 1 }];
      const plan = planCleanup(clips, { '/a.mp4': { words } }, { pauses: true, fillers: [{ forms: ['é', 'hum'] }] });
      const before = end;
      const after = plan.clips.reduce((n, c) => n + (c.outPoint - c.inPoint), 0);
      expect(after).toBeLessThanOrEqual(before + 1e-9);
      for (const c of plan.clips) expect(c.outPoint).toBeGreaterThan(c.inPoint);
    }), { numRuns: 100 });
  });
});

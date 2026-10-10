import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MIN_CLIP, SPEEDS, buildSegments, clipLength, fadeFactor, formatTime, locate, snapTime, splitAt, totalOf,
} from '../../src/lib/timeline';

const clipArb = fc.record({
  duration: fc.double({ min: 0.5, max: 600, noNaN: true }),
  a: fc.double({ min: 0, max: 1, noNaN: true }),
  b: fc.double({ min: 0, max: 1, noNaN: true }),
  speed: fc.constantFrom(...SPEEDS),
}).map(({ duration, a, b, speed }, i) => {
  const lo = Math.min(a, b) * (duration - MIN_CLIP);
  const hi = Math.max(lo + MIN_CLIP, Math.max(a, b) * duration);
  return { id: `c${i}-${Math.random()}`, path: '/v.mp4', duration, inPoint: lo, outPoint: Math.min(duration, hi), speed };
});

function locateLinear(segments, t) {
  for (let i = 0; i < segments.length; i++) if (t < segments[i].start + segments[i].len) return i;
  return segments.length - 1;
}

describe('locate (busca binária)', () => {
  it('equivale à busca linear para qualquer timeline e tempo', () => {
    fc.assert(fc.property(fc.array(clipArb, { minLength: 1, maxLength: 60 }), fc.double({ min: -5, max: 1e5, noNaN: true }), (clips, t) => {
      const segs = buildSegments(clips);
      expect(locate(segs, t).index).toBe(locateLinear(segs, t));
    }));
  });
  it('devolve null sem clipes', () => expect(locate([], 3)).toBeNull());
  it('local fica sempre dentro do trecho usado', () => {
    fc.assert(fc.property(fc.array(clipArb, { minLength: 1, maxLength: 20 }), fc.double({ min: 0, max: 1e4, noNaN: true }), (clips, t) => {
      const { seg, local } = locate(buildSegments(clips), t);
      expect(local).toBeGreaterThanOrEqual(seg.clip.inPoint);
      expect(local).toBeLessThan(seg.clip.outPoint);
    }));
  });
});

describe('splitAt', () => {
  it('preserva a duração total e nunca cria clipe menor que MIN_CLIP', () => {
    fc.assert(fc.property(fc.array(clipArb, { minLength: 1, maxLength: 20 }), fc.double({ min: 0, max: 1, noNaN: true }), (clips, f) => {
      const total = totalOf(buildSegments(clips));
      const res = splitAt(clips, f * total);
      if (!res) return;
      expect(res.clips).toHaveLength(clips.length + 1);
      expect(totalOf(buildSegments(res.clips))).toBeCloseTo(total, 6);
      for (const c of res.clips) expect(c.outPoint - c.inPoint).toBeGreaterThanOrEqual(MIN_CLIP - 1e-9);
      expect(new Set(res.clips.map((c) => c.id)).size).toBe(res.clips.length);
    }));
  });
  it('recusa dividir colado na borda', () => {
    const clips = [{ id: 'a', path: '/a.mp4', duration: 10, inPoint: 0, outPoint: 10, speed: 1 }];
    expect(splitAt(clips, 0.01)).toBeNull();
    expect(splitAt(clips, 9.99)).toBeNull();
  });
});

describe('fadeFactor', () => {
  it('fica sempre entre 0 e 1', () => {
    fc.assert(fc.property(clipArb, fc.double({ min: 0, max: 3, noNaN: true }), fc.double({ min: 0, max: 3, noNaN: true }), fc.double({ min: -1, max: 2, noNaN: true }), (c, fi, fo, f) => {
      const v = fadeFactor({ ...c, fadeIn: fi, fadeOut: fo }, f * clipLength(c));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }));
  });
});

describe('snapTime / formatTime', () => {
  it('só puxa dentro do raio em pixels', () => {
    expect(snapTime(5.1, [5], 40)).toBe(5); // 4px
    expect(snapTime(5.5, [5], 40)).toBe(5.5); // 20px
  });
  it('formatTime nunca devolve NaN', () => {
    expect(formatTime(NaN)).toBe('00:00.00');
    expect(formatTime(-3)).toBe('00:00.00');
    expect(formatTime(61.5)).toBe('01:01.50');
  });
});

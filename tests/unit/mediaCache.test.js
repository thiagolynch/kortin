import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { require } from './_require';

const { createMediaCache } = require('../../electron/services/mediaCache');

const dirs = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kortin-cache-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

describe('cache de mídia', () => {
  it('calcula uma vez e reaproveita', async () => {
    const root = tmp();
    const video = path.join(root, 'a.mp4');
    fs.writeFileSync(video, 'v1');
    const cache = createMediaCache(path.join(root, 'cache'));
    const compute = vi.fn(async () => ({ duration: 6 }));
    expect(await cache.remember('probe', video, compute)).toEqual({ duration: 6 });
    expect(await cache.remember('probe', video, compute)).toEqual({ duration: 6 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('vídeo alterado (tamanho/data) invalida; tipos diferentes não colidem', async () => {
    const root = tmp();
    const video = path.join(root, 'a.mp4');
    fs.writeFileSync(video, 'v1');
    const cache = createMediaCache(path.join(root, 'cache'));
    cache.set('probe', video, { v: 1 });
    expect(cache.get('peaks', video)).toBeNull();
    fs.writeFileSync(video, 'versão 2 maior');
    expect(cache.get('probe', video)).toBeNull();
  });

  it('arquivo de cache corrompido é ignorado', async () => {
    const root = tmp();
    const video = path.join(root, 'a.mp4');
    fs.writeFileSync(video, 'v1');
    const cache = createMediaCache(path.join(root, 'cache'));
    cache.set('probe', video, { v: 1 });
    const [f] = fs.readdirSync(cache.dir);
    fs.writeFileSync(path.join(cache.dir, f), '{quebrado');
    expect(await cache.remember('probe', video, async () => ({ v: 2 }))).toEqual({ v: 2 });
  });

  it('LRU: passa do limite, apaga os menos usados até 80%', () => {
    const root = tmp();
    const cache = createMediaCache(path.join(root, 'cache'), { limitBytes: 10_000 });
    const big = 'x'.repeat(1500);
    const videos = Array.from({ length: 10 }, (_, i) => {
      const v = path.join(root, `v${i}.mp4`);
      fs.writeFileSync(v, String(i));
      return v;
    });
    videos.forEach((v, i) => {
      cache.set('probe', v, { big });
      const f = fs.readdirSync(cache.dir).find((n) => !n.endsWith('.tmp'));
      if (i === 0) fs.utimesSync(path.join(cache.dir, f), new Date(0), new Date(0)); // primeiro = mais antigo
    });
    const size = fs.readdirSync(cache.dir).reduce((n, f) => n + fs.statSync(path.join(cache.dir, f)).size, 0);
    expect(size).toBeLessThanOrEqual(10_000);
    expect(cache.get('probe', videos[9])).not.toBeNull(); // o mais recente ficou
  });
});

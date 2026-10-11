import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import path from 'node:path';
import { require } from './_require';
import { musicGainAt } from '../../src/hooks/useMusic';
import { musicFields, remapProjectPaths, serializeProject } from '../../src/lib/timeline';

const { Grants, ValidationError, validateExportJob } = require('../../electron/core/security');
const { buildGraph, buildConcatArgs } = require('../../electron/services/ffmpeg/filtergraph');
const { parseAudioProbe } = require('../../electron/services/ffmpeg/probe');
const { resolveMedia, withRelativePaths } = require('../../electron/services/projectMedia');

const abs = (p) => path.resolve(p);
const VIDEO = abs('/u/v.mp4');
const SONG = abs('/u/musica/trilha.mp3');
const OUT = abs('/u/out.mp4');
const grants = () => {
  const g = new Grants();
  g.allowMedia(VIDEO);
  g.allowMedia(SONG);
  g.allowOutput(OUT);
  return g;
};
const job = (music) => ({
  clips: [{ path: VIDEO, inPoint: 0, outPoint: 4, hasAudio: true, volume: 1, speed: 1 }],
  options: { width: 1080, height: 1920, output: OUT, music },
});

describe('música: validação', () => {
  it('aceita música autorizada e normaliza', () => {
    const m = validateExportJob(job({ path: SONG, volume: 0.3, duck: true, fadeIn: 1, fadeOut: 2 }), grants()).options.music;
    expect(m).toEqual({ path: SONG, volume: 0.3, duck: true, fadeIn: 1, fadeOut: 2 });
  });
  it('recusa música não autorizada, vídeo no lugar de áudio, números fora do limite e injeção', () => {
    const bad = [
      { path: abs('/etc/x.mp3') },
      { path: VIDEO },
      { path: SONG, volume: 3 },
      { path: SONG, volume: '0.3,movie=x' },
      { path: SONG, fadeIn: 999 },
      { path: '\\\\servidor\\a.mp3' },
    ];
    for (const m of bad) expect(() => validateExportJob(job(m), grants())).toThrow(ValidationError);
  });
  it('fuzz: qualquer coisa no campo música só gera ValidationError', () => {
    fc.assert(fc.property(fc.anything(), (m) => {
      try { validateExportJob(job(m), grants()); } catch (e) { expect(e).toBeInstanceOf(ValidationError); }
    }), { numRuns: 300 });
  });
});

describe('música: grafo do FFmpeg', () => {
  const clips = [{ path: VIDEO, inPoint: 0, outPoint: 4, hasAudio: true, volume: 1, speed: 1 }, { path: VIDEO, inPoint: 0, outPoint: 2, hasAudio: false, volume: 1, speed: 1 }];
  it('repete a música, corta no total e abaixa com a voz', () => {
    const { inputs, graph } = buildGraph(clips, { width: 1080, height: 1920, music: { path: SONG, volume: 0.3, duck: true, fadeIn: 1, fadeOut: 2 } });
    const i = inputs.indexOf(SONG);
    expect(inputs.slice(i - 3, i)).toEqual(['-stream_loop', '-1', '-i']);
    // índice da música = 2 vídeos + 1 silêncio gerado
    expect(graph).toMatch(/\[3:a:0\].*atrim=0:6\.000/);
    expect(graph).toMatch(/sidechaincompress/);
    expect(graph).toMatch(/afade=t=out:st=4\.000:d=2\.000/);
    expect(graph.match(/\[outa\]/g)).toHaveLength(1);
  });
  it('sem abaixamento: mistura direta; sem música: nada muda', () => {
    expect(buildGraph(clips, { width: 1080, height: 1920, music: { path: SONG, volume: 0.3, duck: false } }).graph).not.toMatch(/sidechain/);
    expect(buildGraph(clips, { width: 1080, height: 1920 }).graph).not.toMatch(/amix|stream_loop/);
  });
  it('passo final da exportação em partes também mistura', () => {
    const args = buildConcatArgs('lista.txt', { output: OUT, total: 30, captionFilter: 'ass=legenda.ass', music: { path: SONG, volume: 0.2, duck: true } });
    const fc_ = args[args.indexOf('-filter_complex') + 1];
    expect(fc_).toMatch(/^\[0:v:0\]ass=legenda\.ass\[outv\]/);
    expect(fc_).toMatch(/\[0:a:0\]asplit/);
    expect(args).toContain('[outa]');
  });
});

describe('música: prévia, leitura e projeto', () => {
  it('volume da prévia: fades nas pontas, abaixa na fala, nunca passa de 1', () => {
    const m = { volume: 0.8, duck: true, fadeIn: 2, fadeOut: 2 };
    expect(musicGainAt(m, 0, 10, false)).toBe(0);
    expect(musicGainAt(m, 5, 10, false)).toBeCloseTo(0.8);
    expect(musicGainAt(m, 5, 10, true)).toBeCloseTo(0.2);
    expect(musicGainAt({ ...m, duck: false }, 5, 10, true)).toBeCloseTo(0.8);
    fc.assert(fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: -5, max: 50, noNaN: true }), fc.boolean(), (v, t, sp) => {
      const g = musicGainAt({ volume: v, duck: true, fadeIn: 3, fadeOut: 3 }, t, 20, sp);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }));
  });
  it('lê arquivo de áudio e recusa arquivo sem áudio', () => {
    expect(parseAudioProbe('Duration: 00:03:05.50, start\n  Stream #0:0: Audio: mp3, 44100 Hz')).toEqual({ duration: 185.5 });
    expect(() => parseAudioProbe('Duration: 00:00:05.00\n  Stream #0:0: Video: h264')).toThrow(/não tem áudio/);
  });
  it('música vai no projeto e acompanha a pasta movida', () => {
    const data = serializeProject({ clips: [], aspect: '9:16', fit: 'blur', music: { path: SONG, name: 'trilha.mp3', duration: 90, volume: 0.3, duck: true, fadeIn: 1, fadeOut: 2 } });
    expect(data.music).toEqual(musicFields(data.music));
    const proj = abs('/u/meu.kortin');
    const saved = withRelativePaths(data, proj);
    expect(saved.music.rel).toBe('musica/trilha.mp3');
    const moved = abs('/outro/lugar/meu.kortin');
    const res = resolveMedia(saved, moved, (p) => p === abs('/outro/lugar/musica/trilha.mp3'));
    expect(res.data.music.path).toBe(abs('/outro/lugar/musica/trilha.mp3'));
    expect(remapProjectPaths(data, { [SONG]: '/z.mp3' }).music.path).toBe('/z.mp3');
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { require } from './_require';

const { parseProbe } = require('../../electron/services/ffmpeg/probe');
const { parseRange } = require('../../electron/services/mediaProtocol');
const { atempoChain, buildGraph, buildExportArgs, frameAccurate, outDuration } = require('../../electron/services/ffmpeg/filtergraph');
const { buildAss } = require('../../electron/services/captions/ass');
const { migrate, validateShape } = require('../../electron/services/projectStore');
const C = require('../../shared/constants.json');

const PROBE_MP4 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:01:02.50, start: 0.000000, bitrate: 2000 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1800 kb/s, 29.97 fps, 29.97 tbr
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s`;
const PROBE_ROTATED = `${PROBE_MP4}\n      displaymatrix: rotation of -90.00 degrees`;
const PROBE_MP3_COVER = `Input #0, mp3, from 'm.mp3':
  Duration: 00:03:10.00, start: 0.025057, bitrate: 320 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc), 600x600 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)`;

describe('parseProbe', () => {
  it('lê duração, tamanho, fps e áudio', () => {
    expect(parseProbe(PROBE_MP4)).toMatchObject({ duration: 62.5, width: 1920, height: 1080, fps: 29.97, hasAudio: true });
  });
  it('vídeo de celular girado troca largura e altura', () => {
    expect(parseProbe(PROBE_ROTATED)).toMatchObject({ width: 1080, height: 1920, rotation: -90 });
  });
  it('MP3 com capa não é vídeo', () => {
    expect(() => parseProbe(PROBE_MP3_COVER)).toThrow(/trilha de vídeo/);
  });
  it('duração zero é recusada', () => {
    expect(() => parseProbe(PROBE_MP4.replace('00:01:02.50', '00:00:00.00'))).toThrow(/vazio/);
  });
});

describe('parseRange (protocolo media://)', () => {
  it('casos de RFC 7233', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=2000-', 1000)).toEqual({ invalid: true });
    expect(parseRange('bytes=50-10', 1000)).toEqual({ invalid: true });
    expect(parseRange('items=0-1', 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
  });
  it('propriedade: intervalo válido sempre cabe no arquivo', () => {
    fc.assert(fc.property(fc.string(), fc.integer({ min: 1, max: 1e9 }), (h, size) => {
      const r = parseRange(h, size);
      if (r && !r.invalid) {
        expect(r.start).toBeGreaterThanOrEqual(0);
        expect(r.end).toBeLessThan(size);
        expect(r.start).toBeLessThanOrEqual(r.end);
      }
    }));
    fc.assert(fc.property(fc.nat(2e9), fc.nat(2e9), fc.integer({ min: 1, max: 1e9 }), (a, b, size) => {
      const r = parseRange(`bytes=${a}-${b}`, size);
      if (r && !r.invalid) expect(r.end).toBeLessThan(size);
    }));
  });
});

describe('atempoChain', () => {
  it('cada filtro fica entre 0,5 e 2 e o produto é a velocidade', () => {
    fc.assert(fc.property(fc.double({ min: 0.05, max: 64, noNaN: true }), (speed) => {
      const parts = atempoChain(speed).split(',').filter(Boolean).map((p) => Number(p.split('=')[1]));
      for (const f of parts) {
        expect(f).toBeGreaterThanOrEqual(0.5);
        expect(f).toBeLessThanOrEqual(2);
      }
      expect(parts.reduce((a, b) => a * b, 1)).toBeCloseTo(speed, 3);
    }));
  });
});

describe('frameAccurate', () => {
  it('soma exata em quadros, sem deriva acumulada, e cada borda cai num quadro', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ len: fc.double({ min: 0.01, max: 5, noNaN: true }), speed: fc.constantFrom(...C.SPEEDS) }), { minLength: 1, maxLength: 400 }),
      fc.constantFrom(...C.FPS),
      (list, fps) => {
        const clips = list.map(({ len, speed }) => ({ inPoint: 0, outPoint: len, speed }));
        const total = clips.reduce((n, c) => n + outDuration(c), 0);
        const out = frameAccurate(clips, fps);
        const sum = out.reduce((n, c) => n + c.dur, 0);
        expect(Math.abs(sum - Math.round(total * fps) / fps)).toBeLessThan(1e-6);
        for (const c of out) expect(Math.abs(c.dur * fps - Math.round(c.dur * fps))).toBeLessThan(1e-6);
      }
    ));
  });
});

describe('buildGraph', () => {
  const clip = (i) => ({ path: `/v/${i}.mp4`, inPoint: 0, outPoint: 2, speed: C.SPEEDS[i % C.SPEEDS.length], hasAudio: i % 3 !== 0, volume: 1, fadeIn: 0.2, fadeOut: 0.2, denoise: i % 2 === 0 });
  it('300 clipes: um concat, entradas e rótulos coerentes, grafo no arquivo', () => {
    const clips = Array.from({ length: 300 }, (_, i) => clip(i));
    const { inputs, graph } = buildGraph(clips, { width: 1080, height: 1920, fps: 30, fit: 'blur' });
    expect(graph.match(/concat=n=300:v=1:a=1/g)).toHaveLength(1);
    expect(inputs.filter((x) => x === '-i')).toHaveLength(300 + clips.filter((c) => !c.hasAudio).length);
    expect(graph.length).toBeGreaterThan(32767); // passaria do limite da linha de comando do Windows
    const args = buildExportArgs(clips, { width: 1080, height: 1920, output: '/o.mp4' }, { graphFile: 'grafo.txt' });
    expect(args).toContain('-filter_complex_script');
    expect(args.join(' ').length).toBeLessThan(32767);
  });
  it('clipe de 0,1 s a 4x ainda gera ao menos 1 quadro (tpad)', () => {
    const { graph } = buildGraph([{ ...clip(1), outPoint: 0.1, speed: 4 }], { width: 1080, height: 1080, fps: 30 });
    expect(graph).toMatch(/tpad=stop_mode=clone/);
  });
});

describe('buildAss', () => {
  it('texto do usuário não injeta tags ASS', () => {
    fc.assert(fc.property(fc.string(), (text) => {
      const ass = buildAss([{ start: 0, end: 1, words: [{ start: 0, end: 1, text }] }], { style: 'classica', size: 'm', position: 0.7 }, 1080, 1920);
      const line = ass.split('\n').find((l) => l.startsWith('Dialogue:'));
      if (!line) return;
      const body = line.slice(line.indexOf('}') + 1); // depois do bloco de posição
      expect(body).not.toMatch(/[{}\\\u0000-\u001f]/);
    }));
  });
});

describe('projectStore', () => {
  it('migra projetos antigos', () => {
    const out = migrate({ app: 'kortin', version: 1, clips: [{ path: '/a.mp4' }] });
    expect(out.version).toBe(C.PROJECT_VERSION);
    expect(out.clips[0]).toMatchObject({ speed: 1, fadeIn: 0, fadeOut: 0, denoise: false });
  });
  it('recusa versão mais nova, formato errado e clipes demais', () => {
    expect(() => validateShape({ app: 'kortin', version: 99, clips: [] })).toThrow(/mais nova/);
    expect(() => validateShape({ app: 'outro', clips: [] })).toThrow();
    expect(() => validateShape({ app: 'kortin', clips: [null] })).toThrow(/corrompido/);
    expect(() => validateShape({ app: 'kortin', clips: Array(C.LIMITS.maxClips + 1).fill({ path: '/a' }) })).toThrow(/demais/);
  });
});

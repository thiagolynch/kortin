import { describe, expect, it } from 'vitest';
import { require } from './_require';
import { zoomScale } from '../../src/lib/timeline';

const { validateExportJob, ValidationError, Grants } = require('../../electron/core/security');
const { zoomFilter, vignetteFilter, buildGraph } = require('../../electron/services/ffmpeg/filtergraph');
const path = require('node:path');

const VIDEO = path.resolve('/u/v.mp4');
const OUT = path.resolve('/u/out.mp4');
const g = () => { const x = new Grants(); x.allowMedia(VIDEO); x.allowOutput(OUT); return x; };
const job = (clip = {}) => ({
  clips: [{ path: VIDEO, inPoint: 0, outPoint: 4, hasAudio: true, volume: 1, speed: 1, ...clip }],
  options: { width: 1080, height: 1920, output: OUT },
});

describe('validateExportJob: zoom e vinheta', () => {
  it('aceita zoom in/out e vignette', () => {
    expect(validateExportJob(job({ zoom: 'in' }), g()).clips[0].zoom).toBe('in');
    expect(validateExportJob(job({ zoom: 'out' }), g()).clips[0].zoom).toBe('out');
    expect(validateExportJob(job({ vignette: true }), g()).clips[0].vignette).toBe(true);
  });

  it('padrão é sem zoom e sem vinheta', () => {
    const out = validateExportJob(job({}), g()).clips[0];
    expect(out.zoom).toBe('none');
    expect(out.vignette).toBe(false);
  });

  it('rejeita valor de zoom inválido', () => {
    expect(() => validateExportJob(job({ zoom: 'girar' }), g())).toThrow(ValidationError);
  });
});

describe('zoomFilter (exportação)', () => {
  it('sem zoom, não gera filtro', () => {
    expect(zoomFilter({ zoom: 'none' }, 4, 30, 1080, 1920)).toBe('');
    expect(zoomFilter({}, 4, 30, 1080, 1920)).toBe('');
  });

  it('zoom "in" gera zoompan com z começando em 1 e crescendo até ZOOM_MAX', () => {
    const f = zoomFilter({ zoom: 'in' }, 4, 30, 1080, 1920);
    expect(f).toContain('zoompan=');
    expect(f).toContain("if(eq(on\\,0)\\,1\\,min(zoom+");
    expect(f).toContain('s=1080x1920:fps=30');
  });

  it('zoom "out" começa em ZOOM_MAX e desce até 1', () => {
    const f = zoomFilter({ zoom: 'out' }, 4, 30, 1080, 1920);
    expect(f).toContain('max(zoom-');
    expect(f).toMatch(/if\(eq\(on\\,0\)\\,1\.12\\,/);
  });
});

describe('vignetteFilter (exportação)', () => {
  it('sem vignette, filtro vazio', () => {
    expect(vignetteFilter({ vignette: false })).toBe('');
    expect(vignetteFilter({})).toBe('');
  });
  it('com vignette, aplica vignette + grão (noise)', () => {
    const f = vignetteFilter({ vignette: true });
    expect(f).toContain('vignette=PI/4');
    expect(f).toContain('noise=alls=6');
  });
});

describe('buildGraph: filtros entram na cadeia do clipe', () => {
  it('clipe com zoom e vinheta inclui zoompan e vignette no grafo', () => {
    const clip = { path: VIDEO, inPoint: 0, outPoint: 4, dur: 4, hasAudio: true, volume: 1, zoom: 'in', vignette: true };
    const { graph } = buildGraph([clip], { width: 1080, height: 1920, fps: 30, fit: 'cover' });
    expect(graph).toContain('zoompan=');
    expect(graph).toContain('vignette=PI/4');
  });

  it('clipe sem zoom/vinheta não inclui esses filtros', () => {
    const clip = { path: VIDEO, inPoint: 0, outPoint: 4, dur: 4, hasAudio: true, volume: 1 };
    const { graph } = buildGraph([clip], { width: 1080, height: 1920, fps: 30, fit: 'cover' });
    expect(graph).not.toContain('zoompan=');
    expect(graph).not.toContain('vignette=');
  });
});

describe('zoomScale (prévia, ESM)', () => {
  it('sem zoom, fator sempre 1', () => {
    expect(zoomScale({ zoom: 'none' }, 2, 4)).toBe(1);
    expect(zoomScale({}, 2, 4)).toBe(1);
  });
  it('zoom "in": 1 no início, ZOOM_MAX no fim', () => {
    expect(zoomScale({ zoom: 'in' }, 0, 4)).toBeCloseTo(1, 5);
    expect(zoomScale({ zoom: 'in' }, 4, 4)).toBeCloseTo(1.12, 5);
    expect(zoomScale({ zoom: 'in' }, 2, 4)).toBeCloseTo(1.06, 5);
  });
  it('zoom "out": ZOOM_MAX no início, 1 no fim', () => {
    expect(zoomScale({ zoom: 'out' }, 0, 4)).toBeCloseTo(1.12, 5);
    expect(zoomScale({ zoom: 'out' }, 4, 4)).toBeCloseTo(1, 5);
  });
});

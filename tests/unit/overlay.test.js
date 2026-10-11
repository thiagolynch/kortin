import { describe, expect, it } from 'vitest';
import { require } from './_require';
import path from 'node:path';
import { OVERLAY_DEFAULTS, overlayFields, restoreClips, serializeProject } from '../../src/lib/timeline';

const { validateExportJob, ValidationError, Grants } = require('../../electron/core/security');
const { overlayInput, overlayFilter, buildGraph, buildConcatArgs } = require('../../electron/services/ffmpeg/filtergraph');

const VIDEO = path.resolve('/u/v.mp4');
const OVER = path.resolve('/u/over.mp4');
const OUT = path.resolve('/u/out.mp4');

const grants = () => {
  const g = new Grants();
  g.allowMedia(VIDEO);
  g.allowMedia(OVER);
  g.allowOutput(OUT);
  return g;
};

const job = (overlay) => ({
  clips: [{ path: VIDEO, inPoint: 0, outPoint: 4, hasAudio: true, volume: 1, speed: 1 }],
  options: { width: 1080, height: 1920, output: OUT, overlay },
});

describe('validateOverlay', () => {
  it('aceita uma sobreposição válida com valores padrão', () => {
    const out = validateExportJob(job({ path: OVER, start: 0, end: 4 }), grants()).options.overlay;
    expect(out.path).toBe(OVER);
    expect(out.x).toBeCloseTo(0.78);
    expect(out.y).toBeCloseTo(0.78);
    expect(out.scale).toBeCloseTo(0.35);
    expect(out.opacity).toBe(1);
    expect(out.chroma.enabled).toBe(false);
    expect(out.chroma.color).toBe('#00ff00');
  });

  it('é opcional (undefined quando ausente)', () => {
    expect(validateExportJob(job(undefined), grants()).options.overlay).toBeUndefined();
  });

  it('rejeita caminho não autorizado', () => {
    expect(() => validateExportJob(job({ path: path.resolve('/u/outro.mp4'), start: 0, end: 4 }), grants())).toThrow(ValidationError);
  });

  it('rejeita cor de chroma key inválida (cai no padrão em vez de injetar)', () => {
    const out = validateExportJob(
      job({ path: OVER, start: 0, end: 4, chroma: { enabled: true, color: 'javascript:alert(1)' } }),
      grants()
    ).options.overlay;
    expect(out.chroma.color).toBe('#00ff00');
  });

  it('rejeita duração do trecho curta demais', () => {
    expect(() => validateExportJob(
      job({ path: OVER, start: 0, end: 4, inPoint: 1, outPoint: 1.01 }),
      grants()
    )).toThrow(ValidationError);
  });

  it('rejeita fim antes do início', () => {
    expect(() => validateExportJob(job({ path: OVER, start: 2, end: 1 }), grants())).toThrow(ValidationError);
  });
});

describe('overlayInput / overlayFilter', () => {
  const ov = {
    path: OVER, start: 1, end: 3, inPoint: 0.5, outPoint: 2.5, width: 1280, height: 720,
    x: 0.5, y: 0.5, scale: 0.5, opacity: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.2, blend: 0.1 },
  };

  it('overlayInput corta o trecho certo do arquivo', () => {
    const args = overlayInput(ov);
    expect(args).toContain('-ss');
    expect(args[args.indexOf('-ss') + 1]).toBe('0.500');
    expect(args[args.indexOf('-t') + 1]).toBe('2.000');
    expect(args).toContain(OVER);
  });

  it('overlayFilter centra a sobreposição e aplica a janela de tempo', () => {
    const { chain, composite } = overlayFilter(ov, 1, 1080, 1920, 'outv0');
    // largura = 1080*0.5 = 540; altura = 540 * (720/1280) = 303.75 → 304 (par mais próximo)
    expect(chain).toContain('scale=540:-2');
    expect(chain).toContain('tpad=start_duration=1.000:start_mode=add');
    expect(chain).toContain('colorchannelmixer=aa=1.000');
    expect(composite).toContain("enable='between(t\\,1.000\\,3.000)'");
    expect(composite).toContain('[outv0][ov]overlay=');
  });

  it('aplica o filtro de chroma key quando habilitado', () => {
    const { chain } = overlayFilter({ ...ov, chroma: { enabled: true, color: '#00ff00', similarity: 0.2, blend: 0.1 } }, 1, 1080, 1920);
    expect(chain).toContain('colorkey=0x00ff00:0.2:0.1');
  });

  it('não aplica chroma key quando desabilitado', () => {
    const { chain } = overlayFilter(ov, 1, 1080, 1920);
    expect(chain).not.toContain('colorkey');
  });
});

describe('buildGraph com sobreposição', () => {
  const clips = [{ path: VIDEO, inPoint: 0, outPoint: 2, dur: 2, hasAudio: true, volume: 1, speed: 1 }];
  const ov = {
    path: OVER, start: 0, end: 2, inPoint: 0, outPoint: 2, width: 1280, height: 720,
    x: 0.8, y: 0.8, scale: 0.3, opacity: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.2, blend: 0.1 },
  };

  it('sem sobreposição, o grafo não tem segunda entrada de vídeo extra', () => {
    const { graph } = buildGraph(clips, { width: 1080, height: 1920 });
    expect(graph).not.toContain('overlay=x=');
  });

  it('com sobreposição, adiciona a entrada e o filtro overlay=', () => {
    const { graph, inputs } = buildGraph(clips, { width: 1080, height: 1920, overlay: ov });
    expect(graph).toContain('overlay=x=');
    expect(inputs).toContain(OVER);
  });

  it('funciona junto com legenda (encadeia outvov → legenda → outv)', () => {
    const { graph } = buildGraph(clips, { width: 1080, height: 1920, overlay: ov, captionFilter: 'drawtext=text=oi' });
    expect(graph).toContain('[outvov]drawtext=text=oi[outv]');
  });
});

describe('buildConcatArgs com sobreposição', () => {
  it('monta -filter_complex com overlay quando há sobreposição', () => {
    const ov = {
      path: OVER, start: 0, end: 2, inPoint: 0, outPoint: 2, width: 1280, height: 720,
      x: 0.8, y: 0.8, scale: 0.3, opacity: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.2, blend: 0.1 },
    };
    const args = buildConcatArgs('lista.txt', { width: 1080, height: 1920, overlay: ov, total: 2, output: OUT, encoder: 'libx264', crf: 20, preset: 'veryfast' });
    expect(args).toContain('-filter_complex');
    const fc = args[args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('overlay=x=');
  });

  it('sem música nem sobreposição, usa -vf simples (sem filter_complex)', () => {
    const args = buildConcatArgs('lista.txt', { width: 1080, height: 1920, total: 2, output: OUT, encoder: 'libx264', crf: 20, preset: 'veryfast' });
    expect(args).not.toContain('-filter_complex');
  });

  it('overlay + música juntos mapeiam [outv] e [outa]', () => {
    const ov = {
      path: OVER, start: 0, end: 2, inPoint: 0, outPoint: 2, width: 1280, height: 720,
      x: 0.8, y: 0.8, scale: 0.3, opacity: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.2, blend: 0.1 },
    };
    const music = { path: path.resolve('/u/m.mp3'), volume: 0.3, duck: true, fadeIn: 0, fadeOut: 0 };
    const args = buildConcatArgs('lista.txt', { width: 1080, height: 1920, overlay: ov, music, total: 2, output: OUT, encoder: 'libx264', crf: 20, preset: 'veryfast' });
    expect(args).toContain('[outv]');
    expect(args).toContain('[outa]');
  });
});

describe('serializeProject / restoreClips: zoom e vinheta sobrevivem ao salvar e reabrir', () => {
  it('round-trip mantém zoom e vignette', () => {
    const doc = {
      clips: [{ id: 'a', path: VIDEO, name: 'v', duration: 4, inPoint: 0, outPoint: 4, zoom: 'in', vignette: true }],
      aspect: '9:16', fit: 'blur', captions: {}, transcripts: {}, music: null, titles: [], overlay: null,
    };
    const data = serializeProject(doc);
    expect(data.clips[0].zoom).toBe('in');
    expect(data.clips[0].vignette).toBe(true);
    const restored = restoreClips(data.clips, { [VIDEO]: { path: VIDEO, name: 'v', duration: 4 } });
    expect(restored[0].zoom).toBe('in');
    expect(restored[0].vignette).toBe(true);
  });

  it('serializa e remapeia a sobreposição junto com o projeto', () => {
    const doc = {
      clips: [], aspect: '9:16', fit: 'blur', captions: {}, transcripts: {}, music: null, titles: [],
      overlay: { ...OVERLAY_DEFAULTS, path: OVER, name: 'o', duration: 5, width: 1280, height: 720, end: 5 },
    };
    const data = serializeProject(doc);
    expect(data.overlay.path).toBe(OVER);
    expect(overlayFields(doc.overlay).path).toBe(OVER);
  });
});

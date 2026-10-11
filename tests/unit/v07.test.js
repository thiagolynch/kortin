import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import path from 'node:path';
import { require } from './_require';
import { sanitizeTitles, titleLines, titlesForExport, wrapTitle, activeTitleKey } from '../../src/lib/titles';
import { FILTERS, smoothAllJoins, videoFadeBlack, serializeProject, restoreClips } from '../../src/lib/timeline';
import { ASS_FONT_EM } from '../../src/lib/captions';

const { Grants, ValidationError, validateExportJob } = require('../../electron/core/security');
const { buildGraph, colorFilter } = require('../../electron/services/ffmpeg/filtergraph');
const { buildAss } = require('../../electron/services/captions/ass');

const VIDEO = path.resolve('/u/v.mp4');
const OUT = path.resolve('/u/out.mp4');
const g = () => { const x = new Grants(); x.allowMedia(VIDEO); x.allowOutput(OUT); return x; };
const job = (clip = {}, opts = {}) => ({
  clips: [{ path: VIDEO, inPoint: 0, outPoint: 4, hasAudio: true, volume: 1, speed: 1, ...clip }],
  options: { width: 1080, height: 1920, output: OUT, ...opts },
});

describe('filtros de cor', () => {
  it('cada preset vira colorchannelmixer com a mesma matriz da prévia', () => {
    for (const [name, f] of Object.entries(FILTERS)) {
      const s = colorFilter(name);
      if (!f) { expect(s).toBe(''); continue; }
      expect(s).toContain(`rr=${f.matrix[0]}:rg=${f.matrix[1]}`);
      expect(s).toContain(`bb=${f.matrix[8]}`);
      if (f.contrast) expect(s).toContain(`eq=contrast=${f.contrast}`);
    }
  });
  it('P&B: as três linhas da matriz são iguais (sem cor)', () => {
    const m = FILTERS.pb.matrix;
    expect(m.slice(0, 3)).toEqual(m.slice(3, 6));
    expect(m.slice(3, 6)).toEqual(m.slice(6, 9));
  });
  it('filtro desconhecido ou injetado é recusado', () => {
    expect(() => validateExportJob(job({ filter: 'pb,movie=x' }), g())).toThrow(ValidationError);
    expect(validateExportJob(job({ filter: 'quente' }), g()).clips[0].filter).toBe('quente');
  });
});

describe('transições', () => {
  it('camada preta: 1 nas pontas com fade, 0 no meio, nunca fora de 0..1', () => {
    const c = { inPoint: 0, outPoint: 4, speed: 1, videoFadeIn: 0.5, videoFadeOut: 0.5 };
    expect(videoFadeBlack(c, 0)).toBe(1);
    expect(videoFadeBlack(c, 2)).toBe(0);
    expect(videoFadeBlack(c, 4)).toBe(1);
    fc.assert(fc.property(fc.double({ min: -2, max: 8, noNaN: true }), (t) => {
      const v = videoFadeBlack(c, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }));
  });
  it('suavizar emendas: não mexe na entrada do primeiro nem na saída do último', () => {
    const clips = [{}, {}, {}].map((c, i) => ({ id: String(i), videoFadeIn: 0, videoFadeOut: 0 }));
    const r = smoothAllJoins(clips, 0.25);
    expect(r.map((c) => [c.videoFadeIn, c.videoFadeOut])).toEqual([[0, 0.25], [0.25, 0.25], [0.25, 0]]);
  });
  it('fade no grafo fica depois do corte, com início = duração − fade', () => {
    const { graph } = buildGraph([{ path: VIDEO, inPoint: 0, outPoint: 4, hasAudio: true, volume: 1, speed: 1, videoFadeIn: 0.5, videoFadeOut: 1 }], { width: 1080, height: 1080 });
    expect(graph).toMatch(/trim=duration=4\.000,setpts=PTS-STARTPTS,fade=t=in:st=0:d=0\.500,fade=t=out:st=3\.000:d=1\.000\[v0\]/);
  });
  it('fade fora do limite é recusado', () => {
    expect(() => validateExportJob(job({ videoFadeIn: 5 }), g())).toThrow(ValidationError);
  });
  it('cor e transição vão no projeto e voltam', () => {
    const clip = { id: 'a', path: VIDEO, name: 'v', duration: 4, inPoint: 0, outPoint: 4, volume: 1, speed: 1, filter: 'vintage', videoFadeIn: 0.3, videoFadeOut: 0.2 };
    const saved = serializeProject({ clips: [clip], aspect: '9:16', fit: 'blur' }).clips;
    const [back] = restoreClips(saved, { [VIDEO]: { path: VIDEO, name: 'v', duration: 4, width: 1, height: 1, hasAudio: true } });
    expect([back.filter, back.videoFadeIn, back.videoFadeOut]).toEqual(['vintage', 0.3, 0.2]);
    const [bad] = restoreClips([{ ...saved[0], filter: 'hack', videoFadeIn: 99 }], { [VIDEO]: { path: VIDEO, name: 'v', duration: 4 } });
    expect([bad.filter, bad.videoFadeIn]).toEqual(['natural', 2]);
  });
});

describe('títulos', () => {
  it('quebra linhas respeitando o limite e as quebras digitadas', () => {
    expect(wrapTitle('Bastidores do projeto', 14)).toEqual(['Bastidores do', 'projeto']);
    expect(wrapTitle('Linha 1\nLinha 2', 40)).toEqual(['Linha 1', 'Linha 2']);
    fc.assert(fc.property(fc.string({ maxLength: 500 }), fc.integer({ min: 8, max: 60 }), (text, max) => {
      const lines = wrapTitle(text, max);
      expect(lines.length).toBeLessThanOrEqual(6);
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(Math.max(max, 80));
        expect(l).not.toMatch(/\n/);
      }
    }));
  });
  it('vertical cabe menos por linha que horizontal', () => {
    const t = { text: 'Um título razoavelmente comprido aqui', style: 'titulo' };
    expect(titleLines(t, '9:16').length).toBeGreaterThan(titleLines(t, '16:9').length);
  });
  it('sanitiza projeto editado à mão', () => {
    const [t] = sanitizeTitles([{ text: 5, start: -3, duration: 999, style: 'hack', position: 7 }, null]);
    expect(t).toMatchObject({ text: '5', start: 0, duration: 15, style: 'titulo', position: 1 });
    expect(sanitizeTitles('x')).toEqual([]);
  });
  it('títulos ativos no tempo', () => {
    const list = [{ id: 'a', start: 0, duration: 2 }, { id: 'b', start: 1, duration: 2 }];
    expect(activeTitleKey(list, 1.5)).toBe('a|b');
    expect(activeTitleKey(list, 5)).toBe('');
  });
  it('exportação: validação recusa lixo e só gera ValidationError', () => {
    const ok = validateExportJob(job({}, { titles: titlesForExport([{ text: 'Oi', start: 1, duration: 2, style: 'rodape', position: 0.8 }], '9:16') }), g());
    expect(ok.options.titles).toEqual([{ start: 1, end: 3, lines: ['Oi'], style: 'rodape', position: 0.8, color: null, accent: null, anim: 'fade', headline: false }]);
    expect(() => validateExportJob(job({}, { titles: [{ start: 2, end: 1, lines: ['x'] }] }), g())).toThrow(ValidationError);
    fc.assert(fc.property(fc.anything(), (titles) => {
      try { validateExportJob(job({}, { titles }), g()); } catch (e) { expect(e).toBeInstanceOf(ValidationError); }
    }), { numRuns: 300 });
  });
  it('texto do título não injeta tags no .ass; fica acima da legenda', () => {
    fc.assert(fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 3 }), (lines) => {
      const ass = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines, style: 'titulo', position: 0.5 }]);
      const ev = ass.split('\n').find((l) => l.startsWith('Dialogue: 1,'));
      if (!ev) return;
      const body = ev.slice(ev.indexOf('}') + 1).split('\\N').join('');
      expect(body).not.toMatch(/[{}\\\u0000-\u001f]/);
    }));
  });
  it('fator da fonte libass/CSS documentado (Montserrat: win ascent+descent)', () => {
    expect(ASS_FONT_EM).toBeCloseTo((1109 + 453) / 1000, 3);
  });
  it('cor custom do título vira override no .ass: \\4c3c na caixa (Destaque), \\3c no contorno (Título)', () => {
    const boxed = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines: ['Oi'], style: 'destaque', position: 0.5, color: '#ff0000', accent: '#00ff00' }]);
    const evBoxed = boxed.split('\n').find((l) => l.startsWith('Dialogue: 1,'));
    expect(evBoxed).toContain('\\c&H000000FF'); // #ff0000 (RGB) → &HAABBGGRR
    expect(evBoxed).toContain('\\4c&H0000FF00'); // #00ff00
    expect(evBoxed).toContain('\\3c&H0000FF00');

    const outlined = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines: ['Oi'], style: 'titulo', position: 0.5, accent: '#0000ff' }]);
    const evOutlined = outlined.split('\n').find((l) => l.startsWith('Dialogue: 1,'));
    expect(evOutlined).toContain('\\3c&H00FF0000'); // #0000ff
    expect(evOutlined).not.toMatch(/\\4c/);
  });
  it('título sem cor custom não gera override (continua com a cor do estilo)', () => {
    const ass = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines: ['Oi'], style: 'titulo', position: 0.5 }]);
    const ev = ass.split('\n').find((l) => l.startsWith('Dialogue: 1,'));
    expect(ev).not.toMatch(/\\c&H|\\3c&H|\\4c&H/);
  });
  it('animação "pop" soma escala animada (\\t) ao fade; "fade" (padrão) só tem \\fad', () => {
    const pop = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines: ['Oi'], style: 'titulo', position: 0.5, anim: 'pop' }]);
    expect(pop).toMatch(/\\fscx72\\fscy72\\t\(0,220,\\fscx100\\fscy100\)/);
    const fade = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines: ['Oi'], style: 'titulo', position: 0.5, anim: 'fade' }]);
    expect(fade).not.toMatch(/\\t\(/);
    expect(fade).toMatch(/\\fad\(200,200\)/);
  });
  it('cor inválida é recusada na exportação; cor válida passa', () => {
    expect(() => validateExportJob(job({}, { titles: [{ start: 0, end: 1, lines: ['x'], color: 'javascript:alert(1)' }] }), g())).toThrow(ValidationError);
    expect(() => validateExportJob(job({}, { titles: [{ start: 0, end: 1, lines: ['x'], accent: '#zzzzzz' }] }), g())).toThrow(ValidationError);
    const ok = validateExportJob(job({}, { titles: [{ start: 0, end: 1, lines: ['x'], color: '#ABCDEF' }] }), g());
    expect(ok.options.titles[0].color).toBe('#abcdef');
  });
  it('estilo "sublinhado" gera Underline=-1 na Style do .ass', () => {
    const ass = buildAss([], { style: 'classica' }, 1080, 1920, []);
    const line = ass.split('\n').find((l) => l.startsWith('Style: T_sublinhado,'));
    expect(line.split(',')[9]).toBe('-1'); // campo Underline
    const outros = ['titulo', 'destaque', 'rodape'].map((n) => ass.split('\n').find((l) => l.startsWith(`Style: T_${n},`)));
    for (const l of outros) expect(l.split(',')[9]).toBe('0');
  });
  it('cada preset de título tem seu próprio "Spacing" (identidade tipográfica sem fonte nova)', () => {
    const ass = buildAss([], { style: 'classica' }, 1080, 1920, []);
    const spacing = (name) => Number(ass.split('\n').find((l) => l.startsWith(`Style: T_${name},`)).split(',')[13]);
    expect(spacing('titulo')).toBe(0);
    expect(spacing('destaque')).toBe(0.6);
    expect(spacing('rodape')).toBe(0.3);
    expect(spacing('sublinhado')).toBe(-0.3);
  });
  it('"headline" (título + subtítulo) gera \\fs por linha, maior na 1ª e menor nas seguintes', () => {
    const ass = buildAss([], { style: 'classica' }, 1080, 1920, [
      { start: 0, end: 1, lines: ['GRANDE', 'pequeno'], style: 'titulo', position: 0.5, headline: true },
    ]);
    const ev = ass.split('\n').find((l) => l.startsWith('Dialogue: 1,'));
    const sizes = [...ev.matchAll(/\\fs(\d+)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBe(2);
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
    expect(sizes[1]).toBe(Math.round(sizes[0] * 0.62));
  });
  it('sem "headline" ou com 1 linha só, não gera \\fs extra', () => {
    const one = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines: ['Só uma linha'], style: 'titulo', position: 0.5, headline: true }]);
    expect(one.split('\n').find((l) => l.startsWith('Dialogue: 1,'))).not.toMatch(/\\fs\d/);
    const off = buildAss([], { style: 'classica' }, 1080, 1920, [{ start: 0, end: 1, lines: ['A', 'B'], style: 'titulo', position: 0.5, headline: false }]);
    expect(off.split('\n').find((l) => l.startsWith('Dialogue: 1,'))).not.toMatch(/\\fs\d/);
  });
  it('"headline" é sempre booleano, mesmo vindo de lixo', () => {
    const ok = validateExportJob(job({}, { titles: [{ start: 0, end: 1, lines: ['x'], headline: 'sim' }] }), g());
    expect(ok.options.titles[0].headline).toBe(true);
    const ok2 = validateExportJob(job({}, { titles: [{ start: 0, end: 1, lines: ['x'] }] }), g());
    expect(ok2.options.titles[0].headline).toBe(false);
  });
});

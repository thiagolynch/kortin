import { describe, expect, it } from 'vitest';
import { require } from './_require';
import { keywordColorFor, normWord } from '../../src/lib/captions';

const { validateCaptions, ValidationError } = require('../../electron/core/security');
const { buildAss } = require('../../electron/services/captions/ass');

const cue = (text, start, dur = 1) => {
  const words = text.split(' ').map((w, i) => ({ start: start + i * 0.3, end: start + i * 0.3 + 0.25, text: w }));
  return { start, end: start + dur, words };
};

const baseSettings = (extra = {}) => ({ style: 'classica', position: 0.72, size: 'm', uppercase: null, ...extra });

describe('validateCaptions: cor/palavras-chave/empilhado', () => {
  it('aceita color/accent/keywords/stacked válidos e normaliza a cor da palavra-chave', () => {
    const out = validateCaptions({
      cues: [{ start: 0, end: 1, words: [{ start: 0, end: 1, text: 'oi' }] }],
      settings: { color: '#FFFFFF', accent: '#ABCDEF', keywords: [{ word: '30%', color: '#FF0000' }], stacked: true },
    });
    expect(out.settings.color).toBe('#ffffff');
    expect(out.settings.accent).toBe('#abcdef');
    expect(out.settings.stacked).toBe(true);
    expect(out.settings.keywords).toEqual([{ word: '30%', color: '#ff0000' }]);
  });

  it('rejeita cor de palavra-chave inválida', () => {
    expect(() => validateCaptions({
      cues: [{ start: 0, end: 1, words: [{ start: 0, end: 1, text: 'oi' }] }],
      settings: { keywords: [{ word: 'x', color: 'not-a-color' }] },
    })).toThrow(ValidationError);
  });

  it('corta a lista de palavras-chave em 20 e remove vazias', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ word: `w${i}`, color: '#112233' }));
    many.push({ word: '   ', color: '#112233' });
    const out = validateCaptions({
      cues: [{ start: 0, end: 1, words: [{ start: 0, end: 1, text: 'oi' }] }],
      settings: { keywords: many },
    });
    expect(out.settings.keywords.length).toBe(20);
    expect(out.settings.keywords.every((k) => k.word)).toBe(true);
  });

  it('color/accent ausentes ficam null (padrão do estilo)', () => {
    const out = validateCaptions({
      cues: [{ start: 0, end: 1, words: [{ start: 0, end: 1, text: 'oi' }] }],
      settings: {},
    });
    expect(out.settings.color).toBeNull();
    expect(out.settings.accent).toBeNull();
    expect(out.settings.keywords).toEqual([]);
    expect(out.settings.stacked).toBe(false);
  });
});

describe('normWord / keywordColorFor (prévia, ESM)', () => {
  it('ignora pontuação e caixa', () => {
    expect(normWord('30%,')).toBe('30');
    expect(normWord('"Grátis!"')).toBe('grátis');
  });
  it('acha a cor pela palavra normalizada', () => {
    const kws = [{ word: 'Grátis!', color: '#22d3ee' }];
    expect(keywordColorFor('grátis', kws)).toBe('#22d3ee');
    expect(keywordColorFor('outra', kws)).toBeNull();
  });
});

describe('buildAss: cor customizável', () => {
  it('settings.color troca a PrimaryColour do estilo base', () => {
    const ass = buildAss([cue('ola mundo', 0)], baseSettings({ color: '#ff0000' }), 1080, 1920);
    // &HAABBGGRR -> ff0000 vira 0000FF (bb gg rr invertido)
    expect(ass).toContain('&H000000FF');
  });

  it('settings.accent troca a cor de destaque (palavra ativa) no estilo destaque', () => {
    const ass = buildAss([cue('ola mundo', 0)], baseSettings({ style: 'destaque', accent: '#00ff00' }), 1080, 1920);
    expect(ass).toContain('&H0000FF00');
  });

  it('settings.accent troca a cor do box no estilo caixa', () => {
    const ass = buildAss([cue('ola mundo', 0)], baseSettings({ style: 'caixa', accent: '#123456' }), 1080, 1920);
    expect(ass.toUpperCase()).toContain('&H50563412');
  });

  it('settings.accent troca a cor do contorno/brilho no estilo neon', () => {
    const ass = buildAss([cue('ola mundo', 0)], baseSettings({ style: 'neon', accent: '#abcdef' }), 1080, 1920);
    expect(ass.toUpperCase()).toContain('&H00EFCDAB');
  });
});

describe('buildAss: palavras-chave coloridas', () => {
  it('estilo sem destaque (classica): evento único, palavra-chave ganha \\c embutido', () => {
    const ass = buildAss(
      [cue('economize 30% hoje', 0)],
      baseSettings({ keywords: [{ word: '30%', color: '#ff00ff' }] }),
      1080, 1920,
    );
    const line = ass.split('\n').find((l) => l.startsWith('Dialogue: 0,'));
    expect(line).toBeTruthy();
    expect(line).toContain('\\c&H00FF00FF');
  });

  it('estilo com destaque (word-by-word): palavra-chave colorida também quando não é a ativa', () => {
    const ass = buildAss(
      [cue('economize 30% hoje', 0)],
      baseSettings({ style: 'destaque', keywords: [{ word: '30%', color: '#ff00ff' }] }),
      1080, 1920,
    );
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue: 0,'));
    expect(lines.length).toBe(3); // uma por palavra
    expect(lines.some((l) => l.includes('FF00FF'))).toBe(true);
  });
});

describe('buildAss: legenda empilhada', () => {
  it('sem stacked, nenhuma linha de contexto (sem \\alpha de dimLine)', () => {
    const ass = buildAss([cue('um', 0), cue('dois', 1), cue('tres', 2)], baseSettings({ stacked: false }), 1080, 1920);
    expect(ass).not.toContain('\\alpha&H60&');
  });

  it('com stacked, a 3ª legenda traz as 2 anteriores como contexto apagado', () => {
    const ass = buildAss([cue('um', 0), cue('dois', 1), cue('tres', 2)], baseSettings({ stacked: true }), 1080, 1920);
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue: 0,'));
    const third = lines[2];
    expect(third).toContain('\\alpha&H60&');
    expect(third).toContain('\\fscx82\\fscy82');
    expect(third.toLowerCase()).toContain('um');
    expect(third.toLowerCase()).toContain('dois');
  });

  it('com stacked, a 1ª legenda não tem contexto (nada antes dela)', () => {
    const ass = buildAss([cue('um', 0), cue('dois', 1)], baseSettings({ stacked: true }), 1080, 1920);
    const lines = ass.split('\n').filter((l) => l.startsWith('Dialogue: 0,'));
    expect(lines[0]).not.toContain('\\alpha&H60&');
  });
});

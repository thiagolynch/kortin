// Títulos de texto: camada livre sobre o vídeo (não segue os cortes, fica no tempo da timeline).
// A quebra de linha é feita aqui, uma vez: a prévia mostra exatamente as linhas que vão para o .ass.
import C from '../../shared/constants.json';
import { clamp, uid } from './timeline';

export const TITLE_STYLES = {
  titulo: { label: 'Título', size: 0.078, position: 0.45 },
  destaque: { label: 'Destaque', size: 0.05, position: 0.3 },
  rodape: { label: 'Rodapé', size: 0.036, position: 0.82 },
  sublinhado: { label: 'Sublinhado', size: 0.068, position: 0.3 },
};

/**
 * Fator entre o Fontsize do .ass e o font-size do CSS, por fonte (ver ASS_FONT_EM em lib/captions.js
 * para a explicação — aqui é o mesmo cálculo, mas cada fonte de título tem sua própria proporção
 * ascent+descent/em, medida nos arquivos em assets/fonts/ com fontTools: usWinAscent+usWinDescent,
 * dividido pelas unidades por em da fonte).
 */
export const TITLE_FONT_EM = {
  titulo: 1.7334, // Anton (2876+674)/2048
  destaque: 1.347, // Archivo Black (1035+312)/1000
  rodape: 1.562, // Montserrat (1109+453)/1000 — mesma fonte das legendas
  sublinhado: 1.3, // Bebas Neue (950+350)/1000
};

export const TITLE_LIMITS = { minDuration: 0.5, maxDuration: 15, maxLines: C.LIMITS.maxTitleLines, maxChars: C.LIMITS.maxTitleChars };
export const TITLE_ANIMS = { fade: 'Aparece', pop: 'Salta' };
// Tamanho das linhas depois da 1ª quando "título + subtítulo" está ligado — mesmo valor usado no .ass (ass.js)
export const HEADLINE_SUB_SCALE = 0.62;

// Combinações de cor prontas (texto + destaque) para não depender só do seletor nativo do navegador.
export const TITLE_SWATCHES = [
  { label: 'Padrão', color: null, accent: null },
  { label: 'Branco e preto', color: '#ffffff', accent: '#000000' },
  { label: 'Preto e dourado', color: '#111111', accent: '#f5c94b' },
  { label: 'Branco e vermelho', color: '#ffffff', accent: '#d62828' },
  { label: 'Branco e roxo', color: '#ffffff', accent: '#7c3aed' },
  { label: 'Preto e verde-água', color: '#0b3a39', accent: '#5eead4' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const sanitizeHex = (v) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : null);

// Caracteres por linha por formato (vertical cabe menos)
const CHARS = {
  '9:16': { titulo: 14, destaque: 20, rodape: 30, sublinhado: 19 },
  '4:5': { titulo: 16, destaque: 22, rodape: 32, sublinhado: 21 },
  '1:1': { titulo: 18, destaque: 24, rodape: 36, sublinhado: 23 },
  '16:9': { titulo: 26, destaque: 34, rodape: 52, sublinhado: 33 },
};

export function newTitle(at = 0, style = 'titulo') {
  return {
    id: uid(), text: 'Seu título aqui', start: Math.max(0, at), duration: 3, style,
    position: TITLE_STYLES[style].position, color: null, accent: null, anim: 'pop', headline: false,
  };
}

/** Quebra o texto em linhas (respeita as quebras digitadas; palavras longas demais são cortadas). */
export function wrapTitle(text, maxChars) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    let line = '';
    for (const raw of para.split(/\s+/).filter(Boolean)) {
      const word = raw.slice(0, TITLE_LIMITS.maxChars);
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out.slice(0, TITLE_LIMITS.maxLines);
}

export const titleLines = (t, aspect) => wrapTitle(t.text, (CHARS[aspect] || CHARS['9:16'])[t.style] || 20);

/** Normaliza o que veio de um projeto (arquivo pode ter sido editado à mão). */
export function sanitizeTitles(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && typeof t === 'object')
    .slice(0, C.LIMITS.maxTitles)
    .map((t) => ({
      id: typeof t.id === 'string' ? t.id : uid(),
      text: String(t.text ?? '').slice(0, 400),
      start: clamp(Number(t.start) || 0, 0, C.LIMITS.maxDurationSeconds),
      duration: clamp(Number(t.duration) || 3, TITLE_LIMITS.minDuration, TITLE_LIMITS.maxDuration),
      style: TITLE_STYLES[t.style] ? t.style : 'titulo',
      position: clamp(Number(t.position ?? 0.5), 0, 1),
      color: sanitizeHex(t.color),
      accent: sanitizeHex(t.accent),
      anim: C.TITLE_ANIMS.includes(t.anim) ? t.anim : 'fade',
      headline: !!t.headline,
    }));
}

/** O que vai para a exportação: tempo, linhas prontas, estilo, altura, cor, animação e destaque da 1ª linha. */
export function titlesForExport(titles, aspect) {
  return titles
    .map((t) => ({
      start: t.start, end: t.start + t.duration, lines: titleLines(t, aspect), style: t.style, position: t.position,
      color: t.color, accent: t.accent, anim: t.anim, headline: t.headline,
    }))
    .filter((t) => t.lines.length);
}

/** Ids dos títulos visíveis no instante t, como texto (primitivo para o seletor do cursor). */
export const activeTitleKey = (titles, t) => titles.filter((x) => t >= x.start && t < x.start + x.duration).map((x) => x.id).join('|');

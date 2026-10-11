// Legendas: transformam as palavras transcritas (tempo do arquivo original) em
// legendas na linha do tempo, que acompanham cortes, velocidade e reordenação.
import { MIN_CLIP, clamp, uid } from './timeline';

export const CAPTION_STYLES = {
  classica: { label: 'Clássica', size: 0.05, upper: false },
  destaque: { label: 'Destaque', size: 0.058, upper: true },
  caixa: { label: 'Caixa', size: 0.046, upper: false },
  neon: { label: 'Neon', size: 0.054, upper: true },
};

export const CAPTION_SIZES = { p: 0.8, m: 1, g: 1.25 };

/**
 * Fator entre o tamanho de fonte do .ass (libass) e o font-size do CSS para a Montserrat.
 * A libass faz o tamanho caber em usWinAscent + usWinDescent (1109 + 453 = 1562 unidades por 1000),
 * o CSS usa o "em" (1000). Medido: "H" com Fontsize 400 sai com 179 px de altura = 0,7 em de 255,7 px.
 * Sem este fator, a prévia mostrava o texto ~56% maior do que o vídeo exportado.
 */
export const ASS_FONT_EM = 1.562;

/** Quantos caracteres cabem numa legenda, por formato (vertical = frases curtas, estilo Reels) */
export const MAX_CHARS = { '9:16': 22, '4:5': 26, '1:1': 28, '16:9': 42 };

export const LANGUAGES = { pt: 'Português', en: 'English', es: 'Español' };

export const DEFAULT_CAPTIONS = {
  enabled: true,
  style: 'destaque',
  position: 0.72,
  size: 'm',
  uppercase: null, // null = o padrão do estilo
  model: 'rapido',
  language: 'pt',
};

// Vícios de linguagem: os seguros vêm marcados; "né" e "tipo" às vezes têm sentido, então ficam opcionais
export const FILLERS = [
  { word: 'é', forms: ['é', 'éé', 'ééé', 'eh', 'ehh'], on: true },
  { word: 'ãh', forms: ['ã', 'ãh', 'ãã', 'ah', 'ahn', 'ahh', 'hã', 'han'], on: true },
  { word: 'hum', forms: ['hum', 'humm', 'hm', 'hmm', 'um', 'uhm', 'uh'], on: true },
  { word: 'né', forms: ['né'], on: false },
  { word: 'tipo', forms: ['tipo'], on: false },
];

const norm = (w) => w.toLocaleLowerCase('pt-BR').replace(/[.,!?;:…"'()]/g, '').trim();

/**
 * Monta as legendas da linha do tempo.
 * Cada legenda guarda de onde veio (arquivo + índices das palavras) para poder ser editada.
 */
export function deriveCues(segments, transcripts, { maxChars = 28, maxDur = 3.5, gap = 0.6 } = {}) {
  const cues = [];
  for (const seg of segments) {
    const c = seg.clip;
    const words = transcripts?.[c.path]?.words;
    if (!words?.length) continue;
    const speed = c.speed || 1;
    const toTimeline = (s) => seg.start + (s - c.inPoint) / speed;
    let cur = null;
    let chars = 0;
    const flush = () => {
      if (cur?.words.length) cues.push(cur);
      cur = null;
      chars = 0;
    };
    const open = (word) => {
      cur = { id: `${c.id}:${word.idx}`, start: word.start, end: word.end, words: [word] };
      chars = word.text.length;
    };
    // busca binária da primeira palavra que termina depois do início do clipe:
    // O(log W + palavras do trecho), em vez de percorrer a transcrição inteira por clipe
    for (let idx = firstWordEndingAfter(words, c.inPoint); idx < words.length; idx++) {
      const w = words[idx];
      if (w.s >= c.outPoint) break;
      if (w.e <= c.inPoint) continue;
      const start = toTimeline(Math.max(w.s, c.inPoint));
      const end = toTimeline(Math.min(w.e, c.outPoint));
      if (end - start < 0.02) continue;
      const word = { start, end, text: w.w, path: c.path, idx };
      if (!cur) {
        open(word);
        continue;
      }
      const prev = cur.words[cur.words.length - 1];
      const sentenceEnd = /[.!?…]$/.test(prev.text);
      const tooLong = chars + 1 + w.w.length > maxChars;
      if (tooLong || start - prev.end > gap || end - cur.start > maxDur || sentenceEnd) {
        // não termina a legenda com palavra solta ("o", "de", "um"): ela passa para a próxima
        let carry = null;
        if (!sentenceEnd && cur.words.length > 1 && prev.text.length <= 3 && !/[,;:]$/.test(prev.text)) {
          carry = cur.words.pop();
          cur.end = cur.words[cur.words.length - 1].end;
        }
        flush();
        if (carry) {
          open(carry);
          cur.words.push(word);
          cur.end = word.end;
          chars += 1 + word.text.length;
        } else {
          open(word);
        }
        continue;
      }
      cur.words.push(word);
      cur.end = end;
      chars += 1 + w.w.length;
    }
    flush();
  }
  // a legenda fica na tela até a próxima começar (sem piscar em pausas curtas)
  for (let i = 0; i < cues.length - 1; i++) {
    const nextStart = cues[i + 1].start;
    if (nextStart - cues[i].end < 0.5) cues[i].end = nextStart;
  }
  return cues;
}

/** Índice da primeira palavra com fim > t (palavras em ordem de tempo). */
export function firstWordEndingAfter(words, t) {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].e <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function cueText(cue) {
  return cue.words.map((w) => w.text).join(' ');
}

/** Índice da legenda que cobre o tempo t, ou -1 (busca binária: vídeos longos têm milhares) */
export function cueIndexAt(cues, t) {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues.at(mid);
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export function cueAt(cues, t) {
  const i = cueIndexAt(cues, t);
  return i < 0 ? null : cues.at(i);
}

/**
 * Corrige o texto de uma legenda: troca as palavras originais pelas novas,
 * espalhando o tempo entre elas. Texto vazio apaga a legenda.
 */
export function editCue(transcripts, cue, newText) {
  const byPath = cue.words[0]?.path;
  const tr = transcripts[byPath];
  if (!tr) return transcripts;
  const idxs = cue.words.map((w) => w.idx);
  const i0 = Math.min(...idxs);
  const i1 = Math.max(...idxs);
  const s0 = tr.words.at(i0).s;
  const e1 = tr.words.at(i1).e;
  const tokens = newText.trim().split(/\s+/).filter(Boolean);
  const totalChars = tokens.reduce((n, t) => n + t.length, 0) || 1;
  let t = s0;
  const replacement = tokens.map((w) => {
    const d = ((e1 - s0) * w.length) / totalChars;
    const word = { s: t, e: t + d, w };
    t += d;
    return word;
  });
  const words = [...tr.words.slice(0, i0), ...replacement, ...tr.words.slice(i1 + 1)];
  return { ...transcripts, [byPath]: { ...tr, words, edited: true } };
}

// ---------------- Sugestões de corte (Módulo 3: o app sugere, a pessoa decide) ----------------

const PAD = 0.12; // folga em volta da fala: o tempo das palavras do whisper não é exato
export const CUT_TYPES = {
  pause: { label: 'Pausa', defaultOn: true },
  filler: { label: 'Vício', defaultOn: true },
  restart: { label: 'Reinício', defaultOn: false }, // heurística: começa desmarcado, a pessoa confere
};

/**
 * Frase reiniciada: a pessoa começa ("hoje eu vou…"), para e recomeça ("hoje eu vou mostrar").
 * Procura, perto adiante, as mesmas 2 palavras de abertura. Corta da primeira tentativa até o recomeço.
 * Devolve pares de índices [i, j]: i = início da tentativa abandonada, j = início do recomeço.
 */
export function findRestarts(words, { window = 12, maxSeconds = 8 } = {}) {
  const t = words.map((w) => norm(w.w));
  const out = [];
  for (let i = 0; i < words.length - 3; i++) {
    if (!t[i] || !t[i + 1]) continue;
    for (let j = i + 2; j < Math.min(words.length - 1, i + 2 + window); j++) {
      if (words[j].s - words[i].s > maxSeconds) break;
      if (t[j] === t[i] && t[j + 1] === t[i + 1]) {
        out.push([i, j]);
        i = j - 1; // continua depois do recomeço (sem sugestões sobrepostas)
        break;
      }
    }
  }
  return out;
}

/**
 * Lista as sugestões de corte. Não muda nada: a interface mostra, a pessoa aceita ou rejeita.
 * Cada sugestão: { id, type, clipId, srcStart, srcEnd, start, end, seconds, reason }
 *  - src*  = tempo no arquivo original (o que o corte usa)
 *  - start/end = posição na linha do tempo (para marcar e ouvir)
 * O id é estável enquanto o clipe não muda: aceitar/rejeitar sobrevive a recalcular a lista.
 */
export function suggestCuts(clips, transcripts, { minPause = 0.7, fillers = [], restarts = true } = {}) {
  const fillerSet = new Set(fillers.flatMap((f) => f.forms));
  const out = [];
  let t0 = 0;
  for (const c of clips) {
    const speed = c.speed || 1;
    const segStart = t0;
    t0 += (c.outPoint - c.inPoint) / speed;
    const words = (transcripts?.[c.path]?.words || []).filter((w) => w.e > c.inPoint && w.s < c.outPoint);
    if (!words.length) continue;
    const add = (type, a, b, reason) => {
      const s = clamp(a, c.inPoint, c.outPoint);
      const e = clamp(b, c.inPoint, c.outPoint);
      if (e - s < 0.05) return;
      out.push({
        id: `${c.id}:${type}:${s.toFixed(2)}`,
        type, clipId: c.id, srcStart: s, srcEnd: e,
        start: segStart + (s - c.inPoint) / speed,
        end: segStart + (e - c.inPoint) / speed,
        seconds: (e - s) / speed,
        reason,
      });
    };
    const fmt = (x) => `${x.toFixed(1).replace('.', ',')} s`;
    if (minPause > 0) {
      if (words[0].s - c.inPoint > minPause) add('pause', c.inPoint, words[0].s - PAD, `Silêncio de ${fmt(words[0].s - c.inPoint)} no início`);
      for (let i = 0; i < words.length - 1; i++) {
        const gap = words[i + 1].s - words[i].e;
        if (gap > minPause) add('pause', words[i].e + PAD, words[i + 1].s - PAD, `Pausa de ${fmt(gap)} depois de “${words[i].w}”`);
      }
      const last = words[words.length - 1];
      if (c.outPoint - last.e > minPause) add('pause', last.e + PAD, c.outPoint, `Silêncio de ${fmt(c.outPoint - last.e)} no fim`);
    }
    if (fillerSet.size) {
      for (const w of words) if (fillerSet.has(norm(w.w))) add('filler', w.s - 0.03, w.e + 0.03, `“${w.w}”`);
    }
    if (restarts) {
      for (const [i, j] of findRestarts(words)) {
        const abandoned = words.slice(i, j).map((w) => w.w).join(' ');
        add('restart', words[i].s - 0.03, words[j].s - 0.05, `Recomeçou: “${abandoned.length > 48 ? `${abandoned.slice(0, 47)}…` : abandoned}”`);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Aplica só as sugestões aceitas: divide os clipes e remove os trechos (sobreposições são unidas).
 * Retorna { clips, cuts, seconds }. Nunca deixa clipe menor que MIN_CLIP nem apaga um clipe inteiro.
 */
export function applyCuts(clips, accepted) {
  const byClip = new Map();
  for (const s of accepted) {
    if (!byClip.has(s.clipId)) byClip.set(s.clipId, []);
    byClip.get(s.clipId).push([s.srcStart, s.srcEnd]);
  }
  let cuts = 0;
  let seconds = 0;
  const out = [];
  for (const c of clips) {
    const remove = byClip.get(c.id);
    if (!remove?.length) {
      out.push(c);
      continue;
    }
    remove.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of remove) {
      const s = clamp(a, c.inPoint, c.outPoint);
      const e = clamp(b, c.inPoint, c.outPoint);
      if (e - s <= 0) continue;
      const lastR = merged[merged.length - 1];
      if (lastR && s <= lastR[1]) lastR[1] = Math.max(lastR[1], e);
      else merged.push([s, e]);
    }
    const keep = [];
    let cursor = c.inPoint;
    for (const [s, e] of merged) {
      if (s - cursor >= MIN_CLIP) keep.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (c.outPoint - cursor >= MIN_CLIP) keep.push([cursor, c.outPoint]);
    const kept = keep.reduce((n, [a, b]) => n + (b - a), 0);
    const removedHere = (c.outPoint - c.inPoint - kept) / (c.speed || 1);
    if (!keep.length || removedHere < 0.05) {
      out.push(c);
      continue;
    }
    cuts += merged.length;
    seconds += removedHere;
    keep.forEach(([a, b], i) => {
      out.push({
        ...c,
        id: i === 0 ? c.id : uid(),
        inPoint: a,
        outPoint: b,
        fadeIn: i === 0 ? c.fadeIn : 0,
        fadeOut: i === keep.length - 1 ? c.fadeOut : 0,
      });
    });
  }
  return { clips: out, cuts, seconds };
}

/** Atalho: todas as pausas e vícios de uma vez (comportamento da v0.5). */
export function planCleanup(clips, transcripts, { pauses = true, minPause = 0.7, fillers = [] } = {}) {
  return applyCuts(clips, suggestCuts(clips, transcripts, { minPause: pauses ? minPause : 0, fillers, restarts: false }));
}

/** O que vai para a exportação: só tempos e textos */
export function cuesForExport(cues) {
  return cues.map((c) => ({
    start: c.start,
    end: c.end,
    words: c.words.map((w) => ({ start: w.start, end: w.end, text: w.text })),
  }));
}

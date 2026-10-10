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
    const tr = transcripts?.[c.path];
    if (!tr?.words?.length) continue;
    const speed = c.speed || 1;
    const toTimeline = (s) => seg.start + (s - c.inPoint) / speed;
    let cur = null;
    const flush = () => {
      if (cur?.words.length) cues.push(cur);
      cur = null;
    };
    tr.words.forEach((w, idx) => {
      if (w.e <= c.inPoint || w.s >= c.outPoint) return;
      const start = toTimeline(Math.max(w.s, c.inPoint));
      const end = toTimeline(Math.min(w.e, c.outPoint));
      if (end - start < 0.02) return;
      const word = { start, end, text: w.w, path: c.path, idx };
      if (cur) {
        const prev = cur.words[cur.words.length - 1];
        const chars = cur.words.reduce((n, x) => n + x.text.length + 1, 0) + w.w.length;
        const sentenceEnd = /[.!?…]$/.test(prev.text);
        if (chars > maxChars || start - prev.end > gap || end - cur.start > maxDur || sentenceEnd) {
          // não termina a legenda com palavra solta ("o", "de", "um"): ela passa para a próxima
          let carry = null;
          if (!sentenceEnd && cur.words.length > 1 && prev.text.length <= 3 && !/[,;:]$/.test(prev.text)) {
            carry = cur.words.pop();
            cur.end = cur.words[cur.words.length - 1].end;
          }
          flush();
          if (carry) cur = { id: `${c.id}:${carry.idx}`, start: carry.start, end: carry.end, words: [carry] };
        }
      }
      if (!cur) cur = { id: `${c.id}:${idx}`, start, end, words: [] };
      cur.words.push(word);
      cur.end = end;
    });
    flush();
  }
  // a legenda fica na tela até a próxima começar (sem piscar em pausas curtas)
  for (let i = 0; i < cues.length - 1; i++) {
    const nextStart = cues[i + 1].start;
    if (nextStart - cues[i].end < 0.5) cues[i].end = nextStart;
  }
  return cues;
}

export function cueText(cue) {
  return cue.words.map((w) => w.text).join(' ');
}

export function cueAt(cues, t) {
  // busca binária: muitas legendas em vídeos longos
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues.at(mid);
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }
  return null;
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

/**
 * Planeja a "limpeza da fala": corta pausas longas e vícios de linguagem dos clipes com transcrição.
 * Retorna { clips, cuts, seconds } sem alterar nada (a interface mostra o resumo antes de aplicar).
 */
export function planCleanup(clips, transcripts, { pauses = true, minPause = 0.7, fillers = [] } = {}) {
  const fillerSet = new Set(fillers.flatMap((f) => f.forms));
  const pad = 0.12;
  let cuts = 0;
  let seconds = 0;
  const out = [];

  for (const c of clips) {
    const words = (transcripts?.[c.path]?.words || []).filter((w) => w.e > c.inPoint && w.s < c.outPoint);
    if (!words.length) {
      out.push(c);
      continue;
    }
    const remove = [];
    if (pauses) {
      if (words[0].s - c.inPoint > minPause) remove.push([c.inPoint, words[0].s - pad]);
      for (let i = 0; i < words.length - 1; i++) {
        const a = words[i];
        const b = words[i + 1];
        if (b.s - a.e > minPause) remove.push([a.e + pad, b.s - pad]);
      }
      const last = words[words.length - 1];
      if (c.outPoint - last.e > minPause) remove.push([last.e + pad, c.outPoint]);
    }
    if (fillerSet.size) {
      for (const w of words) if (fillerSet.has(norm(w.w))) remove.push([w.s - 0.03, w.e + 0.03]);
    }
    if (!remove.length) {
      out.push(c);
      continue;
    }

    // junta trechos sobrepostos e calcula o que fica
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
    if (!keep.length) {
      out.push(c);
      continue;
    }

    const kept = keep.reduce((n, [a, b]) => n + (b - a), 0);
    const removedHere = (c.outPoint - c.inPoint - kept) / (c.speed || 1);
    if (removedHere < 0.05) {
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

/** O que vai para a exportação: só tempos e textos */
export function cuesForExport(cues) {
  return cues.map((c) => ({
    start: c.start,
    end: c.end,
    words: c.words.map((w) => ({ start: w.start, end: w.end, text: w.text })),
  }));
}

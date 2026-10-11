// Melhores momentos: monta o trabalho de exportação de um "short" pronto para TikTok, Instagram
// Reels e YouTube Shorts a partir de um trecho sugerido — os três usam o mesmo formato vertical
// (9:16), então um corte só já serve para todos.
import { ASPECTS, QUALITIES, baseName } from './timeline';

export const HIGHLIGHT_ASPECT = '9:16';

/** Nome de arquivo sugerido para o short (baseado no vídeo de origem e no instante do corte). */
export function highlightFileName(clip, h) {
  const base = baseName(clip.name || clip.path).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '');
  return `${base}-momento-${Math.round(h.start)}s.mp4`;
}

/** Trabalho de exportação (mesmo formato que a fila de exportação já aceita) para 1 trecho sugerido. */
export function buildHighlightJob(clip, h, output) {
  const a = ASPECTS[HIGHLIGHT_ASPECT];
  const q = QUALITIES.padrao;
  return {
    label: `${a.hint} · ${baseName(output)}`,
    output,
    duration: h.end - h.start,
    clips: [{
      path: clip.path, inPoint: h.start, outPoint: h.end, hasAudio: true, volume: clip.volume ?? 1, speed: 1,
      fadeIn: 0, fadeOut: 0, denoise: false, filter: clip.filter || 'natural', videoFadeIn: 0, videoFadeOut: 0,
    }],
    options: {
      width: a.width, height: a.height, fit: 'cover', fps: 30, crf: q.crf, preset: q.preset, encoder: 'libx264', output,
    },
  };
}

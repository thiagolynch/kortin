export const ASPECTS = {
  '9:16': { width: 1080, height: 1920, label: '9:16', hint: 'Reels · TikTok · Shorts' },
  '16:9': { width: 1920, height: 1080, label: '16:9', hint: 'YouTube' },
  '1:1': { width: 1080, height: 1080, label: '1:1', hint: 'Feed quadrado' },
  '4:5': { width: 1080, height: 1350, label: '4:5', hint: 'Feed Instagram' },
};

export const FITS = {
  blur: 'Fundo desfocado',
  cover: 'Preencher (corta)',
  contain: 'Ajustar (barras)',
};

export const QUALITIES = {
  alta: { label: 'Alta', crf: 18, preset: 'medium', hint: 'Arquivo maior' },
  padrao: { label: 'Padrão', crf: 21, preset: 'veryfast', hint: 'Equilíbrio' },
  leve: { label: 'Leve', crf: 26, preset: 'veryfast', hint: 'Envio rápido' },
};

export const MIN_CLIP = 0.1;

export const uid = () => Math.random().toString(36).slice(2, 10);

export const mediaUrl = (p) => `media://file/${encodeURIComponent(p)}`;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function buildSegments(clips) {
  let t = 0;
  return clips.map((clip) => {
    const len = clip.outPoint - clip.inPoint;
    const seg = { clip, start: t, len };
    t += len;
    return seg;
  });
}

export function totalOf(segments) {
  if (!segments.length) return 0;
  const last = segments[segments.length - 1];
  return last.start + last.len;
}

export function locate(segments, t) {
  if (!segments.length) return null;
  let index = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    if (t < segments[i].start + segments[i].len) {
      index = i;
      break;
    }
  }
  const seg = segments[index];
  const local = clamp(seg.clip.inPoint + (t - seg.start), seg.clip.inPoint, seg.clip.outPoint - 0.001);
  return { index, seg, local };
}

export function formatTime(s, withFraction = true) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s * 100) % 100);
  const base = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return withFraction ? `${base}.${String(cs).padStart(2, '0')}` : base;
}

/** Divide o clipe que está no tempo t. Retorna { clips, newId } ou null. */
export function splitAt(clips, t) {
  const segments = buildSegments(clips);
  const loc = locate(segments, t);
  if (!loc) return null;
  const { seg, index } = loc;
  const cut = seg.clip.inPoint + (t - seg.start);
  if (cut - seg.clip.inPoint < MIN_CLIP || seg.clip.outPoint - cut < MIN_CLIP) return null;
  const left = { ...seg.clip, outPoint: cut };
  const right = { ...seg.clip, id: uid(), inPoint: cut };
  const next = [...clips];
  next.splice(index, 1, left, right);
  return { clips: next, newId: right.id };
}

export function mediaToClip(m) {
  return {
    id: uid(),
    path: m.path,
    name: m.name,
    duration: m.duration,
    inPoint: 0,
    outPoint: m.duration,
    width: m.width,
    height: m.height,
    hasAudio: m.hasAudio,
    thumb: m.thumb,
  };
}

export function cleanError(err) {
  const msg = String(err?.message || err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

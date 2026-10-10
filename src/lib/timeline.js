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

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
export const MAX_VOLUME = 2; // 200%
export const MAX_FADE = 3; // segundos
export const SNAP_PX = 10; // distância em pixels para o ímã puxar

/** Duração do clipe na linha do tempo, já com a velocidade aplicada */
export const clipLength = (c) => (c.outPoint - c.inPoint) / (c.speed || 1);

export const uid = () => Math.random().toString(36).slice(2, 10);

export const mediaUrl = (p) => `media://file/${encodeURIComponent(p)}`;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function buildSegments(clips) {
  let t = 0;
  return clips.map((clip) => {
    const len = clipLength(clip);
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
  const local = clamp(sourceTime(seg, t), seg.clip.inPoint, seg.clip.outPoint - 0.001);
  return { index, seg, local };
}

/** Tempo no arquivo original que corresponde ao tempo t da linha do tempo */
export function sourceTime(seg, t) {
  return seg.clip.inPoint + (t - seg.start) * (seg.clip.speed || 1);
}

/** Pontos onde o ímã puxa: início, fim e as emendas entre clipes */
export function snapPoints(segments) {
  const pts = [0];
  for (const s of segments) pts.push(s.start + s.len);
  return pts;
}

/** Aproxima t do ponto mais perto, se estiver a menos de SNAP_PX pixels */
export function snapTime(t, points, zoom) {
  let best = t;
  let bestDist = SNAP_PX / zoom;
  for (const p of points) {
    const d = Math.abs(p - t);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

/** Fator de volume do fade (0 a 1) no instante `tl` dentro do clipe */
export function fadeFactor(clip, tl) {
  const len = clipLength(clip);
  const fi = Math.min(clip.fadeIn || 0, len / 2);
  const fo = Math.min(clip.fadeOut || 0, len / 2);
  let f = 1;
  if (fi > 0) f = Math.min(f, tl / fi);
  if (fo > 0) f = Math.min(f, (len - tl) / fo);
  return clamp(f, 0, 1);
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
  const cut = sourceTime(seg, t);
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
    volume: 1,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    denoise: false,
  };
}

export const PROJECT_VERSION = 3;

/** Converte o estado do editor no conteúdo do arquivo .kortin */
export function serializeProject({ clips, aspect, fit, captions, transcripts }) {
  const used = new Set(clips.map((c) => c.path));
  return {
    app: 'kortin',
    version: PROJECT_VERSION,
    aspect,
    fit,
    clips: clips.map(({ id, path, name, inPoint, outPoint, volume, speed, fadeIn, fadeOut, denoise }) => ({
      id, path, name, inPoint, outPoint,
      volume: volume ?? 1, speed: speed ?? 1, fadeIn: fadeIn ?? 0, fadeOut: fadeOut ?? 0, denoise: !!denoise,
    })),
    ...(captions ? { captions } : {}),
    // só as transcrições dos vídeos que estão no projeto
    ...(transcripts
      ? { transcripts: Object.fromEntries(Object.entries(transcripts).filter(([p]) => used.has(p))) }
      : {}),
  };
}

/** Reconstrói os clipes a partir do arquivo, usando as informações lidas de cada vídeo */
export function restoreClips(saved, infoByPath) {
  return saved
    .filter((c) => infoByPath[c.path])
    .map((c) => {
      const info = infoByPath[c.path];
      const outPoint = clamp(c.outPoint, MIN_CLIP, info.duration);
      const inPoint = clamp(c.inPoint, 0, outPoint - MIN_CLIP);
      return {
        ...mediaToClip(info),
        id: c.id || uid(),
        inPoint,
        outPoint,
        volume: clamp(c.volume ?? 1, 0, MAX_VOLUME),
        speed: SPEEDS.includes(c.speed) ? c.speed : 1,
        fadeIn: clamp(c.fadeIn ?? 0, 0, MAX_FADE),
        fadeOut: clamp(c.fadeOut ?? 0, 0, MAX_FADE),
        denoise: !!c.denoise,
      };
    });
}

export function baseName(p) {
  return String(p || '').split(/[\\/]/).pop().replace(/\.kortin$/i, '');
}

export function formatSpeed(sp) {
  return `${String(sp).replace('.', ',')}x`;
}

export function cleanError(err) {
  const msg = String(err?.message || err);
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

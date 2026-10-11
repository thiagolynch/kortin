import C from '../../shared/constants.json';

// Medidas vêm de shared/constants.json (as mesmas que o processo principal valida)
const ASPECT_LABELS = {
  '9:16': 'Reels · TikTok · Shorts',
  '16:9': 'YouTube',
  '1:1': 'Feed quadrado',
  '4:5': 'Feed Instagram',
};
export const ASPECTS = Object.fromEntries(
  Object.entries(C.ASPECTS).map(([k, a]) => [k, { ...a, label: k, hint: ASPECT_LABELS[k] }])
);

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

export const { MIN_CLIP, SPEEDS, MAX_VOLUME, MAX_FADE, PROJECT_VERSION } = C;
export const SNAP_PX = 10; // distância em pixels para o ímã puxar

/** Duração do clipe na linha do tempo, já com a velocidade aplicada */
export const clipLength = (c) => (c.outPoint - c.inPoint) / (c.speed || 1);

export const uid = () =>
  (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).slice(0, 13);

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
  // busca binária: primeiro segmento cujo fim passa de t (O(log n) — chamada a cada quadro)
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t < segments.at(mid).start + segments.at(mid).len) hi = mid;
    else lo = mid + 1;
  }
  const index = lo;
  const seg = segments[index];
  const { inPoint, outPoint } = seg.clip;
  const local = clamp(sourceTime(seg, t), inPoint, Math.max(inPoint, outPoint - 0.001));
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


/** Converte o estado do editor no conteúdo do arquivo .kortin */
export const MUSIC_DEFAULTS = { volume: C.MUSIC.defaultVolume, duck: true, fadeIn: 1, fadeOut: 2 };

/** Só os campos da música que vão para o projeto e para a exportação */
export const musicFields = (m) => (m ? {
  path: m.path, name: m.name, duration: m.duration,
  volume: m.volume ?? MUSIC_DEFAULTS.volume, duck: m.duck ?? true, fadeIn: m.fadeIn ?? 0, fadeOut: m.fadeOut ?? 0,
} : null);

export function serializeProject({ clips, aspect, fit, captions, transcripts, music }) {
  const used = new Set(clips.map((c) => c.path));
  return {
    app: 'kortin',
    version: PROJECT_VERSION,
    aspect,
    fit,
    // duration: para conferir, ao reabrir em outro lugar, se o vídeo achado é o mesmo
    clips: clips.map(({ id, path, name, duration, inPoint, outPoint, volume, speed, fadeIn, fadeOut, denoise }) => ({
      id, path, name, duration, inPoint, outPoint,
      volume: volume ?? 1, speed: speed ?? 1, fadeIn: fadeIn ?? 0, fadeOut: fadeOut ?? 0, denoise: !!denoise,
    })),
    ...(captions ? { captions } : {}),
    ...(music ? { music: musicFields(music) } : {}),
    // só as transcrições dos vídeos que estão no projeto
    ...(transcripts
      ? { transcripts: Object.fromEntries(Object.entries(transcripts).filter(([p]) => used.has(p))) }
      : {}),
  };
}

/** Troca caminhos de vídeo (clipes e transcrições) depois que o usuário relocalizou arquivos. */
export function remapProjectPaths(data, map) {
  const has = (p) => Object.prototype.hasOwnProperty.call(map, p);
  const musicMoved = data.music && has(data.music.path);
  if (!data.clips.some((c) => has(c.path)) && !musicMoved) return data;
  return {
    ...data,
    ...(musicMoved ? { music: { ...data.music, path: map[data.music.path] } } : {}),
    clips: data.clips.map((c) => (has(c.path) ? { ...c, path: map[c.path] } : c)),
    transcripts: data.transcripts
      ? Object.fromEntries(Object.entries(data.transcripts).map(([p, t]) => [has(p) ? map[p] : p, t]))
      : data.transcripts,
  };
}

/** Vídeos achados cuja duração não bate com a salva no projeto (provavelmente outro arquivo com o mesmo nome) */
export function durationMismatches(savedClips, infoByPath, tolerance = 0.5) {
  const out = new Set();
  for (const c of savedClips) {
    const info = infoByPath[c.path];
    if (info && c.duration && Math.abs(info.duration - c.duration) > tolerance) out.add(c.path);
  }
  return [...out];
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

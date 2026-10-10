import { useCallback, useEffect, useMemo, useRef } from 'react';
import { clamp, fadeFactor, locate, mediaUrl, totalOf } from './timeline';
import { createPlayheadStore } from '../state/playhead';

/**
 * Toca a linha do tempo inteira num único <video>, trocando de clipe quando o atual chega
 * ao ponto de saída. A posição fica num store externo (ver state/playhead.js).
 * Volume acima de 100% e fades passam por um GainNode; se o Web Audio falhar, usa o volume
 * do próprio vídeo (até 100%).
 */
export function usePlayer(segments) {
  const videoRef = useRef(null);
  const store = useMemo(() => createPlayheadStore(), []);
  const segRef = useRef(segments);
  segRef.current = segments;
  const st = useRef({ index: -1, pending: null, raf: 0 });
  const audio = useRef(null); // { ctx, gain } | false (indisponível) | null (ainda não criado)

  const ensureAudio = useCallback(() => {
    const v = videoRef.current;
    if (audio.current !== null || !v) return audio.current;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(v);
      const gain = ctx.createGain();
      src.connect(gain).connect(ctx.destination);
      audio.current = { ctx, gain };
    } catch {
      audio.current = false;
    }
    return audio.current;
  }, []);

  const applyGain = useCallback((seg, t) => {
    const v = videoRef.current;
    if (!v || !seg) return;
    const g = (seg.clip.hasAudio ? seg.clip.volume ?? 1 : 0) * fadeFactor(seg.clip, t - seg.start);
    const a = audio.current;
    if (a) {
      v.volume = 1;
      a.gain.gain.value = g;
    } else {
      v.volume = clamp(g, 0, 1);
    }
    v.muted = g === 0;
  }, []);

  const load = useCallback((t, andPlay) => {
    const v = videoRef.current;
    const segs = segRef.current;
    if (!v) return;
    if (!segs.length) {
      st.current.index = -1;
      if (v.getAttribute('src')) {
        v.removeAttribute('src');
        v.load();
      }
      return;
    }
    const loc = locate(segs, t);
    st.current.index = loc.index;
    const rate = loc.seg.clip.speed || 1;
    applyGain(loc.seg, t);
    const src = mediaUrl(loc.seg.clip.path);
    if (v.getAttribute('src') !== src) {
      st.current.pending = { local: loc.local, play: andPlay, rate };
      v.src = src;
    } else {
      st.current.pending = null;
      v.playbackRate = rate;
      v.currentTime = loc.local;
      if (andPlay) v.play().catch(() => {});
    }
  }, [applyGain]);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    const p = st.current.pending;
    if (!v || !p) return;
    v.currentTime = p.local;
    v.playbackRate = p.rate;
    st.current.pending = null;
    if (p.play && store.get().playing) v.play().catch(() => {});
  }, [store]);

  const pause = useCallback(() => {
    cancelAnimationFrame(st.current.raf);
    store.set({ playing: false });
    videoRef.current?.pause();
  }, [store]);

  const tick = useCallback(() => {
    const s = st.current;
    if (!store.get().playing) return;
    const v = videoRef.current;
    const segs = segRef.current;
    const seg = segs[s.index];
    if (v && seg && !s.pending) {
      const ct = v.currentTime;
      if (ct >= seg.clip.outPoint - 0.02 || v.ended) {
        if (s.index + 1 < segs.length) {
          const next = segs[s.index + 1];
          store.set({ time: next.start });
          load(next.start, true);
        } else {
          store.set({ time: seg.start + seg.len });
          pause();
          return;
        }
      } else {
        const t = seg.start + Math.max(0, ct - seg.clip.inPoint) / (seg.clip.speed || 1);
        store.set({ time: t });
        applyGain(seg, t);
      }
    }
    s.raf = requestAnimationFrame(tick);
  }, [applyGain, load, pause, store]);

  const play = useCallback(() => {
    const total = totalOf(segRef.current);
    if (!total) return;
    const a = ensureAudio();
    if (a && a.ctx.state === 'suspended') a.ctx.resume().catch(() => {});
    let t = store.get().time;
    if (t >= total - 0.05) t = 0;
    store.set({ time: t, playing: true });
    load(t, true);
    cancelAnimationFrame(st.current.raf);
    st.current.raf = requestAnimationFrame(tick);
  }, [ensureAudio, load, store, tick]);

  const toggle = useCallback(() => (store.get().playing ? pause() : play()), [pause, play, store]);

  const seek = useCallback((t) => {
    const nt = clamp(t, 0, totalOf(segRef.current));
    store.set({ time: nt });
    load(nt, store.get().playing);
  }, [load, store]);

  // Linha do tempo mudou (corte, divisão, velocidade): reposiciona o preview
  useEffect(() => {
    const t = clamp(store.get().time, 0, totalOf(segments));
    if (t !== store.get().time) store.set({ time: t });
    if (!store.get().playing) load(t, false);
    else if (!segments.length) pause();
    else {
      const seg = segments[st.current.index];
      if (seg && videoRef.current) {
        videoRef.current.playbackRate = seg.clip.speed || 1;
        applyGain(seg, t);
      }
    }
  }, [segments, load, pause, applyGain, store]);

  useEffect(() => () => {
    cancelAnimationFrame(st.current.raf);
    if (audio.current) audio.current.ctx.close().catch(() => {});
  }, []);

  return useMemo(
    () => ({ videoRef, store, play, pause, toggle, seek, onLoadedMetadata, getTime: () => store.get().time }),
    [store, play, pause, toggle, seek, onLoadedMetadata]
  );
}

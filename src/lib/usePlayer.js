import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, fadeFactor, locate, mediaUrl, sourceTime, totalOf } from './timeline';

/**
 * Toca a linha do tempo inteira num único <video>, trocando de clipe quando
 * o atual chega ao ponto de saída. Volume acima de 100% e fades passam por um
 * GainNode (Web Audio); se o navegador recusar, cai para o volume normal (até 100%).
 */
export function usePlayer(segments) {
  const videoRef = useRef(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const segRef = useRef(segments);
  segRef.current = segments;
  const timeRef = useRef(0);
  timeRef.current = time;
  const st = useRef({ index: -1, playing: false, pending: null, raf: 0 });
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

  // Aplica volume + fade do clipe no instante t da linha do tempo
  const applyGain = useCallback((seg, t) => {
    const v = videoRef.current;
    if (!v || !seg) return;
    const g = (seg.clip.hasAudio ? seg.clip.volume ?? 1 : 0) * fadeFactor(seg.clip, t - seg.start);
    const a = audio.current;
    if (a) {
      v.volume = 1;
      v.muted = g === 0;
      a.gain.gain.value = g;
    } else {
      v.volume = clamp(g, 0, 1);
      v.muted = g === 0;
    }
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
    if (p.play && st.current.playing) v.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    st.current.playing = false;
    cancelAnimationFrame(st.current.raf);
    setPlaying(false);
    videoRef.current?.pause();
  }, []);

  const tick = useCallback(() => {
    const s = st.current;
    if (!s.playing) return;
    const v = videoRef.current;
    const segs = segRef.current;
    const seg = segs[s.index];
    if (v && seg && !s.pending) {
      const ct = v.currentTime;
      if (ct >= seg.clip.outPoint - 0.02 || v.ended) {
        if (s.index + 1 < segs.length) {
          const next = segs[s.index + 1];
          setTime(next.start);
          load(next.start, true);
        } else {
          setTime(seg.start + seg.len);
          pause();
          return;
        }
      } else {
        const t = seg.start + Math.max(0, ct - seg.clip.inPoint) / (seg.clip.speed || 1);
        setTime(t);
        applyGain(seg, t);
      }
    }
    s.raf = requestAnimationFrame(tick);
  }, [applyGain, load, pause]);

  const play = useCallback(() => {
    const segs = segRef.current;
    const total = totalOf(segs);
    if (!total) return;
    const a = ensureAudio();
    if (a && a.ctx.state === 'suspended') a.ctx.resume().catch(() => {});
    let t = timeRef.current;
    if (t >= total - 0.05) t = 0;
    setTime(t);
    st.current.playing = true;
    setPlaying(true);
    load(t, true);
    cancelAnimationFrame(st.current.raf);
    st.current.raf = requestAnimationFrame(tick);
  }, [ensureAudio, load, tick]);

  const toggle = useCallback(() => (st.current.playing ? pause() : play()), [pause, play]);

  const seek = useCallback(
    (t) => {
      const total = totalOf(segRef.current);
      const nt = clamp(t, 0, total);
      setTime(nt);
      timeRef.current = nt;
      load(nt, st.current.playing);
    },
    [load]
  );

  // Quando a linha do tempo muda (corte, divisão, velocidade), reposiciona o preview
  useEffect(() => {
    const total = totalOf(segments);
    const t = clamp(timeRef.current, 0, total);
    if (t !== timeRef.current) setTime(t);
    if (!st.current.playing) load(t, false);
    else if (!segments.length) pause();
    else {
      const seg = segments[st.current.index];
      if (seg && videoRef.current) {
        videoRef.current.playbackRate = seg.clip.speed || 1;
        applyGain(seg, t);
      }
    }
  }, [segments, load, pause, applyGain]);

  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  return { videoRef, time, playing, play, pause, toggle, seek, onLoadedMetadata, sourceTime, audioRef: audio };
}

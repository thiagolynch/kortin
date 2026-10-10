import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp, locate, mediaUrl, totalOf } from './timeline';

function applyVolume(v, clip) {
  if (!v) return;
  const vol = clamp(clip.volume ?? 1, 0, 1);
  v.volume = vol;
  v.muted = vol === 0;
}

/**
 * Toca a linha do tempo inteira num único <video>, trocando de clipe quando
 * o atual chega ao ponto de saída.
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
    applyVolume(v, loc.seg.clip);
    const src = mediaUrl(loc.seg.clip.path);
    if (v.getAttribute('src') !== src) {
      st.current.pending = { local: loc.local, play: andPlay };
      v.src = src;
    } else {
      st.current.pending = null;
      v.currentTime = loc.local;
      if (andPlay) v.play().catch(() => {});
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    const p = st.current.pending;
    if (!v || !p) return;
    v.currentTime = p.local;
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
        setTime(seg.start + Math.max(0, ct - seg.clip.inPoint));
      }
    }
    s.raf = requestAnimationFrame(tick);
  }, [load, pause]);

  const play = useCallback(() => {
    const segs = segRef.current;
    const total = totalOf(segs);
    if (!total) return;
    let t = timeRef.current;
    if (t >= total - 0.05) t = 0;
    setTime(t);
    st.current.playing = true;
    setPlaying(true);
    load(t, true);
    cancelAnimationFrame(st.current.raf);
    st.current.raf = requestAnimationFrame(tick);
  }, [load, tick]);

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

  // Quando a linha do tempo muda (corte, divisão, exclusão), reposiciona o preview
  useEffect(() => {
    const total = totalOf(segments);
    const t = clamp(timeRef.current, 0, total);
    if (t !== timeRef.current) setTime(t);
    if (!st.current.playing) load(t, false);
    else if (!segments.length) pause();
    else if (segments[st.current.index]) applyVolume(videoRef.current, segments[st.current.index].clip);
  }, [segments, load, pause]);

  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);

  return { videoRef, time, playing, play, pause, toggle, seek, onLoadedMetadata };
}

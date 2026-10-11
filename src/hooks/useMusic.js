// Prévia da música de fundo: um <audio> separado, sincronizado com o cursor da timeline.
// O abaixamento da prévia é uma aproximação (abaixa nos clipes com som); na exportação quem
// controla é a própria voz, por um compressor (ver filtergraph.musicMix).
import { useEffect, useRef } from 'react';
import { clamp, locate, mediaUrl } from '../lib/timeline';

const DUCK_GAIN = 0.25; // ≈ −12 dB, o mesmo alvo da exportação

/** Volume da música no instante t (fades nas pontas + abaixamento). Função pura (testada). */
export function musicGainAt(music, t, total, speaking) {
  if (!music) return 0;
  let g = music.volume ?? 0.25;
  const fi = Math.min(music.fadeIn || 0, total / 2);
  const fo = Math.min(music.fadeOut || 0, total / 2);
  if (fi > 0) g *= clamp(t / fi, 0, 1);
  if (fo > 0) g *= clamp((total - t) / fo, 0, 1);
  if (music.duck && speaking) g *= DUCK_GAIN;
  return clamp(g, 0, 1);
}

export function useMusic(music, store, segments, total) {
  const audioRef = useRef(null);
  const live = useRef({ music, segments, total });
  live.current = { music, segments, total };

  // um elemento por arquivo de música
  useEffect(() => {
    if (!music?.path) return undefined;
    const a = new Audio(mediaUrl(music.path));
    a.loop = true; // como na exportação: repete até o fim do vídeo
    a.preload = 'auto';
    audioRef.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      a.load();
      audioRef.current = null;
    };
  }, [music?.path]);

  useEffect(() => {
    const sync = () => {
      const a = audioRef.current;
      const { music: m, segments: segs, total: tot } = live.current;
      if (!a || !m) return;
      const { time, playing } = store.get();
      const inside = time < tot;
      const dur = m.duration || a.duration || 1;
      const target = time % dur;
      const loc = locate(segs, time);
      const clip = loc?.seg.clip;
      const speaking = !!clip && clip.hasAudio && (clip.volume ?? 1) > 0;
      a.volume = musicGainAt(m, time, tot, speaking);
      if (playing && inside) {
        if (a.paused) {
          a.currentTime = target;
          a.play().catch(() => {});
        } else if (Math.abs(a.currentTime - target) > 0.3) {
          a.currentTime = target; // corrige deriva entre o vídeo e a música
        }
      } else {
        if (!a.paused) a.pause();
        if (Math.abs(a.currentTime - target) > 0.05) a.currentTime = target;
      }
    };
    sync();
    return store.subscribe(sync);
  }, [store, music]);
}

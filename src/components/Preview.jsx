import { memo, useEffect, useRef, useState } from 'react';
import { ASPECTS, locate, mediaUrl, videoFadeBlack, zoomScale } from '../lib/timeline';
import { filterCss } from './ColorFilters';
import { useDerivedPlayhead } from '../state/playhead';
import CaptionOverlay from './CaptionOverlay';

/** Fundo desfocado do clipe atual: só troca quando o clipe muda */
function BlurBackdrop({ clip }) {
  const thumb = clip?.thumb;
  return thumb ? <img className="frame-blur" src={thumb} alt="" draggable={false} style={{ filter: filterCss(clip.filter) }} /> : null;
}

/**
 * Camada preta das transições. Muda a cada quadro, então escreve direto no estilo do elemento
 * (sem re-renderizar o React).
 */
function FadeLayer({ store, segments }) {
  const ref = useRef(null);
  useEffect(() => {
    const update = () => {
      const loc = locate(segments, store.get().time);
      const o = loc ? videoFadeBlack(loc.seg.clip, store.get().time - loc.seg.start) : 0;
      if (ref.current) ref.current.style.opacity = String(o);
    };
    update();
    return store.subscribe(update);
  }, [store, segments]);
  return <div ref={ref} className="frame-fade" aria-hidden="true" />;
}

/**
 * Zoom lento (Ken Burns): escreve direto no estilo do wrapper do vídeo a cada quadro (sem
 * re-renderizar o React), espelhando o mesmo progresso 0→1 que o zoompan da exportação usa.
 */
function ZoomLayer({ store, segments, targetRef }) {
  useEffect(() => {
    const update = () => {
      if (!targetRef.current) return;
      const loc = locate(segments, store.get().time);
      if (!loc) { targetRef.current.style.transform = ''; return; }
      const tl = store.get().time - loc.seg.start;
      const z = zoomScale(loc.seg.clip, tl, loc.seg.len);
      targetRef.current.style.transform = z !== 1 ? `scale(${z.toFixed(4)})` : '';
    };
    update();
    return store.subscribe(update);
  }, [store, segments, targetRef]);
  return null;
}

/** Vinheta cinematográfica (cantos escurecidos + grão) na prévia: aproximação do vignette+noise da exportação. */
function VignetteOverlay({ clip }) {
  return clip?.vignette ? <div className="frame-vignette" aria-hidden="true" /> : null;
}

/**
 * Camada de sobreposição na prévia: um <video> próprio, posicionado e dimensionado pelos campos
 * x/y/scale/opacity, sincronizado com o cursor da timeline (mesmo padrão da música de fundo).
 * Limitação honesta: a remoção de fundo verde (chroma key) é só na exportação — aqui o vídeo
 * aparece inteiro, só posicionado e redimensionado, para dar uma ideia de onde ele vai ficar.
 */
function OverlayLayer({ overlay, store, width, height }) {
  const videoElRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!overlay?.path) return undefined;
    const v = document.createElement('video');
    v.src = mediaUrl(overlay.path);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.style.width = '100%';
    v.style.height = '100%';
    v.style.objectFit = 'cover';
    videoElRef.current = v;
    if (boxRef.current) boxRef.current.appendChild(v);
    return () => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      if (v.parentNode) v.parentNode.removeChild(v);
      videoElRef.current = null;
    };
  }, [overlay?.path]);

  useEffect(() => {
    const sync = () => {
      const v = videoElRef.current;
      if (!v || !overlay) return;
      const { time, playing } = store.get();
      const inside = time >= overlay.start && time < overlay.end;
      v.style.visibility = inside ? 'visible' : 'hidden';
      if (!inside) { if (!v.paused) v.pause(); return; }
      const target = overlay.inPoint + (time - overlay.start);
      if (playing) {
        if (v.paused) { v.currentTime = target; v.play().catch(() => {}); }
        else if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
      }
    };
    sync();
    return store.subscribe(sync);
  }, [store, overlay]);

  if (!overlay?.path || !width || !height) return null;
  const ow = Math.round(width * overlay.scale);
  const oh = Math.round(ow * ((overlay.height || 1) / (overlay.width || 1)));
  const ox = Math.round(overlay.x * width - ow / 2);
  const oy = Math.round(overlay.y * height - oh / 2);
  return (
    <div
      ref={boxRef}
      className="frame-overlay-layer"
      style={{ position: 'absolute', left: ox, top: oy, width: ow, height: oh, opacity: overlay.opacity, overflow: 'hidden' }}
      aria-hidden="true"
    />
  );
}

function Preview({ player, segments, aspect, fit, empty, onImport, onOpenProject, cues, captionSettings, overlay, children }) {
  // clipe atual: só muda quando o cursor passa de um clipe para outro
  const index = useDerivedPlayhead(player.store, (t) => locate(segments, t)?.index ?? -1, [segments]);
  const current = segments[index]?.clip;
  const wrapRef = useRef(null);
  const zoomRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const a = ASPECTS[aspect];

  // Calcula o maior quadro possível no formato escolhido
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const ratio = a.width / a.height;
      let w = width;
      let h = w / ratio;
      if (h > height) {
        h = height;
        w = h * ratio;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [a]);

  return (
    <div className="preview" ref={wrapRef}>
      <div className="frame" style={{ width: box.w, height: box.h }}>
        {fit === 'blur' && <BlurBackdrop clip={current} />}
        <div ref={zoomRef} className="frame-zoom-wrap">
          <video
            ref={player.videoRef}
            onLoadedMetadata={player.onLoadedMetadata}
            className={`frame-video fit-${fit}`}
            style={{ filter: filterCss(current?.filter) }}
            playsInline
            preload="auto"
            crossOrigin="anonymous"
          />
        </div>
        <ZoomLayer store={player.store} segments={segments} targetRef={zoomRef} />
        <VignetteOverlay clip={current} />
        <FadeLayer store={player.store} segments={segments} />
        <CaptionOverlay cues={cues} store={player.store} settings={captionSettings} width={box.w} height={box.h} />
        <OverlayLayer overlay={overlay} store={player.store} width={box.w} height={box.h} />
        {children?.(box)}
        {empty && (
          <div className="frame-empty">
            <button className="frame-empty-main" onClick={onImport}>
              <span className="frame-empty-icon">＋</span>
              <strong>Importe um vídeo para começar</strong>
              <small>ou arraste os arquivos para qualquer lugar da janela</small>
            </button>
            <button className="link-btn" onClick={onOpenProject}>Abrir um projeto salvo</button>
            <ul className="promise">
              <li>Sem anúncios</li>
              <li>Sem marca d'água</li>
              <li>Exportação grátis</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(Preview);

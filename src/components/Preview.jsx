import { memo, useEffect, useRef, useState } from 'react';
import { ASPECTS, locate, videoFadeBlack, zoomScale } from '../lib/timeline';
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

function Preview({ player, segments, aspect, fit, empty, onImport, onOpenProject, cues, captionSettings, children }) {
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

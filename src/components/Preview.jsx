import { memo, useEffect, useRef, useState } from 'react';
import { ASPECTS, locate } from '../lib/timeline';
import { useDerivedPlayhead } from '../state/playhead';
import CaptionOverlay from './CaptionOverlay';

/** Fundo desfocado do clipe atual: só troca quando o clipe muda */
function BlurBackdrop({ store, segments }) {
  const index = useDerivedPlayhead(store, (t) => locate(segments, t)?.index ?? -1, [segments]);
  const thumb = segments[index]?.clip.thumb;
  return thumb ? <img className="frame-blur" src={thumb} alt="" draggable={false} /> : null;
}

function Preview({ player, segments, aspect, fit, empty, onImport, onOpenProject, cues, captionSettings }) {
  const wrapRef = useRef(null);
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
        {fit === 'blur' && <BlurBackdrop store={player.store} segments={segments} />}
        <video
          ref={player.videoRef}
          onLoadedMetadata={player.onLoadedMetadata}
          className={`frame-video fit-${fit}`}
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />
        <CaptionOverlay cues={cues} store={player.store} settings={captionSettings} width={box.w} height={box.h} />
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

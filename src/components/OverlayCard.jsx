import { Icon } from './Icons';

const pct = (v) => `${Math.round(v * 100)}%`;

/**
 * Camada de sobreposição: um vídeo extra (câmera de reação, logo, fundo verde) por cima da
 * timeline principal. Posição, tamanho e opacidade; o fundo verde é removido só na exportação
 * (a prévia mostra o vídeo inteiro, só posicionado — ver Preview.jsx).
 */
export default function OverlayCard({ overlay, busy, onPick, onRemove, onChange, onPreview, onEnd }) {
  if (!overlay) {
    return (
      <section className="music-card empty">
        <div>
          <strong><Icon.Film width={14} height={14} /> Sobreposição</strong>
          <p className="muted small">Um vídeo por cima da timeline: câmera de reação, logo ou fundo verde.</p>
        </div>
        <button className="btn sm" onClick={onPick} disabled={busy}>Escolher vídeo</button>
      </section>
    );
  }
  const slider = (label, key, display, props, extra) => (
    <div className="music-control">
      <div className="insp-control-head"><label>{label}</label><span>{display}</span></div>
      <input
        type="range" {...props} value={extra ? extra(overlay) : overlay[key]}
        onChange={(e) => onPreview({ [key]: Number(e.target.value) })}
        onPointerUp={onEnd} onKeyUp={onEnd} onBlur={onEnd}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
  const chroma = overlay.chroma || { enabled: false, color: '#00ff00', similarity: 0.2, blend: 0.1 };
  const patchChroma = (patch) => onChange({ chroma: { ...chroma, ...patch } });
  const previewChroma = (patch) => onPreview({ chroma: { ...chroma, ...patch } });
  return (
    <section className="music-card">
      <div className="music-head">
        <Icon.Film width={16} height={16} />
        <div className="music-name">
          <strong title={overlay.path}>{overlay.name}</strong>
          <small className="muted">sobreposição</small>
        </div>
        <button className="icon-btn" title="Trocar vídeo" onClick={onPick} disabled={busy}><Icon.Open width={15} height={15} /></button>
        <button className="icon-btn" title="Remover sobreposição" onClick={onRemove}><Icon.Trash width={15} height={15} /></button>
      </div>
      {slider('Posição horizontal', 'x', pct(overlay.x), { min: 0, max: 1, step: 0.01 })}
      {slider('Posição vertical', 'y', pct(overlay.y), { min: 0, max: 1, step: 0.01 })}
      {slider('Tamanho', 'scale', pct(overlay.scale), { min: 0.05, max: 1, step: 0.01 })}
      {slider('Opacidade', 'opacity', pct(overlay.opacity), { min: 0, max: 1, step: 0.01 })}
      <label className="switch" title="Remove o fundo verde do vídeo de sobreposição. Só aparece assim na exportação final.">
        <input type="checkbox" checked={!!chroma.enabled} onChange={(e) => patchChroma({ enabled: e.target.checked })} />
        <span>Remover fundo verde (chroma key)</span>
      </label>
      {chroma.enabled && (
        <>
          <div className="music-control">
            <div className="insp-control-head"><label>Cor do fundo</label></div>
            <input
              type="color" value={chroma.color}
              onChange={(e) => onChange({ chroma: { ...chroma, color: e.target.value } })}
            />
          </div>
          <div className="music-control">
            <div className="insp-control-head"><label>Sensibilidade</label><span>{pct(chroma.similarity)}</span></div>
            <input
              type="range" min={0.01} max={1} step={0.01} value={chroma.similarity}
              onChange={(e) => previewChroma({ similarity: Number(e.target.value) })}
              onPointerUp={onEnd} onKeyUp={onEnd} onBlur={onEnd}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="music-control">
            <div className="insp-control-head"><label>Suavização das bordas</label><span>{pct(chroma.blend)}</span></div>
            <input
              type="range" min={0} max={1} step={0.01} value={chroma.blend}
              onChange={(e) => previewChroma({ blend: Number(e.target.value) })}
              onPointerUp={onEnd} onKeyUp={onEnd} onBlur={onEnd}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <p className="muted small">A remoção do fundo verde só aparece no vídeo exportado — aqui na prévia o vídeo mostra o fundo inteiro, só posicionado.</p>
        </>
      )}
    </section>
  );
}

import { TITLE_LIMITS, TITLE_STYLES } from '../lib/titles';
import { formatTime } from '../lib/timeline';
import { Icon } from './Icons';

const secs = (v) => `${v.toFixed(1).replace('.', ',')} s`;

/** Aba "Textos": títulos livres sobre o vídeo. Edições de texto e sliders viram 1 passo de desfazer. */
export default function TitlesPanel({ titles, selectedId, onSelect, onAdd, api, getTime }) {
  const sorted = [...titles].sort((a, b) => a.start - b.start);
  const sel = titles.find((t) => t.id === selectedId);
  const stop = (e) => e.stopPropagation(); // digitar não dispara atalhos do editor

  return (
    <div className="cap-body">
      <section className="cap-card">
        <div className="cap-row">
          <strong>Títulos e textos</strong>
          <button className="btn primary sm" onClick={onAdd} title="Adiciona um título onde está o cursor"><Icon.Plus width={14} height={14} /> Adicionar</button>
        </div>
        <p className="muted small">O texto fica por cima do vídeo e da legenda, no tempo da linha do tempo. Arraste o bloco na faixa “T” para mudar o momento.</p>
      </section>

      {sel && (
        <section className="cap-card title-editor">
          <textarea
            className="title-text"
            value={sel.text}
            rows={3}
            maxLength={400}
            onChange={(e) => api.preview(sel.id, { text: e.target.value })}
            onBlur={api.end}
            onKeyDown={stop}
            aria-label="Texto do título"
          />
          <div className="segmented compact">
            {Object.entries(TITLE_STYLES).map(([k, s]) => (
              <button key={k} className={sel.style === k ? 'active' : ''} onClick={() => api.commit(sel.id, { style: k, position: s.position })}>{s.label}</button>
            ))}
          </div>
          <div className="title-times">
            <span className="small muted">Começa em <b>{formatTime(sel.start)}</b></span>
            <button className="link-btn small" onClick={() => api.commit(sel.id, { start: getTime() })}>mover para o cursor</button>
          </div>
          <div className="music-control">
            <div className="insp-control-head"><label>Duração</label><span>{secs(sel.duration)}</span></div>
            <input
              type="range" min={TITLE_LIMITS.minDuration} max={TITLE_LIMITS.maxDuration} step={0.1} value={sel.duration}
              onChange={(e) => api.preview(sel.id, { duration: Number(e.target.value) })}
              onPointerUp={api.end} onKeyUp={api.end} onBlur={api.end} onKeyDown={stop}
            />
          </div>
          <div className="music-control">
            <div className="insp-control-head"><label>Altura na tela</label><span>{Math.round(sel.position * 100)}%</span></div>
            <input
              type="range" min={0.05} max={0.95} step={0.01} value={sel.position}
              onChange={(e) => api.preview(sel.id, { position: Number(e.target.value) })}
              onPointerUp={api.end} onKeyUp={api.end} onBlur={api.end} onKeyDown={stop}
            />
          </div>
          <button className="btn danger sm" onClick={() => api.remove(sel.id)}><Icon.Trash width={14} height={14} /> Excluir título</button>
        </section>
      )}

      {sorted.length > 0 && (
        <section className="cap-card cap-list-card">
          <div className="cap-row"><strong>Na linha do tempo</strong><span className="muted small">{sorted.length}</span></div>
          <div className="cap-list">
            {sorted.map((t) => (
              <div key={t.id} className={`cap-item${t.id === selectedId ? ' active' : ''}`} onClick={() => onSelect(t.id, true)}>
                <span className="cap-time">{formatTime(t.start, false)}</span>
                <span className="cap-text">{t.text.split(/\n/)[0] || '(vazio)'}</span>
                <span className="muted small">{TITLE_STYLES[t.style].label}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

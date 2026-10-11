import { useEffect, useRef } from 'react';
import { CUT_TYPES, FILLERS } from '../lib/captions';
import { formatTime } from '../lib/timeline';
import { Icon } from './Icons';

const fmtS = (s) => `${s.toFixed(1).replace('.', ',')} s`;

/**
 * Revisão de cortes sugeridos (Módulo 3). O app sugere, a pessoa decide uma por uma.
 * Atalhos com a lista em foco: ↑ ↓ navegam · A aceita · R rejeita · O ouve o trecho.
 */
export default function CutReview({ suggestions, isOn, options, focusId, onOptions, onDecide, onDecideAll, onFocus, onListen, onApply }) {
  const listRef = useRef(null);
  const on = suggestions.filter(isOn);
  const seconds = on.reduce((n, s) => n + s.seconds, 0);
  const restartsOff = suggestions.filter((s) => s.type === 'restart' && !isOn(s)).length;
  const focusIndex = Math.max(0, suggestions.findIndex((s) => s.id === focusId));

  // mantém o item em foco visível
  useEffect(() => {
    listRef.current?.querySelector('.cut-item.focus')?.scrollIntoView({ block: 'nearest' });
  }, [focusId]);

  const onKeyDown = (e) => {
    if (!suggestions.length) return;
    const cur = suggestions[focusIndex];
    const go = (d) => onFocus(suggestions[Math.min(suggestions.length - 1, Math.max(0, focusIndex + d))].id);
    const handled = {
      ArrowDown: () => go(1),
      ArrowUp: () => go(-1),
      a: () => { onDecide(cur.id, true); go(1); },
      r: () => { onDecide(cur.id, false); go(1); },
      o: () => onListen(cur),
    }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (handled && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation(); // não dispara os atalhos do editor (S = dividir etc.)
      handled();
    }
  };

  return (
    <section className="cap-card cut-review">
      <div className="cap-row">
        <strong>Cortes sugeridos</strong>
        <span className="muted small">o Kortin sugere, você decide</span>
      </div>

      <div className="cut-options">
        <label className="small muted" htmlFor="cut-pause">Pausas maiores que <b>{fmtS(options.minPause)}</b></label>
        <input
          id="cut-pause" type="range" min={0.3} max={2} step={0.1} value={options.minPause}
          onChange={(e) => onOptions({ minPause: Number(e.target.value) })}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="filler-chips">
          {FILLERS.map((f) => (
            <button
              key={f.word}
              className={options.fillers.includes(f.word) ? 'active' : ''}
              onClick={() => onOptions({ fillers: options.fillers.includes(f.word) ? options.fillers.filter((x) => x !== f.word) : [...options.fillers, f.word] })}
            >
              “{f.word}”
            </button>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={options.restarts} onChange={(e) => onOptions({ restarts: e.target.checked })} />
          <span>Frases reiniciadas <small className="muted">(começou, parou e recomeçou)</small></span>
        </label>
      </div>

      {suggestions.length > 0 ? (
        <>
          <div className="cut-summary">
            <span><b>{on.length}</b> de {suggestions.length} marcados · −{fmtS(seconds)}</span>
            <span>
              <button className="link-btn" onClick={() => onDecideAll(true)}>marcar todos</button>
              {' · '}
              <button className="link-btn" onClick={() => onDecideAll(false)}>nenhum</button>
            </span>
          </div>
          {restartsOff > 0 && (
            <p className="small cut-hint">{restartsOff} reinício(s) para conferir: ouça (O) e marque os que quer cortar (A).</p>
          )}
          <div className="cut-list" ref={listRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Cortes sugeridos. Setas navegam, A aceita, R rejeita, O ouve.">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className={`cut-item cut-${s.type}${isOn(s) ? ' on' : ''}${s.id === focusId ? ' focus' : ''}`}
                onClick={() => onFocus(s.id)}
              >
                <input
                  type="checkbox"
                  checked={isOn(s)}
                  onChange={(e) => onDecide(s.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Cortar: ${s.reason}`}
                />
                <span className="cut-badge">{CUT_TYPES[s.type].label}</span>
                <span className="cut-reason" title={s.reason}>{s.reason}</span>
                <span className="cut-time">{formatTime(s.start, false)} · −{fmtS(s.seconds)}</span>
                <button className="icon-btn sm" title="Ouvir o trecho (O)" onClick={(e) => { e.stopPropagation(); onListen(s); }}>
                  <Icon.Play width={12} height={12} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn primary sm" disabled={!on.length} onClick={onApply}>
            <Icon.Split width={14} height={14} />
            {on.length ? `Aplicar ${on.length} corte(s) · −${fmtS(seconds)}` : 'Nenhum corte marcado'}
          </button>
          <p className="muted small">Atalhos na lista: ↑ ↓ · A aceita · R rejeita · O ouve. Ctrl+Z desfaz tudo de uma vez.</p>
        </>
      ) : (
        <p className="muted small">Nada para cortar com estas opções.</p>
      )}
    </section>
  );
}

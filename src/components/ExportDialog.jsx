import { useEffect, useState } from 'react';
import { ASPECTS, FITS, QUALITIES, cleanError, formatTime } from '../lib/timeline';

export default function ExportDialog({ clips, total, aspect, fit, onClose }) {
  const [quality, setQuality] = useState('padrao');
  const [phase, setPhase] = useState('config'); // config | running | done | error
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(0);

  useEffect(() => window.klipo.onExportProgress(setProgress), []);

  const a = ASPECTS[aspect];

  const start = async () => {
    const path = await window.klipo.chooseExportPath(`klipo-${aspect.replace(':', 'x')}.mp4`);
    if (!path) return;
    const q = QUALITIES[quality];
    setPhase('running');
    setProgress(0);
    setStartedAt(Date.now());
    try {
      const res = await window.klipo.startExport({
        clips: clips.map(({ path, inPoint, outPoint, hasAudio }) => ({ path, inPoint, outPoint, hasAudio })),
        options: { width: a.width, height: a.height, fit, fps: 30, crf: q.crf, preset: q.preset, output: path },
      });
      if (res?.cancelled) {
        setPhase('config');
        return;
      }
      setOutput(path);
      setPhase('done');
    } catch (err) {
      setError(cleanError(err));
      setPhase('error');
    }
  };

  const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const eta = progress > 3 ? (elapsed / progress) * (100 - progress) : null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => phase !== 'running' && e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Exportar vídeo</h2>

        {phase === 'config' && (
          <>
            <div className="export-summary">
              <div><label>Formato</label><strong>{a.label}</strong><small>{a.width}×{a.height}</small></div>
              <div><label>Enquadramento</label><strong>{FITS[fit]}</strong></div>
              <div><label>Duração</label><strong>{formatTime(total)}</strong><small>{clips.length} clipe(s)</small></div>
            </div>

            <label className="field-label">Qualidade</label>
            <div className="segmented">
              {Object.entries(QUALITIES).map(([k, q]) => (
                <button key={k} className={quality === k ? 'active' : ''} onClick={() => setQuality(k)}>
                  {q.label}
                  <small>{q.hint}</small>
                </button>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>Cancelar</button>
              <button className="btn primary" onClick={start}>Escolher local e exportar</button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <>
            <p className="muted">Renderizando… você pode continuar olhando o projeto, mas não feche o app.</p>
            <div className="progress"><div style={{ width: `${progress}%` }} /></div>
            <div className="progress-info">
              <strong>{progress.toFixed(0)}%</strong>
              <span>{eta != null ? `~${formatTime(eta, false)} restantes` : 'calculando…'}</span>
            </div>
            <div className="modal-actions">
              <button className="btn danger" onClick={() => window.klipo.cancelExport()}>Cancelar exportação</button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            <div className="done-badge">✓</div>
            <p className="center">Vídeo exportado com sucesso!</p>
            <p className="center muted path">{output}</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>Fechar</button>
              <button className="btn primary" onClick={() => window.klipo.showInFolder(output)}>Mostrar na pasta</button>
            </div>
          </>
        )}

        {phase === 'error' && (
          <>
            <p>Não foi possível exportar o vídeo.</p>
            <pre className="error-box">{error}</pre>
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>Fechar</button>
              <button className="btn primary" onClick={() => setPhase('config')}>Tentar de novo</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

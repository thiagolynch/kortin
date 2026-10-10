import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';

const ENCODER_LABEL = {
  libx264: 'processador',
  h264_nvenc: 'placa NVIDIA',
  h264_qsv: 'placa Intel',
  h264_amf: 'placa AMD',
};

const STATUS = {
  queued: 'Na fila',
  running: 'Exportando',
  done: 'Pronto',
  error: 'Falhou',
  cancelled: 'Cancelado',
};

/** Botão no topo que mostra a fila de exportação em segundo plano */
export default function ExportQueue({ jobs, onCancel, onShow, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  if (!jobs.length) return null;
  const running = jobs.find((j) => j.status === 'running');
  const waiting = jobs.filter((j) => j.status === 'queued').length;
  const done = jobs.filter((j) => j.status === 'done').length;
  const failed = jobs.filter((j) => j.status === 'error').length;

  let label;
  if (running) label = `Exportando ${Math.round(running.progress)}%${waiting ? ` · +${waiting}` : ''}`;
  else if (waiting) label = `${waiting} na fila`;
  else if (failed) label = `${failed} falhou`;
  else label = `${done} pronto${done > 1 ? 's' : ''}`;

  return (
    <div className="queue" ref={ref}>
      <button className={`queue-pill${running ? ' running' : ''}${failed && !running ? ' failed' : ''}`} onClick={() => setOpen((o) => !o)}>
        {running ? <span className="spinner" /> : <Icon.Export width={14} height={14} />}
        {label}
        {running && <span className="queue-bar" style={{ width: `${running.progress}%` }} />}
      </button>
      {open && (
        <div className="queue-pop">
          <div className="queue-head">
            <strong>Exportações</strong>
            {!running && !waiting && <button className="link-btn" onClick={onClear}>Limpar</button>}
          </div>
          {jobs.map((j) => (
            <div key={j.id} className={`queue-item ${j.status}`}>
              <div className="queue-item-main">
                <span className="queue-name" title={j.output}>{j.label}</span>
                <span className="queue-status">
                  {STATUS[j.status]}
                  {j.status === 'running' && ` · ${Math.round(j.progress)}%`}
                  {j.encoder && j.status !== 'queued' && ` · ${ENCODER_LABEL[j.encoder] || j.encoder}`}
                  {j.fellBack && ' (a placa falhou, refeito no processador)'}
                </span>
                {j.status === 'running' && <div className="progress thin"><div style={{ width: `${j.progress}%` }} /></div>}
                {j.status === 'error' && <pre className="error-box small">{j.error}</pre>}
              </div>
              {(j.status === 'running' || j.status === 'queued') && (
                <button className="btn ghost sm" onClick={() => onCancel(j.id)}>Cancelar</button>
              )}
              {j.status === 'done' && (
                <button className="btn ghost sm" onClick={() => onShow(j.output)}>Mostrar</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

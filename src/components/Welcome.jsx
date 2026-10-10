import { useState } from 'react';
import { ASPECTS } from '../lib/timeline';
import { Logo } from './Icons';

/** Primeira abertura: a promessa da marca + escolher o formato + importar. Sem cadastro. */
export default function Welcome({ aspect, version, onDone }) {
  const [choice, setChoice] = useState(aspect);
  return (
    <div className="modal-backdrop">
      <div className="modal welcome">
        <div className="welcome-head">
          <Logo size={44} />
          <div>
            <h2>Bem-vindo ao Kortin</h2>
            <p className="muted">Seu editor de vídeo, no seu computador. Sem cadastro.</p>
          </div>
        </div>

        <ul className="welcome-promise">
          <li><strong>Exportar é sempre grátis</strong><span>Em qualquer qualidade, sem marca d'água.</span></li>
          <li><strong>Seu vídeo não sai do seu PC</strong><span>Nada é enviado para a nuvem.</span></li>
          <li><strong>Seu trabalho não se perde</strong><span>O Kortin guarda o projeto enquanto você edita.</span></li>
        </ul>

        <label className="field-label">Para onde é o seu vídeo?</label>
        <div className="format-grid">
          {Object.entries(ASPECTS).map(([k, a]) => (
            <button
              key={k}
              className={`format-card${choice === k ? ' active' : ''}`}
              onClick={() => setChoice(k)}
              aria-pressed={choice === k}
            >
              <span className="format-shape" style={{ aspectRatio: `${a.width} / ${a.height}` }} />
              <strong>{a.label}</strong>
              <small>{a.hint}</small>
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => onDone(choice, false)}>Explorar primeiro</button>
          <button className="btn primary" onClick={() => onDone(choice, true)}>Importar meus vídeos</button>
        </div>
        {version && <p className="muted small center">Versão {version}</p>}
      </div>
    </div>
  );
}

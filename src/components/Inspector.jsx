import { formatTime, MIN_CLIP } from '../lib/timeline';
import { Icon } from './Icons';

export default function Inspector({ clip, time, segment, onSetIn, onSetOut, onSplit, onDelete, onReset }) {
  if (!clip) {
    return (
      <aside className="panel inspector">
        <div className="panel-head"><span>Propriedades</span></div>
        <div className="inspector-empty">
          <p>Selecione um clipe na linha do tempo para ver e ajustar os detalhes.</p>
          <div className="shortcuts">
            <h4>Atalhos</h4>
            <dl>
              <dt>Espaço</dt><dd>Play / pausa</dd>
              <dt>S</dt><dd>Dividir no cursor</dd>
              <dt>Delete</dt><dd>Excluir clipe</dd>
              <dt>Ctrl+Z / Ctrl+Y</dt><dd>Desfazer / refazer</dd>
              <dt>← →</dt><dd>Avançar 1 quadro</dd>
              <dt>Shift + ← →</dt><dd>Avançar 1 segundo</dd>
              <dt>Ctrl + roda</dt><dd>Zoom na linha do tempo</dd>
            </dl>
          </div>
        </div>
      </aside>
    );
  }

  const len = clip.outPoint - clip.inPoint;
  const inside = segment && time >= segment.start && time <= segment.start + segment.len;
  const localTime = inside ? clip.inPoint + (time - segment.start) : null;
  const canIn = localTime != null && clip.outPoint - localTime >= MIN_CLIP;
  const canOut = localTime != null && localTime - clip.inPoint >= MIN_CLIP;

  return (
    <aside className="panel inspector">
      <div className="panel-head"><span>Propriedades</span></div>
      <div className="inspector-body">
        <div className="insp-thumb" style={{ backgroundImage: clip.thumb ? `url(${clip.thumb})` : undefined }} />
        <h3 className="insp-name" title={clip.name}>{clip.name}</h3>
        <p className="insp-meta">
          {clip.width}×{clip.height} · {clip.hasAudio ? 'com áudio' : 'sem áudio'}
        </p>

        <div className="insp-grid">
          <div><label>Início</label><span>{formatTime(clip.inPoint)}</span></div>
          <div><label>Fim</label><span>{formatTime(clip.outPoint)}</span></div>
          <div><label>Duração</label><span>{formatTime(len)}</span></div>
          <div><label>Original</label><span>{formatTime(clip.duration)}</span></div>
        </div>

        <div className="insp-actions">
          <button className="btn" disabled={!canIn} onClick={() => onSetIn(localTime)} title="O clipe passa a começar onde está o cursor">
            [ Início aqui
          </button>
          <button className="btn" disabled={!canOut} onClick={() => onSetOut(localTime)} title="O clipe passa a terminar onde está o cursor">
            Fim aqui ]
          </button>
          <button className="btn" onClick={onSplit}><Icon.Split width={15} height={15} /> Dividir</button>
          <button className="btn" onClick={onReset} disabled={clip.inPoint === 0 && clip.outPoint === clip.duration}>
            Restaurar
          </button>
          <button className="btn danger" onClick={onDelete}><Icon.Trash width={15} height={15} /> Excluir</button>
        </div>

        {!inside && <p className="insp-hint">Posicione o cursor sobre este clipe para cortar no ponto exato.</p>}
      </div>
    </aside>
  );
}

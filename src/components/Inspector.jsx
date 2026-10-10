import { formatTime, MIN_CLIP } from '../lib/timeline';
import { Icon } from './Icons';

export default function Inspector({
  clip, time, segment, onSetIn, onSetOut, onSplit, onDuplicate, onDelete, onReset, onVolumeStart, onVolume,
}) {
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
              <dt>Ctrl+D</dt><dd>Duplicar clipe</dd>
              <dt>Ctrl+S</dt><dd>Salvar projeto</dd>
              <dt>Ctrl+O</dt><dd>Abrir projeto</dd>
              <dt>Ctrl+Z</dt><dd>Desfazer</dd>
              <dt>Ctrl+Y</dt><dd>Refazer</dd>
              <dt>← →</dt><dd>Avançar 1 quadro</dd>
              <dt>Shift ← →</dt><dd>Avançar 1 segundo</dd>
              <dt>Ctrl + roda</dt><dd>Zoom na timeline</dd>
            </dl>
          </div>
        </div>
      </aside>
    );
  }

  const len = clip.outPoint - clip.inPoint;
  const volume = clip.hasAudio ? clip.volume ?? 1 : 0;
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

        <div className="insp-volume">
          <div className="insp-volume-head">
            <label>Volume</label>
            <span>{clip.hasAudio ? `${Math.round(volume * 100)}%` : 'sem áudio'}</span>
          </div>
          <div className="insp-volume-row">
            <button
              className={`icon-btn${volume === 0 ? ' active' : ''}`}
              disabled={!clip.hasAudio}
              title={volume === 0 ? 'Ativar som' : 'Silenciar clipe'}
              onClick={() => { onVolumeStart(); onVolume(volume === 0 ? 1 : 0); }}
            >
              {volume === 0 ? <Icon.Mute /> : <Icon.Volume />}
            </button>
            <input
              type="range" min={0} max={100} step={1}
              value={Math.round(volume * 100)}
              disabled={!clip.hasAudio}
              onPointerDown={onVolumeStart}
              onKeyDown={(e) => { e.stopPropagation(); if (!e.repeat) onVolumeStart(); }}
              onChange={(e) => onVolume(Number(e.target.value) / 100)}
            />
          </div>
        </div>

        <div className="insp-actions">
          <button className="btn" disabled={!canIn} onClick={() => onSetIn(localTime)} title="O clipe passa a começar onde está o cursor">
            [ Início aqui
          </button>
          <button className="btn" disabled={!canOut} onClick={() => onSetOut(localTime)} title="O clipe passa a terminar onde está o cursor">
            Fim aqui ]
          </button>
          <button className="btn" onClick={onSplit}><Icon.Split width={15} height={15} /> Dividir</button>
          <button className="btn" onClick={onDuplicate}><Icon.Copy width={15} height={15} /> Duplicar</button>
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

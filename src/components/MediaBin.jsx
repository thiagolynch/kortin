import { formatTime } from '../lib/timeline';
import { Icon } from './Icons';

export default function MediaBin({ media, busy, onImport, onAdd }) {
  return (
    <>
      <div className="panel-subhead">
        <span>{media.length ? `${media.length} arquivo(s)` : 'Nenhum arquivo'}</span>
        <button className="btn ghost sm" onClick={onImport} disabled={!!busy}>
          <Icon.Import width={15} height={15} /> Importar
        </button>
      </div>

      {busy && <div className="bin-busy"><span className="spinner" /> {busy}</div>}

      {!media.length && !busy ? (
        <div className="bin-empty">
          <Icon.Film width={28} height={28} />
          <p>Seus vídeos importados aparecem aqui.</p>
        </div>
      ) : (
        <div className="bin-grid">
          {media.map((m) => (
            <button
              key={m.path}
              className="bin-item"
              title={`${m.name}\nClique duplo para adicionar na linha do tempo`}
              onDoubleClick={() => onAdd(m)}
            >
              <div className="bin-thumb" style={{ backgroundImage: m.thumb ? `url(${m.thumb})` : undefined }}>
                <span className="bin-dur">{formatTime(m.duration, false)}</span>
                {!m.hasAudio && <span className="bin-mute"><Icon.Mute width={12} height={12} /></span>}
                <span className="bin-add" onClick={(e) => { e.stopPropagation(); onAdd(m); }} title="Adicionar na linha do tempo">
                  <Icon.Plus width={14} height={14} />
                </span>
              </div>
              <span className="bin-name">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

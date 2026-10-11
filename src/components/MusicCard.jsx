import { formatTime } from '../lib/timeline';
import { Icon } from './Icons';

const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (v) => `${v.toFixed(1).replace('.', ',')} s`;

/** Música de fundo: escolher, volume, abaixar com a fala e fades. Sliders = 1 passo de desfazer. */
export default function MusicCard({ music, total, busy, onPick, onRemove, onChange, onPreview, onEnd }) {
  if (!music) {
    return (
      <section className="music-card empty">
        <div>
          <strong><Icon.Music width={14} height={14} /> Música de fundo</strong>
          <p className="muted small">MP3, WAV, M4A… Ela repete até o fim do vídeo e abaixa sozinha quando alguém fala.</p>
        </div>
        <button className="btn sm" onClick={onPick} disabled={busy}>Escolher música</button>
      </section>
    );
  }
  const slider = (label, key, display, props) => (
    <div className="music-control">
      <div className="insp-control-head"><label>{label}</label><span>{display}</span></div>
      <input
        type="range" {...props} value={music[key]}
        onChange={(e) => onPreview({ [key]: Number(e.target.value) })}
        onPointerUp={onEnd} onKeyUp={onEnd} onBlur={onEnd}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
  const loops = total > 0 && music.duration ? Math.ceil(total / music.duration) : 1;
  return (
    <section className="music-card">
      <div className="music-head">
        <Icon.Music width={16} height={16} />
        <div className="music-name">
          <strong title={music.path}>{music.name}</strong>
          <small className="muted">
            {formatTime(music.duration, false)}
            {loops > 1 ? ` · repete ${loops}x neste vídeo` : ''}
          </small>
        </div>
        <button className="icon-btn" title="Trocar música" onClick={onPick} disabled={busy}><Icon.Open width={15} height={15} /></button>
        <button className="icon-btn" title="Remover música" onClick={onRemove}><Icon.Trash width={15} height={15} /></button>
      </div>
      {slider('Volume', 'volume', pct(music.volume), { min: 0, max: 1, step: 0.01 })}
      <label className="switch" title="Quando há fala, a música abaixa cerca de 12 dB e volta sozinha nas pausas.">
        <input type="checkbox" checked={!!music.duck} onChange={(e) => onChange({ duck: e.target.checked })} />
        <span>Abaixar quando houver fala</span>
      </label>
      <div className="insp-fades">
        {slider('Entrada', 'fadeIn', secs(music.fadeIn || 0), { min: 0, max: 10, step: 0.5 })}
        {slider('Saída', 'fadeOut', secs(music.fadeOut || 0), { min: 0, max: 10, step: 0.5 })}
      </div>
    </section>
  );
}

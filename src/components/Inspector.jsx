import {
  MAX_FADE, MAX_VOLUME, MIN_CLIP, SPEEDS, clipLength, formatSpeed, formatTime, sourceTime,
} from '../lib/timeline';
import { Icon } from './Icons';

const SHORTCUTS = (
  <div className="shortcuts">
    <h4>Atalhos</h4>
    <dl>
      <dt>Espaço</dt><dd>Play / pausa</dd>
      <dt>S</dt><dd>Dividir no cursor</dd>
      <dt>Delete</dt><dd>Excluir clipe</dd>
      <dt>Ctrl+D</dt><dd>Duplicar clipe</dd>
      <dt>N</dt><dd>Ligar / desligar o ímã</dd>
      <dt>Alt</dt><dd>Arrastar sem ímã</dd>
      <dt>Ctrl+S</dt><dd>Salvar projeto</dd>
      <dt>Ctrl+O</dt><dd>Abrir projeto</dd>
      <dt>Ctrl+Z</dt><dd>Desfazer</dd>
      <dt>Ctrl+Y</dt><dd>Refazer</dd>
      <dt>← →</dt><dd>Avançar 1 quadro</dd>
      <dt>Shift ← →</dt><dd>Avançar 1 segundo</dd>
      <dt>Ctrl + roda</dt><dd>Zoom na timeline</dd>
    </dl>
  </div>
);

function Slider({ label, value, display, min, max, step, disabled, onStart, onChange, icon }) {
  return (
    <div className="insp-control">
      <div className="insp-control-head">
        <label>{label}</label>
        <span>{display}</span>
      </div>
      <div className="insp-control-row">
        {icon}
        <input
          type="range" min={min} max={max} step={step} value={value} disabled={disabled}
          onPointerDown={onStart}
          onKeyDown={(e) => { e.stopPropagation(); if (!e.repeat) onStart(); }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

export default function Inspector({
  clip, time, segment, onSetIn, onSetOut, onSplit, onDuplicate, onDelete, onReset, onChangeStart, onChange,
}) {
  if (!clip) {
    return (
      <aside className="panel inspector">
        <div className="panel-head"><span>Propriedades</span></div>
        <div className="inspector-empty">
          <p>Selecione um clipe na linha do tempo para ver e ajustar os detalhes.</p>
          {SHORTCUTS}
        </div>
      </aside>
    );
  }

  const len = clipLength(clip);
  const speed = clip.speed || 1;
  const volume = clip.hasAudio ? clip.volume ?? 1 : 0;
  const inside = segment && time >= segment.start && time <= segment.start + segment.len;
  const localTime = inside ? sourceTime(segment, time) : null;
  const canIn = localTime != null && clip.outPoint - localTime >= MIN_CLIP;
  const canOut = localTime != null && localTime - clip.inPoint >= MIN_CLIP;
  const maxFade = Math.min(MAX_FADE, Math.floor((len / 2) * 10) / 10);

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

        <div className="insp-section">
          <label className="insp-section-label">Velocidade</label>
          <div className="speed-chips">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                className={sp === speed ? 'active' : ''}
                onClick={() => { if (sp !== speed) { onChangeStart(); onChange({ speed: sp }); } }}
              >
                {formatSpeed(sp)}
              </button>
            ))}
          </div>
        </div>

        <Slider
          label="Volume"
          value={Math.round(volume * 100)}
          display={clip.hasAudio ? `${Math.round(volume * 100)}%` : 'sem áudio'}
          min={0} max={MAX_VOLUME * 100} step={1}
          disabled={!clip.hasAudio}
          onStart={onChangeStart}
          onChange={(v) => onChange({ volume: v / 100 })}
          icon={
            <button
              className={`icon-btn${volume === 0 ? ' active' : ''}`}
              disabled={!clip.hasAudio}
              title={volume === 0 ? 'Ativar som' : 'Silenciar clipe'}
              onClick={() => { onChangeStart(); onChange({ volume: volume === 0 ? 1 : 0 }); }}
            >
              {volume === 0 ? <Icon.Mute /> : <Icon.Volume />}
            </button>
          }
        />

        <div className="insp-fades">
          <Slider
            label="Fade de entrada"
            value={Math.min(clip.fadeIn || 0, maxFade)}
            display={`${(clip.fadeIn || 0).toFixed(1).replace('.', ',')} s`}
            min={0} max={maxFade} step={0.1}
            disabled={!clip.hasAudio || maxFade <= 0}
            onStart={onChangeStart}
            onChange={(v) => onChange({ fadeIn: v })}
          />
          <Slider
            label="Fade de saída"
            value={Math.min(clip.fadeOut || 0, maxFade)}
            display={`${(clip.fadeOut || 0).toFixed(1).replace('.', ',')} s`}
            min={0} max={maxFade} step={0.1}
            disabled={!clip.hasAudio || maxFade <= 0}
            onStart={onChangeStart}
            onChange={(v) => onChange({ fadeOut: v })}
          />
        </div>

        <label className={`switch insp-switch${clip.hasAudio ? '' : ' disabled'}`} title="Remove chiado e barulho constante de fundo. Aplicado na exportação.">
          <input
            type="checkbox"
            checked={!!clip.denoise}
            disabled={!clip.hasAudio}
            onChange={(e) => { onChangeStart(); onChange({ denoise: e.target.checked }); }}
          />
          <span>Reduzir ruído de fundo <small className="muted">(na exportação)</small></span>
        </label>

        <div className="insp-actions">
          <button className="btn" disabled={!canIn} onClick={() => onSetIn(localTime)} title="O clipe passa a começar onde está o cursor">
            [ Início aqui
          </button>
          <button className="btn" disabled={!canOut} onClick={() => onSetOut(localTime)} title="O clipe passa a terminar onde está o cursor">
            Fim aqui ]
          </button>
          <button className="btn" onClick={onSplit}><Icon.Split width={15} height={15} /> Dividir</button>
          <button className="btn" onClick={onDuplicate}><Icon.Copy width={15} height={15} /> Duplicar</button>
          <button
            className="btn"
            onClick={onReset}
            disabled={clip.inPoint === 0 && clip.outPoint === clip.duration && speed === 1 && !clip.fadeIn && !clip.fadeOut && (clip.volume ?? 1) === 1 && !clip.denoise}
            title="Volta o clipe ao original: sem cortes, velocidade 1x, volume 100%"
          >
            Restaurar
          </button>
          <button className="btn danger" onClick={onDelete}><Icon.Trash width={15} height={15} /> Excluir</button>
        </div>

        {!inside && <p className="insp-hint">Posicione o cursor sobre este clipe para cortar no ponto exato.</p>}
      </div>
    </aside>
  );
}

import {
  FILTERS, FILTER_LABELS, MAX_FADE, MAX_VIDEO_FADE, MAX_VOLUME, MIN_CLIP, SPEEDS, ZOOM_LABELS, clipLength, formatSpeed, formatTime,
  sourceTime,
} from '../lib/timeline';
import { filterCss } from './ColorFilters';
import { Icon } from './Icons';
import { useDerivedPlayhead } from '../state/playhead';

// Estado do cursor em relação ao clipe, como bits: 1 = dentro, 2 = pode marcar início, 4 = pode marcar fim.
// Primitivo e quase constante: o Inspector não re-renderiza a cada quadro do play.
function cursorFlags(clip, segment, time) {
  if (!segment || time < segment.start || time > segment.start + segment.len) return 0;
  const local = sourceTime(segment, time);
  return 1 | (clip.outPoint - local >= MIN_CLIP ? 2 : 0) | (local - clip.inPoint >= MIN_CLIP ? 4 : 0);
}

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

/** Slider com transação: um arrasto inteiro vira um único passo no desfazer */
function Slider({ label, value, display, min, max, step, disabled, onChange, onEnd, icon }) {
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
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onEnd}
          onKeyUp={onEnd}
          onBlur={onEnd}
        />
      </div>
    </div>
  );
}

export default function Inspector(props) {
  if (!props.clip) {
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
  return <ClipInspector {...props} />;
}

function ClipInspector({ clip, segment, store, edit, onSplit, onDuplicate, onDelete, onReset, onFilterAll, onSmoothJoins }) {
  const flags = useDerivedPlayhead(store, (t) => cursorFlags(clip, segment, t), [clip, segment]);
  const inside = !!(flags & 1);
  const canIn = !!(flags & 2);
  const canOut = !!(flags & 4);
  // no clique lê o tempo exato (não o do último render)
  const localNow = () => sourceTime(segment, store.get().time);

  const len = clipLength(clip);
  const speed = clip.speed || 1;
  const volume = clip.hasAudio ? clip.volume ?? 1 : 0;
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
                onClick={() => sp !== speed && edit.commit({ speed: sp })}
              >
                {formatSpeed(sp)}
              </button>
            ))}
          </div>
        </div>

        <div className="insp-section">
          <div className="insp-row-head">
            <label className="insp-section-label">Cor</label>
            {(clip.filter || 'natural') !== 'natural' && (
              <button className="link-btn small" onClick={() => onFilterAll(clip.filter)} title="Usa esta cor em todos os clipes">aplicar a todos</button>
            )}
          </div>
          <div className="filter-chips">
            {Object.keys(FILTERS).map((f) => (
              <button
                key={f}
                className={(clip.filter || 'natural') === f ? 'active' : ''}
                onClick={() => (clip.filter || 'natural') !== f && edit.commit({ filter: f })}
                title={FILTER_LABELS[f]}
              >
                <span className="filter-swatch" style={{ backgroundImage: clip.thumb ? `url(${clip.thumb})` : undefined, filter: filterCss(f) }} />
                <small>{FILTER_LABELS[f]}</small>
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
          onChange={(v) => edit.preview({ volume: v / 100 })}
          onEnd={edit.end}
          icon={
            <button
              className={`icon-btn${volume === 0 ? ' active' : ''}`}
              disabled={!clip.hasAudio}
              title={volume === 0 ? 'Ativar som' : 'Silenciar clipe'}
              onClick={() => edit.commit({ volume: volume === 0 ? 1 : 0 })}
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
            onChange={(v) => edit.preview({ fadeIn: v })}
            onEnd={edit.end}
          />
          <Slider
            label="Fade de saída"
            value={Math.min(clip.fadeOut || 0, maxFade)}
            display={`${(clip.fadeOut || 0).toFixed(1).replace('.', ',')} s`}
            min={0} max={maxFade} step={0.1}
            disabled={!clip.hasAudio || maxFade <= 0}
            onChange={(v) => edit.preview({ fadeOut: v })}
            onEnd={edit.end}
          />
        </div>

        <div className="insp-section">
          <div className="insp-row-head">
            <label className="insp-section-label">Transição da imagem</label>
            <button className="link-btn small" onClick={onSmoothJoins} title="Fade pelo preto de 0,25 s em todas as emendas">suavizar todas as emendas</button>
          </div>
          <div className="insp-fades">
            <Slider
              label="Surge do preto"
              value={Math.min(clip.videoFadeIn || 0, MAX_VIDEO_FADE)}
              display={`${(clip.videoFadeIn || 0).toFixed(1).replace('.', ',')} s`}
              min={0} max={Math.min(MAX_VIDEO_FADE, maxFade)} step={0.05}
              disabled={maxFade <= 0}
              onChange={(v) => edit.preview({ videoFadeIn: v })}
              onEnd={edit.end}
            />
            <Slider
              label="Some no preto"
              value={Math.min(clip.videoFadeOut || 0, MAX_VIDEO_FADE)}
              display={`${(clip.videoFadeOut || 0).toFixed(1).replace('.', ',')} s`}
              min={0} max={Math.min(MAX_VIDEO_FADE, maxFade)} step={0.05}
              disabled={maxFade <= 0}
              onChange={(v) => edit.preview({ videoFadeOut: v })}
              onEnd={edit.end}
            />
          </div>
        </div>

        <div className="insp-section">
          <label className="insp-section-label">Zoom</label>
          <div className="speed-chips">
            {Object.entries(ZOOM_LABELS).map(([k, l]) => (
              <button
                key={k}
                className={(clip.zoom || 'none') === k ? 'active' : ''}
                onClick={() => (clip.zoom || 'none') !== k && edit.commit({ zoom: k })}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <label className="switch insp-switch" title="Cantos escurecidos + grão sutil, pra dar textura de filme. Aplicado na exportação.">
          <input
            type="checkbox"
            checked={!!clip.vignette}
            onChange={(e) => edit.commit({ vignette: e.target.checked })}
          />
          <span>Vinheta cinematográfica <small className="muted">(na exportação)</small></span>
        </label>

        <label className={`switch insp-switch${clip.hasAudio ? '' : ' disabled'}`} title="Remove chiado e barulho constante de fundo. Aplicado na exportação.">
          <input
            type="checkbox"
            checked={!!clip.denoise}
            disabled={!clip.hasAudio}
            onChange={(e) => edit.commit({ denoise: e.target.checked })}
          />
          <span>Reduzir ruído de fundo <small className="muted">(na exportação)</small></span>
        </label>

        <div className="insp-actions">
          <button className="btn" disabled={!canIn} onClick={() => edit.commit({ inPoint: localNow() })} title="O clipe passa a começar onde está o cursor">
            [ Início aqui
          </button>
          <button className="btn" disabled={!canOut} onClick={() => edit.commit({ outPoint: localNow() })} title="O clipe passa a terminar onde está o cursor">
            Fim aqui ]
          </button>
          <button className="btn" onClick={onSplit}><Icon.Split width={15} height={15} /> Dividir</button>
          <button className="btn" onClick={onDuplicate}><Icon.Copy width={15} height={15} /> Duplicar</button>
          <button
            className="btn"
            onClick={onReset}
            disabled={clip.inPoint === 0 && clip.outPoint === clip.duration && speed === 1 && !clip.fadeIn && !clip.fadeOut && (clip.volume ?? 1) === 1 && !clip.denoise && (clip.filter || 'natural') === 'natural' && !clip.videoFadeIn && !clip.videoFadeOut && (clip.zoom || 'none') === 'none' && !clip.vignette}
            title="Volta o clipe ao original: sem cortes, velocidade 1x, volume 100%, cor natural, sem transição"
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

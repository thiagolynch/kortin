// Pequenos componentes que leem o cursor (playhead). Só eles re-renderizam durante o play.
import { memo } from 'react';
import { selectPlaying, usePlayhead } from '../state/playhead';
import { formatTime } from '../lib/timeline';
import { Icon } from './Icons';

// formatTime mostra centésimos: arredondar no seletor evita render quando o texto não muda
const selectCentis = (s) => Math.floor(s.time * 100);

export const Timecode = memo(function Timecode({ store, total }) {
  const centis = usePlayhead(store, selectCentis);
  return (
    <span className="timecode">
      <strong>{formatTime(centis / 100)}</strong> / {formatTime(total)}
    </span>
  );
});

export const PlayButton = memo(function PlayButton({ store, onToggle, disabled }) {
  const playing = usePlayhead(store, selectPlaying);
  return (
    <button className="play-btn" onClick={onToggle} disabled={disabled} title="Play / pausa (Espaço)">
      {playing ? <Icon.Pause /> : <Icon.Play />}
    </button>
  );
});

import { memo } from 'react';
import { CAPTION_SIZES, CAPTION_STYLES, cueAt } from '../lib/captions';

/** Prévia da legenda sobre o vídeo, com os mesmos estilos da exportação */
function CaptionOverlay({ cues, time, settings, width, height }) {
  if (!settings?.enabled || !cues.length || !width) return null;
  const cue = cueAt(cues, time);
  if (!cue) return null;
  const preset = CAPTION_STYLES[settings.style] || CAPTION_STYLES.classica;
  const upper = settings.uppercase ?? preset.upper;
  const fontSize = preset.size * Math.sqrt(width * height) * (CAPTION_SIZES[settings.size] || 1);
  let active = -1;
  cue.words.forEach((w, i) => { if (time >= w.start) active = i; });
  return (
    <div
      className={`cap-overlay cap-${settings.style}`}
      style={{ top: `${settings.position * 100}%`, fontSize, '--bord': `${Math.max(1, fontSize * 0.11)}px` }}
    >
      <span className="cap-line">
        {cue.words.map((w, i) => (
          <span key={i} className={i === active ? 'on' : undefined}>
            {upper ? w.text.toLocaleUpperCase('pt-BR') : w.text}
            {i < cue.words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    </div>
  );
}

export default memo(CaptionOverlay);

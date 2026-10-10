import { memo } from 'react';
import { CAPTION_SIZES, CAPTION_STYLES, cueIndexAt } from '../lib/captions';
import { useDerivedPlayhead } from '../state/playhead';

// Posição na legenda como um número só: índice da legenda * 1000 + palavra ativa.
// Muda poucas vezes por segundo, então o overlay não re-renderiza a cada quadro.
const WORD_SLOTS = 1000;
function cursorKey(cues, t) {
  const index = cueIndexAt(cues, t);
  if (index < 0) return -1;
  const cue = cues.at(index);
  let active = -1;
  for (let i = 0; i < cue.words.length && t >= cue.words[i].start; i++) active = i;
  return index * WORD_SLOTS + active + 1;
}

/** Prévia da legenda sobre o vídeo, com os mesmos estilos da exportação */
function CaptionOverlay({ cues, store, settings, width, height }) {
  const enabled = !!settings?.enabled && cues.length > 0 && width > 0;
  const key = useDerivedPlayhead(store, (t) => (enabled ? cursorKey(cues, t) : -1), [cues, enabled]);
  if (key < 0) return null;
  const cue = cues[Math.floor(key / WORD_SLOTS)];
  const active = (key % WORD_SLOTS) - 1;
  const preset = CAPTION_STYLES[settings.style] || CAPTION_STYLES.classica;
  const upper = settings.uppercase ?? preset.upper;
  const fontSize = preset.size * Math.sqrt(width * height) * (CAPTION_SIZES[settings.size] || 1);
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

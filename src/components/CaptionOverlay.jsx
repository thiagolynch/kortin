import { memo } from 'react';
import { ASS_FONT_EM, CAPTION_SIZES, CAPTION_STYLES, cueIndexAt, keywordColorFor } from '../lib/captions';
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

/** Uma linha de palavras, com cor própria pras palavras-chave e (se ativa >= 0) destaque na palavra da vez. */
function Words({ words, upper, keywords, active = -1 }) {
  return words.map((w, i) => {
    const text = upper ? w.text.toLocaleUpperCase('pt-BR') : w.text;
    const kw = keywordColorFor(w.text, keywords);
    return (
      <span key={i} className={i === active ? 'on' : undefined} style={kw ? { color: kw } : undefined}>
        {text}
        {i < words.length - 1 ? ' ' : ''}
      </span>
    );
  });
}

/** Prévia da legenda sobre o vídeo, com os mesmos estilos (e cor/palavras-chave/empilhamento) da exportação */
function CaptionOverlay({ cues, store, settings, width, height }) {
  const enabled = !!settings?.enabled && cues.length > 0 && width > 0;
  const key = useDerivedPlayhead(store, (t) => (enabled ? cursorKey(cues, t) : -1), [cues, enabled]);
  if (key < 0) return null;
  const idx = Math.floor(key / WORD_SLOTS);
  const cue = cues[idx];
  const active = (key % WORD_SLOTS) - 1;
  const preset = CAPTION_STYLES[settings.style] || CAPTION_STYLES.classica;
  const upper = settings.uppercase ?? preset.upper;
  // mesmo cálculo da exportação (tamanho do .ass), convertido para CSS
  const assSize = preset.size * Math.sqrt(width * height) * (CAPTION_SIZES[settings.size] || 1);
  const fontSize = assSize / ASS_FONT_EM;
  const context = settings.stacked ? [cues[idx - 2], cues[idx - 1]].filter((c) => c?.words?.length) : [];
  return (
    <div
      className={`cap-overlay cap-${settings.style}`}
      style={{
        top: `${settings.position * 100}%`, fontSize, '--bord': `${Math.max(1, assSize * 0.11)}px`,
        ...(settings.color ? { '--cap-color': settings.color } : {}),
        ...(settings.accent ? { '--cap-accent': settings.accent } : {}),
      }}
    >
      {context.map((c, i) => (
        <span className="cap-line cap-line-dim" key={`ctx-${i}`}>
          <Words words={c.words} upper={upper} keywords={settings.keywords} />
        </span>
      ))}
      <span className="cap-line">
        <Words words={cue.words} upper={upper} keywords={settings.keywords} active={active} />
      </span>
    </div>
  );
}

export default memo(CaptionOverlay);

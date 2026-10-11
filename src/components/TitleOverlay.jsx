import { memo } from 'react';
import { useDerivedPlayhead } from '../state/playhead';
import { TITLE_STYLES, activeTitleKey, titleLines } from '../lib/titles';
import { ASS_FONT_EM } from '../lib/captions';

/**
 * Prévia dos títulos sobre o vídeo, com o mesmo tamanho relativo e as mesmas linhas da exportação.
 * Só re-renderiza quando o conjunto de títulos visíveis muda.
 */
function TitleOverlay({ titles, aspect, store, width, height, selectedId, onSelect }) {
  const key = useDerivedPlayhead(store, (t) => activeTitleKey(titles, t), [titles]);
  if (!key || !width) return null;
  const ids = new Set(key.split('|'));
  const base = Math.sqrt(width * height);
  return titles.filter((t) => ids.has(t.id)).map((t) => {
    const assSize = TITLE_STYLES[t.style].size * base; // o tamanho que vai no .ass
    const fs = assSize / ASS_FONT_EM;
    return (
      <div
        key={t.id}
        className={`title-overlay title-${t.style}${t.id === selectedId ? ' selected' : ''}`}
        style={{ top: `${t.position * 100}%`, fontSize: fs, '--pad': `${Math.max(2, assSize * (t.style === 'rodape' ? 0.45 : 0.35))}px` }}
        onClick={() => onSelect(t.id)}
      >
        {titleLines(t, aspect).map((line, i) => <span key={i}>{line}</span>)}
      </div>
    );
  });
}

export default memo(TitleOverlay);

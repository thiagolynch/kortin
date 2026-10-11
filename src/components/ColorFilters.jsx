// Filtros de cor da prévia: as MESMAS matrizes da exportação (shared/constants.json), aplicadas
// em sRGB (color-interpolation-filters), como o colorchannelmixer do FFmpeg.
import { FILTERS } from '../lib/timeline';

const values = (m) => `${m[0]} ${m[1]} ${m[2]} 0 0  ${m[3]} ${m[4]} ${m[5]} 0 0  ${m[6]} ${m[7]} ${m[8]} 0 0  0 0 0 1 0`;

/** Definições SVG; renderizar uma vez na página. */
export function ColorFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {Object.entries(FILTERS).filter(([, f]) => f).map(([name, f]) => (
          <filter key={name} id={`kf-${name}`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={values(f.matrix)} />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/** Valor de CSS `filter` para um preset (ou undefined para "natural"). */
export function filterCss(name) {
  const f = FILTERS[name];
  if (!f) return undefined;
  return `url(#kf-${name})${f.contrast ? ` contrast(${f.contrast})` : ''}`;
}

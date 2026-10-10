import { useEffect, useState } from 'react';
import { ASPECTS, FITS, QUALITIES, formatTime } from '../lib/timeline';
import { MAX_CHARS, cuesForExport, deriveCues } from '../lib/captions';

/** Configura a exportação e devolve os trabalhos para a fila (a exportação roda em segundo plano). */
export default function ExportDialog({
  clips, total, aspect, fit, projectName, segments, transcripts, captionSettings, onQueue, onClose,
}) {
  const [formats, setFormats] = useState([aspect]);
  const [quality, setQuality] = useState('padrao');
  const [hardware, setHardware] = useState(null); // null = verificando, [] = nenhuma
  const [useHw, setUseHw] = useState(true);
  const [busy, setBusy] = useState(false);
  const hasCaptions = !!segments?.length && Object.keys(transcripts || {}).length > 0;
  const [withCaptions, setWithCaptions] = useState(hasCaptions && captionSettings?.enabled);

  useEffect(() => {
    let alive = true;
    window.kortin.hardwareEncoders().then((list) => alive && setHardware(list || []));
    return () => { alive = false; };
  }, []);

  const toggleFormat = (k) =>
    setFormats((f) => (f.includes(k) ? (f.length > 1 ? f.filter((x) => x !== k) : f) : [...f, k]));

  const base = (projectName || 'kortin').replace(/[\\/:*?"<>|]/g, '');
  const fileName = (k) => `${base}-${k.replace(':', 'x')}.mp4`;

  const start = async () => {
    setBusy(true);
    try {
      let outputs;
      if (formats.length === 1) {
        const out = await window.kortin.chooseExportPath(fileName(formats[0]));
        if (!out) return;
        outputs = [out];
      } else {
        const dir = await window.kortin.chooseFolder();
        if (!dir) return;
        outputs = await Promise.all(formats.map((k) => window.kortin.joinPath(dir, fileName(k))));
      }
      const q = QUALITIES[quality];
      const encoder = useHw && hardware?.length ? hardware[0].id : 'libx264';
      const snapshot = clips.map(({ path, inPoint, outPoint, hasAudio, volume, speed, fadeIn, fadeOut, denoise }) => ({
        path, inPoint, outPoint, hasAudio, volume, speed, fadeIn, fadeOut, denoise,
      }));
      // a legenda é montada por formato: no vertical, frases mais curtas
      const captionsFor = (k) => {
        if (!withCaptions) return undefined;
        const cues = cuesForExport(deriveCues(segments, transcripts, { maxChars: MAX_CHARS[k] || 28 }));
        return cues.length ? { cues, settings: captionSettings } : undefined;
      };
      onQueue(
        formats.map((k, i) => ({
          label: `${ASPECTS[k].label} · ${outputs[i].split(/[\\/]/).pop()}`,
          output: outputs[i],
          duration: total,
          clips: snapshot,
          options: {
            width: ASPECTS[k].width, height: ASPECTS[k].height, fit, fps: 30,
            crf: q.crf, preset: q.preset, encoder, output: outputs[i], captions: captionsFor(k),
          },
        }))
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Exportar vídeo</h2>

        <div className="export-summary">
          <div><label>Duração</label><strong>{formatTime(total)}</strong><small>{clips.length} clipe(s)</small></div>
          <div><label>Enquadramento</label><strong>{FITS[fit]}</strong></div>
          <div><label>Resolução</label><strong>1080p</strong><small>30 fps</small></div>
        </div>

        <label className="field-label">Formatos <small>(escolha um ou mais)</small></label>
        <div className="format-grid">
          {Object.entries(ASPECTS).map(([k, a]) => (
            <button
              key={k}
              className={`format-card${formats.includes(k) ? ' active' : ''}`}
              onClick={() => toggleFormat(k)}
              aria-pressed={formats.includes(k)}
            >
              <span className="format-shape" style={{ aspectRatio: `${a.width} / ${a.height}` }} />
              <strong>{a.label}</strong>
              <small>{a.hint}</small>
            </button>
          ))}
        </div>

        <label className="field-label">Qualidade</label>
        <div className="segmented">
          {Object.entries(QUALITIES).map(([k, q]) => (
            <button key={k} className={quality === k ? 'active' : ''} onClick={() => setQuality(k)}>
              {q.label}
              <small>{q.hint}</small>
            </button>
          ))}
        </div>

        {hasCaptions && (
          <label className="hw-toggle">
            <input type="checkbox" checked={withCaptions} onChange={(e) => setWithCaptions(e.target.checked)} />
            <span>
              <strong>Incluir legenda no vídeo</strong>
              <small>A legenda fica gravada na imagem, no estilo escolhido. Em cada formato ela se ajusta ao tamanho da tela.</small>
            </span>
          </label>
        )}

        <label className={`hw-toggle${hardware?.length ? '' : ' disabled'}`}>
          <input
            type="checkbox"
            checked={useHw && !!hardware?.length}
            disabled={!hardware?.length}
            onChange={(e) => setUseHw(e.target.checked)}
          />
          <span>
            <strong>Usar a placa de vídeo</strong>
            <small>
              {hardware === null
                ? 'Verificando este computador…'
                : hardware.length
                  ? `${hardware[0].label} encontrada: exporta várias vezes mais rápido. Se falhar, o Kortin refaz pelo processador.`
                  : 'Nenhuma placa compatível encontrada. A exportação usa o processador.'}
            </small>
          </span>
        </label>

        <p className="export-promise">✓ Sem marca d'água · ✓ Qualidade máxima liberada · ✓ Grátis</p>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={start} disabled={busy}>
            {formats.length > 1 ? `Escolher pasta e exportar ${formats.length} vídeos` : 'Escolher local e exportar'}
          </button>
        </div>
        <p className="muted small center">A exportação roda em segundo plano: você pode continuar editando.</p>
      </div>
    </div>
  );
}

// Biblioteca de mídia: leitura dos vídeos (3 por vez) e onda sonora em segundo plano.
import { useCallback, useMemo, useRef, useState } from 'react';
import { mapPool } from '../lib/pool';
import { cleanError } from '../lib/timeline';

const PROBE_CONCURRENCY = 3;

export function useMediaLibrary() {
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState('');
  const [peaksByPath, setPeaksByPath] = useState({});
  const peaksAsked = useRef(new Set());

  const loadPeaks = useCallback((items) => {
    for (const m of items) {
      if (!m.hasAudio || peaksAsked.current.has(m.path)) continue;
      peaksAsked.current.add(m.path);
      window.kortin.peaks(m.path)
        .then((peaks) => setPeaksByPath((prev) => ({ ...prev, [m.path]: peaks })))
        .catch(() => peaksAsked.current.delete(m.path));
    }
  }, []);

  /** Lê vários arquivos. Devolve { ok: [info], errors: [{ path, message }] } na ordem pedida. */
  const probeAll = useCallback(async (paths) => {
    setBusy(`Lendo 0 de ${paths.length}…`);
    const results = await mapPool(paths, PROBE_CONCURRENCY, (p) => window.kortin.probe(p), (d, t) => setBusy(`Lendo ${d} de ${t}…`));
    setBusy('');
    const ok = [];
    const errors = [];
    results.forEach((r, i) => (r.ok ? ok.push(r.value) : errors.push({ path: paths[i], message: cleanError(r.error) })));
    return { ok, errors };
  }, []);

  const addMedia = useCallback((items) => {
    setMedia((m) => [...m, ...items.filter((a) => !m.some((x) => x.path === a.path))]);
    loadPeaks(items);
  }, [loadPeaks]);

  const replaceMedia = useCallback((items) => {
    setMedia(items);
    loadPeaks(items);
  }, [loadPeaks]);

  return useMemo(
    () => ({ media, busy, peaksByPath, probeAll, addMedia, replaceMedia }),
    [media, busy, peaksByPath, probeAll, addMedia, replaceMedia]
  );
}

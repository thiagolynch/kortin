// Fila de exportação: um vídeo por vez, em segundo plano, com progresso e cancelamento.
import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanError, uid } from '../lib/timeline';

export function useExportQueue(notify) {
  const [jobs, setJobs] = useState([]);
  const running = useRef(null);

  const patch = useCallback((id, fields) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...fields } : j))), []);

  useEffect(() => {
    const offP = window.kortin.onExportProgress((p) => running.current && patch(running.current, { progress: p }));
    const offE = window.kortin.onExportEncoder((enc) => running.current && patch(running.current, { encoder: enc }));
    return () => { offP(); offE(); };
  }, [patch]);

  useEffect(() => {
    if (running.current) return;
    const next = jobs.find((j) => j.status === 'queued');
    if (!next) return;
    running.current = next.id;
    patch(next.id, { status: 'running' });
    window.kortin.startExport({ clips: next.clips, options: next.options })
      .then((res) => {
        if (res?.cancelled) return patch(next.id, { status: 'cancelled' });
        patch(next.id, { status: 'done', progress: 100, encoder: res?.encoder, fellBack: res?.fellBack });
        notify(`Vídeo pronto: ${next.output.split(/[\\/]/).pop()}`);
        return undefined;
      })
      .catch((err) => patch(next.id, { status: 'error', error: cleanError(err) }))
      .finally(() => {
        running.current = null;
        setJobs((js) => [...js]); // dispara o próximo
      });
  }, [jobs, notify, patch]);

  const enqueue = useCallback((list) => {
    setJobs((js) => [...js, ...list.map((x) => ({ ...x, id: uid(), status: 'queued', progress: 0 }))]);
  }, []);

  const cancel = useCallback((id) => {
    if (id === running.current) window.kortin.cancelExport();
    else patch(id, { status: 'cancelled' });
  }, [patch]);

  const clear = useCallback(() => setJobs((js) => js.filter((j) => j.status === 'running' || j.status === 'queued')), []);

  return { jobs, enqueue, cancel, clear };
}

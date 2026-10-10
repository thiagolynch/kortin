// Posição do cursor (playhead) fora do estado do React.
// Durante o play ela muda 60 vezes por segundo; se fosse useState no App, a tela inteira
// (painéis, listas de legenda, inspector) re-renderizaria a cada quadro. Aqui só quem lê o
// cursor re-renderiza, e só quando o valor que ele seleciona muda.
import { useCallback, useSyncExternalStore } from 'react';

export function createPlayheadStore() {
  let state = { time: 0, playing: false };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      if (next.time === state.time && next.playing === state.playing) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Lê do cursor só o que interessa. O seletor deve devolver um valor primitivo (número, texto, booleano). */
export function usePlayhead(store, selector) {
  const getSnapshot = useCallback(() => selector(store.get()), [store, selector]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export const selectTime = (s) => s.time;
export const selectPlaying = (s) => s.playing;

/**
 * Lê do cursor um valor derivado do tempo (ex.: índice do clipe atual).
 * `deps` controla quando a função muda; o valor devolvido deve ser primitivo.
 */
export function useDerivedPlayhead(store, fn, deps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selector = useCallback((s) => fn(s.time), deps);
  return usePlayhead(store, selector);
}

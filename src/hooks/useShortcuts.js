// Atalhos de teclado. Recebe um mapa de ações; os atalhos de arquivo funcionam em qualquer lugar,
// os de edição não disparam enquanto se digita num campo.
import { useEffect, useRef } from 'react';

export function useShortcuts(actions, enabled) {
  const ref = useRef(actions);
  ref.current = actions;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      const a = ref.current;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const run = (fn, ...args) => { e.preventDefault(); fn(...args); };

      if (ctrl && key === 's') return run(a.save, e.shiftKey);
      if (ctrl && key === 'o') return run(a.open);
      if (ctrl && key === 'n') return run(a.newProject);
      if (e.target.closest?.('input, select, textarea, [contenteditable="true"]')) return undefined;
      if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.key)) return undefined;

      if (e.code === 'Space') return run(a.togglePlay);
      if (ctrl && key === 'z' && !e.shiftKey) return run(a.undo);
      if (ctrl && (key === 'y' || (e.shiftKey && key === 'z'))) return run(a.redo);
      if (ctrl && key === 'd') return run(a.duplicate);
      if (!ctrl && key === 'n') return run(a.toggleSnap);
      if (!ctrl && key === 's') return run(a.split);
      if (e.key === 'Delete' || e.key === 'Backspace') return run(a.remove);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = (e.shiftKey ? 1 : 1 / 30) * (e.key === 'ArrowLeft' ? -1 : 1);
        return run(a.step, step);
      }
      if (e.key === 'Home') return run(a.seek, 0);
      if (e.key === 'End') return run(a.seek, Infinity);
      return undefined;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

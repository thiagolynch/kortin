// Estado do documento (o que é salvo no projeto) + histórico de desfazer/refazer.
// Tudo que muda o projeto passa por aqui: clipes, formato, enquadramento, legendas e transcrições.
// Os estados são imutáveis e compartilham estrutura, então guardar 100 passos custa pouco.
import { useCallback, useMemo, useReducer } from 'react';
import { DEFAULT_CAPTIONS } from '../lib/captions';

export const HISTORY_LIMIT = 100;

export const emptyDocument = (aspect = '9:16', fit = 'blur') => ({
  clips: [],
  aspect,
  fit,
  captions: DEFAULT_CAPTIONS,
  transcripts: {},
  music: null, // { path, name, duration, volume, duck, fadeIn, fadeOut }
  titles: [], // [{ id, text, start, duration, style, position }]
});

const initial = (doc) => ({ doc, past: [], future: [], txn: null });

function closeTxn(state) {
  if (!state.txn) return state;
  if (state.txn.start === state.doc) return { ...state, txn: null };
  const past = [...state.past, state.txn.start].slice(-HISTORY_LIMIT);
  return { doc: state.doc, past, future: [], txn: null };
}

/**
 * Ações:
 *  commit  → aplica uma mudança e cria um passo no histórico
 *  begin   → abre uma transação (arrastar alça, mexer em slider): um passo só no fim
 *  preview → muda durante a transação, sem criar passos
 *  end     → fecha a transação (se nada mudou, não cria passo)
 *  undo / redo / reset
 */
export function documentReducer(state, action) {
  switch (action.type) {
    case 'commit': {
      // uma transação esquecida aberta (slider sem pointerup) é fechada antes: nenhum passo se perde
      const base = closeTxn(state);
      const doc = action.recipe(base.doc);
      if (doc === base.doc) return base;
      const past = [...base.past, base.doc].slice(-HISTORY_LIMIT);
      return { doc, past, future: [], txn: null };
    }
    case 'begin':
      if (state.txn) return state;
      return { ...state, txn: { start: state.doc } };
    case 'preview': {
      const doc = action.recipe(state.doc);
      return doc === state.doc ? state : { ...state, doc };
    }
    case 'end':
      return closeTxn(state);
    case 'undo': {
      state = closeTxn(state); // eslint-disable-line no-param-reassign
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return { doc: prev, past: state.past.slice(0, -1), future: [state.doc, ...state.future], txn: null };
    }
    case 'redo': {
      if (state.txn) return closeTxn(state);
      if (!state.future.length) return state;
      const [next, ...rest] = state.future;
      return { doc: next, past: [...state.past, state.doc], future: rest, txn: null };
    }
    case 'reset':
      return initial(action.doc);
    default:
      return state;
  }
}

export function useDocument() {
  const [state, dispatch] = useReducer(documentReducer, undefined, () => initial(emptyDocument()));
  const api = useMemo(() => ({
    commit: (recipe) => dispatch({ type: 'commit', recipe }),
    begin: () => dispatch({ type: 'begin' }),
    preview: (recipe) => dispatch({ type: 'preview', recipe }),
    end: () => dispatch({ type: 'end' }),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    reset: (doc) => dispatch({ type: 'reset', doc }),
  }), []);
  const set = useCallback((key, value) => api.commit((d) => (d[key] === value ? d : { ...d, [key]: value })), [api]);
  // `ops` é estável entre renders: pode ir em dependências de useMemo/useCallback sem recriar nada
  const ops = useMemo(() => ({ ...api, set }), [api, set]);
  return {
    doc: state.doc,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    inTransaction: !!state.txn,
    ops,
    ...ops,
  };
}

/** Atualiza um clipe pelo id (devolve o mesmo documento se nada mudou). */
export const patchClip = (id, patch) => (d) => {
  let changed = false;
  const clips = d.clips.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...patch };
    if (Object.keys(patch).some((k) => next[k] !== c[k])) changed = true;
    return next;
  });
  return changed ? { ...d, clips } : d;
};

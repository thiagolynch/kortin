import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, documentReducer, emptyDocument, patchClip } from '../../src/state/document';

const init = () => ({ doc: { ...emptyDocument(), clips: [{ id: 'a', volume: 1 }] }, past: [], future: [], txn: null });
const run = (state, ...actions) => actions.reduce(documentReducer, state);

describe('documentReducer', () => {
  it('commit sem mudança não cria passo', () => {
    const s = init();
    expect(run(s, { type: 'commit', recipe: (d) => d })).toBe(s);
    expect(run(s, { type: 'commit', recipe: patchClip('a', { volume: 1 }) })).toBe(s);
  });

  it('transação inteira vira um passo só', () => {
    const s = run(init(),
      { type: 'begin' },
      { type: 'preview', recipe: patchClip('a', { volume: 1.2 }) },
      { type: 'preview', recipe: patchClip('a', { volume: 1.5 }) },
      { type: 'end' });
    expect(s.past).toHaveLength(1);
    expect(s.doc.clips[0].volume).toBe(1.5);
    expect(run(s, { type: 'undo' }).doc.clips[0].volume).toBe(1);
  });

  it('transação esquecida aberta é fechada no commit e no undo', () => {
    const open = run(init(), { type: 'begin' }, { type: 'preview', recipe: patchClip('a', { volume: 2 }) });
    const afterCommit = run(open, { type: 'commit', recipe: patchClip('a', { volume: 0 }) });
    expect(afterCommit.past).toHaveLength(2);
    expect(run(afterCommit, { type: 'undo' }).doc.clips[0].volume).toBe(2);
    expect(run(open, { type: 'undo' }).doc.clips[0].volume).toBe(1);
  });

  it('desfazer/refazer é simétrico e refazer some após nova edição', () => {
    let s = run(init(), { type: 'commit', recipe: (d) => ({ ...d, aspect: '16:9' }) }, { type: 'commit', recipe: (d) => ({ ...d, fit: 'cover' }) });
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(s.doc.aspect).toBe('9:16');
    s = run(s, { type: 'redo' });
    expect(s.doc.aspect).toBe('16:9');
    s = run(s, { type: 'commit', recipe: (d) => ({ ...d, fit: 'contain' }) });
    expect(s.future).toHaveLength(0);
  });

  it('histórico limitado', () => {
    let s = init();
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) s = run(s, { type: 'commit', recipe: patchClip('a', { volume: i / 1000 }) });
    expect(s.past).toHaveLength(HISTORY_LIMIT);
  });
});

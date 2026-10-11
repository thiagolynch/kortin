import { useState } from 'react';
import { cleanError, formatTime } from '../lib/timeline';

/**
 * "Arquivos não encontrados": aparece ao abrir um projeto cujos vídeos mudaram de lugar.
 * O usuário localiza um por um ou aponta uma pasta para o Kortin procurar todos de uma vez.
 * onDone(map) recebe { caminhoAntigo: caminhoNovo } (vazio = abrir sem eles); onCancel desiste.
 */
export default function RelinkDialog({ missing, onDone, onCancel }) {
  const [map, setMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const pending = missing.filter((m) => !map[m.path]);

  const locate = async (m) => {
    setNote('');
    try {
      const p = await window.kortin.locateMedia(m.name);
      if (p) setMap((x) => ({ ...x, [m.path]: p }));
    } catch (err) {
      setNote(cleanError(err));
    }
  };

  const search = async () => {
    setBusy(true);
    setNote('');
    try {
      const res = await window.kortin.searchMediaFolder(pending.map((m) => m.name));
      if (!res) return;
      const next = { ...map };
      let n = 0;
      for (const m of pending) {
        const hit = res.found[m.name.toLowerCase()];
        if (hit) { next[m.path] = hit; n++; }
      }
      setMap(next);
      const left = pending.length - n;
      setNote(
        `${n ? `${n} encontrado(s).` : 'Nenhum encontrado nessa pasta.'}` +
        `${left ? ` Faltam ${left}.` : ''}${res.complete ? '' : ' A pasta é muito grande: a busca parou no limite; tente uma pasta mais específica.'}`
      );
    } catch (err) {
      setNote(cleanError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal relink" role="dialog" aria-labelledby="relink-title">
        <h2 id="relink-title">Arquivos não encontrados</h2>
        <p className="muted small">
          {missing.length === 1
            ? 'Um vídeo deste projeto não está mais onde estava (mudou de pasta ou o projeto veio de outro computador). Mostre onde ele está e o projeto abre completo.'
            : `${missing.length} vídeos deste projeto não estão mais onde estavam (mudaram de pasta ou o projeto veio de outro computador). Mostre onde eles estão e o projeto abre completo.`}
        </p>

        <ul className="relink-list">
          {missing.map((m) => (
            <li key={m.path} className={map[m.path] ? 'ok' : ''}>
              <div className="relink-info">
                <strong title={m.path}>{m.name}</strong>
                <small className="muted" title={map[m.path] || m.path}>
                  {map[m.path] ? `✓ ${map[m.path]}` : `antes em ${m.path.slice(0, -m.name.length) || '—'}`}
                  {m.duration ? ` · ${formatTime(m.duration, false)}` : ''}
                </small>
              </div>
              <button className="btn sm" onClick={() => locate(m)} disabled={busy}>
                {map[m.path] ? 'Trocar' : 'Localizar…'}
              </button>
            </li>
          ))}
        </ul>

        {pending.length > 0 && (
          <button className="btn" onClick={search} disabled={busy}>
            {busy ? 'Procurando…' : `Procurar ${pending.length > 1 ? 'todos' : ''} numa pasta…`}
          </button>
        )}
        {note && <p className="small relink-note">{note}</p>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="btn primary" onClick={() => onDone(map)} disabled={busy}>
            {pending.length ? `Abrir sem ${pending.length} vídeo(s)` : 'Abrir projeto'}
          </button>
        </div>
        {pending.length > 0 && (
          <p className="muted small center">Os clipes de {pending.map((m) => m.name).slice(0, 3).join(', ')}{pending.length > 3 ? '…' : ''} ficam de fora se você abrir agora.</p>
        )}
      </div>
    </div>
  );
}

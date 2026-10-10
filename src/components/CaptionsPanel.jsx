import { useEffect, useMemo, useState } from 'react';
import { CAPTION_STYLES, FILLERS, LANGUAGES, cueAt, cueText, planCleanup } from '../lib/captions';
import { useDerivedPlayhead } from '../state/playhead';
import { cleanError, formatTime } from '../lib/timeline';
import { Icon } from './Icons';

/**
 * Painel de legendas: gerar (IA no PC), estilo, limpeza da fala e edição do texto.
 */
export default function CaptionsPanel({
  clips, cues, transcripts, settings, store, api, onSeek, onApplyCleanup, notify,
}) {
  const onSettings = api.settings;
  // legenda ativa: busca binária, e só re-renderiza quando a legenda muda (não a cada quadro)
  const activeId = useDerivedPlayhead(store, (t) => cueAt(cues, t)?.id ?? null, [cues]);
  const [status, setStatus] = useState(null); // { available, models }
  const [download, setDownload] = useState(null); // { key, p }
  const [job, setJob] = useState(null); // { index, total, name, p }
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [error, setError] = useState('');
  const [pauses, setPauses] = useState(true);
  const [fillers, setFillers] = useState(() => FILLERS.filter((f) => f.on).map((f) => f.word));
  const [editing, setEditing] = useState(null); // id da legenda em edição

  const refresh = () => window.kortin.captionsStatus().then(setStatus).catch(() => setStatus({ available: false, models: {} }));
  useEffect(() => { refresh(); }, []);
  useEffect(() => window.kortin.onDownloadProgress(setDownload), []);
  useEffect(() => window.kortin.onTranscribeProgress(({ p }) => setJob((j) => (j ? { ...j, p } : j))), []);

  const model = status?.models?.[settings.model];
  const paths = useMemo(() => [...new Set(clips.filter((c) => c.hasAudio).map((c) => c.path))], [clips]);
  const missing = paths.filter((p) => {
    const t = transcripts[p];
    return !t || t.language !== settings.language || (t.model !== settings.model && !t.edited);
  });
  const busy = !!download || !!job;

  const generate = async () => {
    setError('');
    setConfirmDownload(false);
    try {
      if (!model?.installed) {
        setDownload({ key: settings.model, p: 0 });
        const res = await window.kortin.downloadModel(settings.model);
        setDownload(null);
        await refresh();
        if (res?.cancelled) return;
      }
      const results = {};
      for (let i = 0; i < missing.length; i++) {
        const p = missing[i];
        setJob({ index: i + 1, total: missing.length, name: p.split(/[\\/]/).pop(), p: 0 });
        const res = await window.kortin.transcribe(p, settings.model, settings.language);
        if (res?.cancelled) break;
        results[p] = res;
      }
      if (Object.keys(results).length) {
        api.addTranscripts(results);
        const words = Object.values(results).reduce((n, r) => n + r.words.length, 0);
        notify(words ? `Legenda gerada: ${words} palavras.` : 'Não encontrei fala nos vídeos.');
      }
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setDownload(null);
      setJob(null);
    }
  };

  const cancel = () => {
    if (download) window.kortin.cancelDownload();
    if (job) window.kortin.cancelTranscribe();
  };

  const fillerDefs = FILLERS.filter((f) => fillers.includes(f.word));
  const plan = useMemo(
    () => (Object.keys(transcripts).length ? planCleanup(clips, transcripts, { pauses, fillers: fillerDefs }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clips, transcripts, pauses, fillers.join(',')]
  );

  if (!status) return <div className="cap-body muted">Verificando…</div>;

  if (!status.available) {
    return (
      <div className="cap-body">
        <div className="cap-card">
          <strong>Legenda automática indisponível nesta versão</strong>
          <p className="muted">
            O componente de IA não foi incluído. Em modo de desenvolvimento, rode <code>npm run setup:whisper</code> e abra o app de novo.
          </p>
        </div>
      </div>
    );
  }

  const hasCaptions = cues.length > 0;

  return (
    <div className="cap-body">
      {/* Gerar */}
      <section className="cap-card">
        <div className="cap-row">
          <strong>{hasCaptions ? 'Legendas' : 'Gerar legenda automática'}</strong>
          <span className="cap-local" title="O áudio é processado no seu computador. Nada é enviado para a internet.">
            <Icon.Lock width={12} height={12} /> no seu PC
          </span>
        </div>

        <div className="cap-models">
          {Object.entries(status.models).map(([k, m]) => (
            <button
              key={k}
              className={`cap-model${settings.model === k ? ' active' : ''}`}
              onClick={() => onSettings({ model: k })}
              disabled={busy}
            >
              <span className="cap-model-name">{m.label}</span>
              <small>{m.installed ? 'Instalado' : `${m.sizeMB} MB`}</small>
            </button>
          ))}
        </div>
        <p className="muted small">{model?.hint}</p>

        <div className="cap-gen">
          <select
            className="select"
            value={settings.language}
            onChange={(e) => onSettings({ language: e.target.value })}
            disabled={busy}
            aria-label="Idioma da fala"
          >
            {Object.entries(LANGUAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {!busy && (
            <button
              className="btn primary"
              disabled={!paths.length || (!missing.length && hasCaptions)}
              onClick={() => (model?.installed ? generate() : setConfirmDownload(true))}
            >
              <Icon.Sparkles width={14} height={14} />
              {!paths.length
                ? 'Sem vídeos com áudio'
                : !missing.length
                  ? 'Legenda em dia'
                  : !hasCaptions
                    ? 'Gerar legenda'
                    : missing.every((p) => transcripts[p])
                      ? `Refazer com o modelo ${model?.label || ''}`
                      : `Gerar para ${missing.length} vídeo(s) novo(s)`}
            </button>
          )}
        </div>

        {confirmDownload && (
          <div className="cap-confirm">
            <p>
              Para gerar legendas no seu PC, o Kortin baixa o modelo <strong>{model?.label}</strong> ({model?.sizeMB} MB)
              <strong> uma única vez</strong>. Depois funciona sem internet.
            </p>
            <div className="cap-row end">
              <button className="btn ghost sm" onClick={() => setConfirmDownload(false)}>Agora não</button>
              <button className="btn primary sm" onClick={generate}>Baixar e gerar</button>
            </div>
          </div>
        )}

        {download && (
          <div className="cap-progress">
            <span>Baixando o modelo {status.models[download.key]?.label}… {Math.round((download.p || 0) * 100)}%</span>
            <div className="progress thin"><div style={{ width: `${(download.p || 0) * 100}%` }} /></div>
            <button className="link-btn" onClick={cancel}>Cancelar</button>
          </div>
        )}
        {job && (
          <div className="cap-progress">
            <span>Transcrevendo {job.total > 1 ? `${job.index} de ${job.total}` : job.name}… {Math.round(job.p * 100)}%</span>
            <div className="progress thin"><div style={{ width: `${job.p * 100}%` }} /></div>
            <button className="link-btn" onClick={cancel}>Cancelar</button>
          </div>
        )}
        {error && <pre className="error-box small">{error}</pre>}
      </section>

      {hasCaptions && (
        <>
          {/* Estilo */}
          <section className="cap-card">
            <div className="cap-row">
              <strong>Estilo</strong>
              <label className="switch">
                <input type="checkbox" checked={settings.enabled} onChange={(e) => onSettings({ enabled: e.target.checked })} />
                <span>Mostrar no vídeo</span>
              </label>
            </div>
            <div className="cap-styles">
              {Object.entries(CAPTION_STYLES).map(([k, s]) => (
                <button key={k} className={`cap-style cap-style-${k}${settings.style === k ? ' active' : ''}`} onClick={() => onSettings({ style: k })}>
                  <span className="cap-style-sample">{s.upper ? 'OLÁ ' : 'Olá '}<em>{s.upper ? 'GENTE' : 'gente'}</em></span>
                  <small>{s.label}</small>
                </button>
              ))}
            </div>
            <div className="cap-row wrap">
              <label className="small muted">Tamanho</label>
              <div className="segmented compact">
                {[['p', 'P'], ['m', 'M'], ['g', 'G']].map(([k, l]) => (
                  <button key={k} className={settings.size === k ? 'active' : ''} onClick={() => onSettings({ size: k })}>{l}</button>
                ))}
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.uppercase ?? CAPTION_STYLES[settings.style].upper}
                  onChange={(e) => onSettings({ uppercase: e.target.checked })}
                />
                <span>Maiúsculas</span>
              </label>
            </div>
            <div className="cap-row">
              <label className="small muted">Altura</label>
              <input
                type="range" min={10} max={90} step={1}
                value={Math.round(settings.position * 100)}
                onChange={(e) => api.previewSettings({ position: Number(e.target.value) / 100 })}
                onPointerUp={api.end}
                onKeyUp={api.end}
                onBlur={api.end}
                onKeyDown={(e) => e.stopPropagation()}
                className="grow"
              />
            </div>
          </section>

          {/* Limpeza da fala */}
          <section className="cap-card">
            <strong>Limpar a fala</strong>
            <p className="muted small">Corta pausas e vícios usando a transcrição. Dá para desfazer com Ctrl+Z.</p>
            <label className="switch">
              <input type="checkbox" checked={pauses} onChange={(e) => setPauses(e.target.checked)} />
              <span>Pausas longas (mais de 0,7 s)</span>
            </label>
            <div className="filler-chips">
              {FILLERS.map((f) => (
                <button
                  key={f.word}
                  className={fillers.includes(f.word) ? 'active' : ''}
                  onClick={() => setFillers((l) => (l.includes(f.word) ? l.filter((x) => x !== f.word) : [...l, f.word]))}
                >
                  “{f.word}”
                </button>
              ))}
            </div>
            <button
              className="btn sm"
              disabled={!plan?.cuts}
              onClick={() => onApplyCleanup(plan, `${plan.cuts} corte(s), ${plan.seconds.toFixed(1).replace('.', ',')} s a menos`)}
            >
              <Icon.Split width={14} height={14} />
              {plan?.cuts ? `Aplicar ${plan.cuts} corte(s) · −${plan.seconds.toFixed(1).replace('.', ',')} s` : 'Nada para cortar'}
            </button>
          </section>

          {/* Texto */}
          <section className="cap-card cap-list-card">
            <div className="cap-row">
              <strong>Texto</strong>
              <span className="muted small">{cues.length} legendas · clique para editar</span>
            </div>
            <div className="cap-list">
              {cues.map((c) => (
                <div
                  key={c.id}
                  className={`cap-item${c.id === activeId ? ' active' : ''}`}
                  onClick={() => onSeek(c.start + 0.01)}
                >
                  <span className="cap-time">{formatTime(c.start, false)}</span>
                  {editing === c.id ? (
                    <input
                      className="cap-input"
                      defaultValue={cueText(c)}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      onBlur={(e) => {
                        const v = e.currentTarget.value;
                        setEditing(null);
                        if (v.trim() !== cueText(c)) api.editCue(c, v);
                      }}
                    />
                  ) : (
                    <span className="cap-text" onDoubleClick={(e) => { e.stopPropagation(); setEditing(c.id); }}>
                      {cueText(c)}
                    </span>
                  )}
                  {editing !== c.id && (
                    <button className="cap-edit" title="Editar texto" onClick={(e) => { e.stopPropagation(); setEditing(c.id); }}>
                      <Icon.Edit width={13} height={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

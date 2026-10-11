import { useState } from 'react';
import { Icon } from './Icons';
import { formatTime } from '../lib/timeline';
import { buildHighlightJob, highlightFileName } from '../lib/highlights';

/**
 * Melhores momentos: acha trechos do clipe selecionado com mais energia sonora (e fala, se já
 * transcrito) e deixa exportar cada um direto como short vertical — o mesmo corte em 9:16 serve
 * para TikTok, Reels e YouTube Shorts, sem precisar de IA paga nem de internet.
 */
export default function HighlightsPanel({ clip, transcripts, player, onExport, notify }) {
  const [clipSeconds, setClipSeconds] = useState(30);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState(null); // null = ainda não procurou
  const [exportingAt, setExportingAt] = useState(null);

  const run = async () => {
    if (!clip) return;
    setBusy(true);
    setFound(null);
    try {
      const words = (transcripts?.[clip.path]?.words || []).map((w) => ({ start: w.s, text: w.w }));
      const res = await window.kortin.findHighlights({
        filePath: clip.path, start: clip.inPoint, end: clip.outPoint, clipSeconds, count: 5, words,
      });
      setFound(res);
      if (!res.length) notify('Nenhum trecho encontrado — o clipe pode ser curto demais para esse tamanho de corte.');
    } catch (err) {
      notify(`Não foi possível analisar o áudio: ${err?.message || err}`);
      setFound([]);
    } finally {
      setBusy(false);
    }
  };

  const listen = (h) => { player.pause(); player.playRange(h.start, h.end); };

  const exportOne = async (h) => {
    setExportingAt(h.start);
    try {
      const out = await window.kortin.chooseExportPath(highlightFileName(clip, h));
      if (out) onExport(buildHighlightJob(clip, h, out));
    } finally {
      setExportingAt(null);
    }
  };

  return (
    <div className="cap-body">
      <section className="cap-card">
        <div className="cap-row"><strong>Melhores momentos</strong></div>
        <p className="muted small">
          Analisa a onda sonora (e a transcrição, se já tiver sido feita) do clipe selecionado e sugere
          trechos para virar um vídeo curto — o corte sai pronto em 9:16, formato de TikTok, Reels e
          YouTube Shorts ao mesmo tempo.
        </p>
        {!clip ? (
          <p className="muted small">Selecione um clipe na linha do tempo para analisar.</p>
        ) : (
          <>
            <div className="music-control">
              <div className="insp-control-head"><label>Duração do corte</label><span>{clipSeconds} s</span></div>
              <input
                type="range" min={10} max={60} step={5} value={clipSeconds}
                onChange={(e) => setClipSeconds(Number(e.target.value))}
              />
            </div>
            <button className="btn primary sm" disabled={busy} onClick={run}>
              <Icon.Sparkles width={14} height={14} /> {busy ? 'Analisando…' : 'Encontrar melhores momentos'}
            </button>
          </>
        )}
      </section>

      {found && found.length > 0 && (
        <section className="cap-card cap-list-card">
          <div className="cap-row"><strong>Sugestões</strong><span className="muted small">{found.length}</span></div>
          <div className="cap-list">
            {found.map((h) => (
              <div key={`${h.start}-${h.end}`} className="cap-item">
                <span className="cap-time">{formatTime(h.start, false)}–{formatTime(h.end, false)}</span>
                <span className="cap-text">{h.reason} · nota {h.score}/100</span>
                <button className="icon-btn sm" title="Ouvir o trecho" onClick={() => listen(h)}>
                  <Icon.Play width={12} height={12} />
                </button>
                <button className="btn ghost sm" disabled={exportingAt === h.start} onClick={() => exportOne(h)}>
                  <Icon.Export width={13} height={13} /> {exportingAt === h.start ? 'Exportando…' : 'Short 9:16'}
                </button>
              </div>
            ))}
          </div>
          <p className="muted small">A nota compara os trechos deste clipe entre si — não é uma métrica absoluta de qualidade.</p>
        </section>
      )}
    </div>
  );
}

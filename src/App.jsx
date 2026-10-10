import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Preview from './components/Preview';
import Timeline from './components/Timeline';
import MediaBin from './components/MediaBin';
import Inspector from './components/Inspector';
import ExportDialog from './components/ExportDialog';
import { Icon } from './components/Icons';
import { usePlayer } from './lib/usePlayer';
import {
  ASPECTS, FITS, buildSegments, cleanError, formatTime, locate, mediaToClip, splitAt, totalOf,
} from './lib/timeline';

const HISTORY_LIMIT = 100;
const hasBridge = typeof window !== 'undefined' && !!window.klipo;

export default function App() {
  const [media, setMedia] = useState([]);
  const [clips, setClipsRaw] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [aspect, setAspect] = useState('9:16');
  const [fit, setFit] = useState('blur');
  const [zoom, setZoom] = useState(40); // pixels por segundo
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ---------- Histórico (desfazer / refazer) ----------
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const history = useRef({ past: [], future: [] });
  const [, forceHistory] = useState(0);

  const snapshot = useCallback(() => {
    const h = history.current;
    h.past.push(clipsRef.current);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    forceHistory((n) => n + 1);
  }, []);

  const commit = useCallback((next) => {
    snapshot();
    setClipsRaw(next);
  }, [snapshot]);

  const undo = useCallback(() => {
    const h = history.current;
    if (!h.past.length) return;
    h.future.push(clipsRef.current);
    setClipsRaw(h.past.pop());
    forceHistory((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push(clipsRef.current);
    setClipsRaw(h.future.pop());
    forceHistory((n) => n + 1);
  }, []);

  // ---------- Linha do tempo ----------
  const segments = useMemo(() => buildSegments(clips), [clips]);
  const total = totalOf(segments);
  const player = usePlayer(segments);

  const selectedClip = clips.find((c) => c.id === selectedId) || null;
  const selectedSegment = segments.find((s) => s.clip.id === selectedId) || null;
  const currentClip = locate(segments, player.time)?.seg.clip || null;

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => setToast(''), 3500);
  }, []);

  // ---------- Importação ----------
  const importPaths = useCallback(async (paths) => {
    if (!paths?.length) return;
    const added = [];
    const errors = [];
    for (let i = 0; i < paths.length; i++) {
      setBusy(`Lendo ${i + 1} de ${paths.length}…`);
      try {
        added.push(await window.klipo.probe(paths[i]));
      } catch (err) {
        const name = paths[i].split(/[\\/]/).pop();
        errors.push(`${name}: ${cleanError(err)}`);
      }
    }
    setBusy('');
    if (added.length) {
      setMedia((m) => [...m, ...added.filter((a) => !m.some((x) => x.path === a.path))]);
      const newClips = added.map(mediaToClip);
      commit([...clipsRef.current, ...newClips]);
      setSelectedId(newClips[newClips.length - 1].id);
    }
    if (errors.length) showToast(`Não foi possível importar: ${errors.join(' · ')}`);
  }, [commit, showToast]);

  const openImport = useCallback(async () => {
    if (!hasBridge) return;
    importPaths(await window.klipo.openVideos());
  }, [importPaths]);

  useEffect(() => (hasBridge ? window.klipo.onOpenFiles(importPaths) : undefined), [importPaths]);

  const addFromBin = useCallback((m) => {
    const clip = mediaToClip(m);
    commit([...clipsRef.current, clip]);
    setSelectedId(clip.id);
  }, [commit]);

  // ---------- Edição ----------
  const split = useCallback(() => {
    const res = splitAt(clipsRef.current, player.time);
    if (!res) return showToast('Posicione o cursor no meio de um clipe para dividir.');
    commit(res.clips);
    setSelectedId(res.newId);
  }, [commit, player.time, showToast]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    const list = clipsRef.current;
    const idx = list.findIndex((c) => c.id === selectedId);
    if (idx < 0) return;
    const next = list.filter((c) => c.id !== selectedId);
    commit(next);
    setSelectedId(next[Math.min(idx, next.length - 1)]?.id || null);
  }, [commit, selectedId]);

  const updateClip = useCallback((id, patch, record = true) => {
    const next = clipsRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c));
    record ? commit(next) : setClipsRaw(next);
  }, [commit]);

  const reorder = useCallback((from, to) => {
    if (to > from) to -= 1;
    if (to === from) return;
    const next = [...clipsRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
    setSelectedId(moved.id);
  }, [commit]);

  // ---------- Atalhos de teclado ----------
  const keys = useRef({});
  keys.current = { player, split, removeSelected, undo, redo };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, select, textarea') || exporting) return;
      const k = keys.current;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { e.preventDefault(); k.player.toggle(); }
      else if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); k.undo(); }
      else if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); k.redo(); }
      else if (!ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); k.split(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); k.removeSelected(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        k.player.pause();
        k.player.seek(k.player.time + (e.key === 'ArrowLeft' ? -step : step));
      } else if (e.key === 'Home') { k.player.seek(0); }
      else if (e.key === 'End') { k.player.seek(Infinity); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exporting]);

  // ---------- Arrastar arquivos para a janela ----------
  const onWindowDragOver = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onWindowDrop = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(false);
    const paths = [...e.dataTransfer.files].map((f) => window.klipo.pathForFile(f)).filter(Boolean);
    importPaths(paths);
  };

  if (!hasBridge) {
    return (
      <div className="no-bridge">
        <h1>Klipo</h1>
        <p>Esta interface precisa rodar dentro do app. Use <code>npm run dev</code> para abrir o Klipo.</p>
      </div>
    );
  }

  const h = history.current;

  return (
    <div
      className="app"
      onDragOver={onWindowDragOver}
      onDragLeave={(e) => { if (e.target === e.currentTarget || !e.relatedTarget) setDragOver(false); }}
      onDrop={onWindowDrop}
    >
      <header className="topbar">
        <div className="brand">
          <div className="logo"><Icon.Film width={16} height={16} /></div>
          <span>Klipo</span>
          <em>beta</em>
        </div>

        <div className="topbar-center">
          <div className="segmented compact" role="group" aria-label="Formato">
            {Object.entries(ASPECTS).map(([k, a]) => (
              <button key={k} className={aspect === k ? 'active' : ''} onClick={() => setAspect(k)} title={a.hint}>
                {a.label}
              </button>
            ))}
          </div>
          <select className="select" value={fit} onChange={(e) => setFit(e.target.value)} title="Como o vídeo ocupa o quadro">
            {Object.entries(FITS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>

        <div className="topbar-right">
          <button className="btn ghost ai-soon" disabled title="Chega no módulo 3">
            <Icon.Sparkles width={15} height={15} /> Corte com IA <small>em breve</small>
          </button>
          <button className="btn primary" disabled={!clips.length} onClick={() => { player.pause(); setExporting(true); }}>
            <Icon.Export width={16} height={16} /> Exportar
          </button>
        </div>
      </header>

      <main className="workspace">
        <MediaBin media={media} busy={busy} onImport={openImport} onAdd={addFromBin} />
        <Preview
          player={player}
          aspect={aspect}
          fit={fit}
          currentClip={currentClip}
          empty={!clips.length}
          onImport={openImport}
        />
        <Inspector
          clip={selectedClip}
          segment={selectedSegment}
          time={player.time}
          onSetIn={(t) => updateClip(selectedId, { inPoint: t })}
          onSetOut={(t) => updateClip(selectedId, { outPoint: t })}
          onSplit={split}
          onDelete={removeSelected}
          onReset={() => updateClip(selectedId, { inPoint: 0, outPoint: selectedClip.duration })}
        />
      </main>

      <section className="editor-bottom">
        <div className="toolbar">
          <div className="toolbar-group">
            <button className="icon-btn" onClick={undo} disabled={!h.past.length} title="Desfazer (Ctrl+Z)"><Icon.Undo /></button>
            <button className="icon-btn" onClick={redo} disabled={!h.future.length} title="Refazer (Ctrl+Y)"><Icon.Redo /></button>
            <span className="divider" />
            <button className="icon-btn" onClick={split} disabled={!clips.length} title="Dividir no cursor (S)"><Icon.Split /></button>
            <button className="icon-btn" onClick={removeSelected} disabled={!selectedId} title="Excluir clipe (Delete)"><Icon.Trash /></button>
          </div>

          <div className="toolbar-group center">
            <button className="play-btn" onClick={player.toggle} disabled={!clips.length} title="Play / pausa (Espaço)">
              {player.playing ? <Icon.Pause /> : <Icon.Play />}
            </button>
            <span className="timecode">
              <strong>{formatTime(player.time)}</strong> / {formatTime(total)}
            </span>
          </div>

          <div className="toolbar-group right">
            <span className="zoom-label">Zoom</span>
            <input
              type="range"
              min={4}
              max={400}
              step={1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        <Timeline
          segments={segments}
          total={total}
          time={player.time}
          zoom={zoom}
          setZoom={setZoom}
          playing={player.playing}
          selectedId={selectedId}
          onSeek={player.seek}
          onSelect={setSelectedId}
          onTrimStart={snapshot}
          onTrim={(id, patch) => updateClip(id, patch, false)}
          onReorder={reorder}
        />
      </section>

      {dragOver && <div className="drop-overlay"><div>Solte para importar</div></div>}
      {toast && <div className="toast">{toast}</div>}
      {exporting && (
        <ExportDialog clips={clips} total={total} aspect={aspect} fit={fit} onClose={() => setExporting(false)} />
      )}
    </div>
  );
}


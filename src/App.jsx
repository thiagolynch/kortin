import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Preview from './components/Preview';
import Timeline from './components/Timeline';
import MediaBin from './components/MediaBin';
import Inspector from './components/Inspector';
import ExportDialog from './components/ExportDialog';
import { Icon, Logo } from './components/Icons';
import { usePlayer } from './lib/usePlayer';
import {
  ASPECTS, FITS, baseName, buildSegments, cleanError, formatTime, locate, mediaToClip,
  restoreClips, serializeProject, splitAt, totalOf, uid,
} from './lib/timeline';

const HISTORY_LIMIT = 100;
const AUTOSAVE_DELAY = 1500;
const hasBridge = typeof window !== 'undefined' && !!window.kortin;
const isProjectFile = (p) => /\.kortin$/i.test(p);

function formatWhen(ms) {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hour = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `hoje às ${hour}` : `${d.toLocaleDateString('pt-BR')} às ${hour}`;
}

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
  const [projectPath, setProjectPath] = useState(null);
  const [savedJson, setSavedJson] = useState(() =>
    JSON.stringify(serializeProject({ clips: [], aspect: '9:16', fit: 'blur' }))
  );
  const [recovery, setRecovery] = useState(null);

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

  const resetHistory = useCallback(() => {
    history.current = { past: [], future: [] };
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

  const toastTimer = useRef(0);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  }, []);

  // ---------- Estado do projeto (salvo / não salvo) ----------
  const projectData = useMemo(() => serializeProject({ clips, aspect, fit }), [clips, aspect, fit]);
  const projectJson = useMemo(() => JSON.stringify(projectData), [projectData]);
  const dirty = projectJson !== savedJson;
  const projectName = projectPath ? baseName(projectPath) : 'Sem título';

  useEffect(() => {
    if (!hasBridge) return;
    window.kortin.setDirty(dirty, `${dirty ? '• ' : ''}${projectName} — Kortin`);
  }, [dirty, projectName]);

  // Recuperação automática: guarda o projeto enquanto você edita
  useEffect(() => {
    if (!hasBridge) return;
    if (!dirty || !clips.length) return;
    const t = setTimeout(() => {
      window.kortin.autosaveWrite({ ...projectData, _path: projectPath });
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(t);
  }, [projectJson, dirty, clips.length, projectData, projectPath]);

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm('Você tem alterações não salvas neste projeto. Deseja descartá-las?');
  }, [dirty]);

  // ---------- Importação ----------
  const probeAll = useCallback(async (paths) => {
    const ok = [];
    const errors = [];
    for (let i = 0; i < paths.length; i++) {
      setBusy(`Lendo ${i + 1} de ${paths.length}…`);
      try {
        ok.push(await window.kortin.probe(paths[i]));
      } catch (err) {
        errors.push({ path: paths[i], message: cleanError(err) });
      }
    }
    setBusy('');
    return { ok, errors };
  }, []);

  const importPaths = useCallback(async (paths) => {
    if (!paths?.length) return;
    const { ok, errors } = await probeAll(paths);
    if (ok.length) {
      setMedia((m) => [...m, ...ok.filter((a) => !m.some((x) => x.path === a.path))]);
      const newClips = ok.map(mediaToClip);
      commit([...clipsRef.current, ...newClips]);
      setSelectedId(newClips[newClips.length - 1].id);
    }
    if (errors.length) {
      showToast(`Não foi possível importar: ${errors.map((e) => `${baseName(e.path)} (${e.message})`).join(' · ')}`);
    }
  }, [commit, probeAll, showToast]);

  const openImport = useCallback(async () => {
    importPaths(await window.kortin.openVideos());
  }, [importPaths]);

  const addFromBin = useCallback((m) => {
    const clip = mediaToClip(m);
    commit([...clipsRef.current, clip]);
    setSelectedId(clip.id);
  }, [commit]);

  // ---------- Projetos ----------
  const loadProject = useCallback(async (data, path, { recovered = false } = {}) => {
    player.pause();
    const paths = [...new Set(data.clips.map((c) => c.path))];
    const { ok, errors } = await probeAll(paths);
    const infoByPath = Object.fromEntries(ok.map((i) => [i.path, i]));
    const restored = restoreClips(data.clips, infoByPath);
    const nextAspect = ASPECTS[data.aspect] ? data.aspect : '9:16';
    const nextFit = FITS[data.fit] ? data.fit : 'blur';

    setMedia(ok);
    setClipsRaw(restored);
    setAspect(nextAspect);
    setFit(nextFit);
    setSelectedId(restored[0]?.id || null);
    resetHistory();
    player.seek(0);

    if (recovered) {
      setProjectPath(data._path || null);
      setSavedJson('');
    } else {
      setProjectPath(path);
      setSavedJson(JSON.stringify(serializeProject({ clips: restored, aspect: nextAspect, fit: nextFit })));
    }

    if (errors.length) {
      showToast(
        `${errors.length} vídeo(s) não foram encontrados e ficaram de fora: ${errors.map((e) => baseName(e.path)).join(', ')}`
      );
    } else {
      showToast(recovered ? 'Projeto recuperado.' : `Projeto "${baseName(path)}" aberto.`);
    }
  }, [player, probeAll, resetHistory, showToast]);

  const openProject = useCallback(async (filePath) => {
    if (!confirmDiscard()) return;
    try {
      const res = await window.kortin.openProject(filePath);
      if (res) {
        setRecovery(null);
        await loadProject(res.data, res.path);
      }
    } catch (err) {
      showToast(`Não foi possível abrir o projeto: ${cleanError(err)}`);
    }
  }, [confirmDiscard, loadProject, showToast]);

  const saveProject = useCallback(async (saveAs = false) => {
    try {
      const file = await window.kortin.saveProject(projectData, projectPath, saveAs);
      if (!file) return;
      setProjectPath(file);
      setSavedJson(projectJson);
      window.kortin.autosaveClear();
      showToast(`Projeto salvo em ${baseName(file)}.kortin`);
    } catch (err) {
      showToast(`Não foi possível salvar: ${cleanError(err)}`);
    }
  }, [projectData, projectJson, projectPath, showToast]);

  const newProject = useCallback(() => {
    if (!confirmDiscard()) return;
    player.pause();
    setMedia([]);
    setClipsRaw([]);
    setSelectedId(null);
    setProjectPath(null);
    resetHistory();
    player.seek(0);
    setSavedJson(JSON.stringify(serializeProject({ clips: [], aspect, fit })));
    window.kortin.autosaveClear();
  }, [aspect, confirmDiscard, fit, player, resetHistory]);

  const openPaths = useCallback((paths) => {
    const project = paths.find(isProjectFile);
    if (project) return openProject(project);
    return importPaths(paths);
  }, [importPaths, openProject]);

  // Ao abrir: arquivos passados pelo Windows ou projeto para recuperar
  const started = useRef(false);
  useEffect(() => {
    if (!hasBridge || started.current) return;
    started.current = true;
    (async () => {
      const files = await window.kortin.pendingFiles();
      if (files.length) return openPaths(files);
      const saved = await window.kortin.autosaveRead();
      if (saved?.data?.clips?.length) setRecovery(saved);
    })();
  }, [openPaths]);

  useEffect(() => (hasBridge ? window.kortin.onOpenFiles(openPaths) : undefined), [openPaths]);

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

  const duplicateSelected = useCallback(() => {
    const list = clipsRef.current;
    const idx = list.findIndex((c) => c.id === selectedId);
    if (idx < 0) return;
    const copy = { ...list[idx], id: uid() };
    const next = [...list];
    next.splice(idx + 1, 0, copy);
    commit(next);
    setSelectedId(copy.id);
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
  keys.current = { player, split, removeSelected, duplicateSelected, undo, redo, saveProject, openProject, newProject };
  useEffect(() => {
    const onKey = (e) => {
      if (exporting) return;
      const k = keys.current;
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // atalhos de arquivo funcionam em qualquer lugar
      if (ctrl && key === 's') { e.preventDefault(); return k.saveProject(e.shiftKey); }
      if (ctrl && key === 'o') { e.preventDefault(); return k.openProject(); }
      if (ctrl && key === 'n') { e.preventDefault(); return k.newProject(); }

      if (e.target.closest?.('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); k.player.toggle(); }
      else if (ctrl && key === 'z' && !e.shiftKey) { e.preventDefault(); k.undo(); }
      else if (ctrl && (key === 'y' || (e.shiftKey && key === 'z'))) { e.preventDefault(); k.redo(); }
      else if (ctrl && key === 'd') { e.preventDefault(); k.duplicateSelected(); }
      else if (!ctrl && key === 's') { e.preventDefault(); k.split(); }
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
    const paths = [...e.dataTransfer.files].map((f) => window.kortin.pathForFile(f)).filter(Boolean);
    openPaths(paths);
  };

  if (!hasBridge) {
    return (
      <div className="no-bridge">
        <h1>Kortin</h1>
        <p>Esta interface precisa rodar dentro do app. Use <code>npm run dev</code> para abrir o Kortin.</p>
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
        <div className="topbar-left">
          <div className="brand">
            <Logo size={28} />
            <span>Kortin</span>
          </div>
          <span className="divider" />
          <div className="project-name" title={projectPath || 'Projeto ainda não salvo'}>
            {projectName}
            {dirty && <span className="dirty-dot" title="Alterações não salvas" />}
          </div>
          <div className="file-actions">
            <button className="icon-btn" onClick={newProject} title="Novo projeto (Ctrl+N)"><Icon.File /></button>
            <button className="icon-btn" onClick={() => openProject()} title="Abrir projeto (Ctrl+O)"><Icon.Open /></button>
            <button className="icon-btn" onClick={() => saveProject(false)} title="Salvar projeto (Ctrl+S)"><Icon.Save /></button>
          </div>
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
        <div className="stage">
          {recovery && (
            <div className="recovery">
              <div>
                <strong>Encontramos um projeto não salvo</strong>
                <span>
                  {recovery.data._path ? `"${baseName(recovery.data._path)}", ` : ''}
                  {recovery.data.clips.length} clipe(s), editado {formatWhen(recovery.savedAt)}
                </span>
              </div>
              <button className="btn ghost sm" onClick={() => { setRecovery(null); window.kortin.autosaveClear(); }}>
                Descartar
              </button>
              <button className="btn primary sm" onClick={() => { const r = recovery; setRecovery(null); loadProject(r.data, null, { recovered: true }); }}>
                Recuperar
              </button>
            </div>
          )}
          <Preview
            player={player}
            aspect={aspect}
            fit={fit}
            currentClip={currentClip}
            empty={!clips.length}
            onImport={openImport}
            onOpenProject={() => openProject()}
          />
        </div>
        <Inspector
          clip={selectedClip}
          segment={selectedSegment}
          time={player.time}
          onSetIn={(t) => updateClip(selectedId, { inPoint: t })}
          onSetOut={(t) => updateClip(selectedId, { outPoint: t })}
          onSplit={split}
          onDuplicate={duplicateSelected}
          onDelete={removeSelected}
          onReset={() => updateClip(selectedId, { inPoint: 0, outPoint: selectedClip.duration })}
          onVolumeStart={snapshot}
          onVolume={(v) => updateClip(selectedId, { volume: v }, false)}
        />
      </main>

      <section className="editor-bottom">
        <div className="toolbar">
          <div className="toolbar-group">
            <button className="icon-btn" onClick={undo} disabled={!h.past.length} title="Desfazer (Ctrl+Z)"><Icon.Undo /></button>
            <button className="icon-btn" onClick={redo} disabled={!h.future.length} title="Refazer (Ctrl+Y)"><Icon.Redo /></button>
            <span className="divider" />
            <button className="icon-btn" onClick={split} disabled={!clips.length} title="Dividir no cursor (S)"><Icon.Split /></button>
            <button className="icon-btn" onClick={duplicateSelected} disabled={!selectedId} title="Duplicar clipe (Ctrl+D)"><Icon.Copy /></button>
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
        <ExportDialog
          clips={clips}
          total={total}
          aspect={aspect}
          fit={fit}
          projectName={projectPath ? projectName : null}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  );
}

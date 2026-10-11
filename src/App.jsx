// Composição da tela. Regras desta camada:
//  - estado do projeto só muda por docApi (commit / begin-preview-end), então tudo tem desfazer
//  - o cursor (playhead) não passa por aqui: quem precisa dele assina o store
//  - efeitos colaterais (IPC, autosave, fila) ficam nos hooks
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Preview from './components/Preview';
import Timeline from './components/Timeline';
import MediaBin from './components/MediaBin';
import Inspector from './components/Inspector';
import ExportDialog from './components/ExportDialog';
import ExportQueue from './components/ExportQueue';
import Welcome from './components/Welcome';
import CaptionsPanel from './components/CaptionsPanel';
import RecoveryBanner from './components/RecoveryBanner';
import RelinkDialog from './components/RelinkDialog';
import { PlayButton, Timecode } from './components/Transport';
import { Icon, Logo } from './components/Icons';
import { MAX_CHARS, deriveCues, editCue } from './lib/captions';
import { usePlayer } from './lib/usePlayer';
import { ASPECTS, FITS, baseName, buildSegments, mediaToClip, splitAt, totalOf, uid } from './lib/timeline';
import { patchClip, useDocument } from './state/document';
import { useMediaLibrary } from './hooks/useMediaLibrary';
import { useProject } from './hooks/useProject';
import { useExportQueue } from './hooks/useExportQueue';
import { useShortcuts } from './hooks/useShortcuts';

const hasBridge = typeof window !== 'undefined' && !!window.kortin;
const isProjectFile = (p) => /\.kortin$/i.test(p);
const WELCOME_KEY = 'kortin.boasVindas';

function readFlag(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeFlag(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sem armazenamento: tudo bem */ }
}

function useToast() {
  const [toast, setToast] = useState('');
  const timer = useRef(0);
  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, notify];
}

export default function App() {
  if (!hasBridge) {
    return (
      <div className="no-bridge">
        <h1>Kortin</h1>
        <p>Esta interface precisa rodar dentro do app. Use <code>npm run dev</code> para abrir o Kortin.</p>
      </div>
    );
  }
  return <Editor />;
}

function Editor() {
  const docApi = useDocument();
  const { doc, ops } = docApi;
  const { clips, aspect, fit, captions: captionSettings, transcripts } = doc;
  const docRef = useRef(doc);
  docRef.current = doc;

  const [selectedId, setSelectedId] = useState(null);
  const [zoom, setZoom] = useState(40); // pixels por segundo
  const [snap, setSnap] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [welcome, setWelcome] = useState(() => !readFlag(WELCOME_KEY));
  const [update, setUpdate] = useState(null);
  const [version, setVersion] = useState('');
  const [leftTab, setLeftTab] = useState('media');
  const [toast, notify] = useToast();

  // ---------- Derivados ----------
  const segments = useMemo(() => buildSegments(clips), [clips]);
  const total = totalOf(segments);
  const player = usePlayer(segments);
  const library = useMediaLibrary();
  const exportQueue = useExportQueue(notify);
  const cues = useMemo(
    () => deriveCues(segments, transcripts, { maxChars: MAX_CHARS[aspect] || 28 }),
    [segments, transcripts, aspect]
  );
  const selectedClip = useMemo(() => clips.find((c) => c.id === selectedId) || null, [clips, selectedId]);
  const selectedSegment = useMemo(() => segments.find((s) => s.clip.id === selectedId) || null, [segments, selectedId]);

  const onLoaded = useCallback((next) => setSelectedId(next.clips[0]?.id || null), []);
  // "Arquivos não encontrados": o hook espera a resposta do diálogo (mapa de caminhos ou null)
  const [relink, setRelink] = useState(null);
  const askRelink = useCallback((missing) => new Promise((resolve) => setRelink({ missing, resolve })), []);
  const project = useProject({ docApi, library, player, notify, onLoaded, askRelink });

  // ---------- Importação ----------
  const importPaths = useCallback(async (paths) => {
    if (!paths?.length) return;
    const { ok, errors } = await library.probeAll(paths);
    if (ok.length) {
      library.addMedia(ok);
      const newClips = ok.map(mediaToClip);
      ops.commit((d) => ({ ...d, clips: [...d.clips, ...newClips] }));
      setSelectedId(newClips[newClips.length - 1].id);
    }
    if (errors.length) {
      notify(`Não foi possível importar: ${errors.map((e) => `${baseName(e.path)} (${e.message})`).join(' · ')}`);
    }
  }, [ops, library, notify]);

  const openImport = useCallback(async () => importPaths(await window.kortin.openVideos()), [importPaths]);

  const addFromBin = useCallback((m) => {
    const clip = mediaToClip(m);
    ops.commit((d) => ({ ...d, clips: [...d.clips, clip] }));
    setSelectedId(clip.id);
  }, [ops]);

  const openPaths = useCallback((paths) => {
    const proj = paths.find(isProjectFile);
    return proj ? project.openProject(proj) : importPaths(paths);
  }, [importPaths, project]);

  // Ao abrir: arquivos passados pelo Windows, ou projeto para recuperar
  const openPathsRef = useRef(openPaths);
  openPathsRef.current = openPaths;
  const { setRecovery } = project;
  useEffect(() => {
    let alive = true;
    (async () => {
      const files = await window.kortin.pendingFiles();
      if (!alive) return;
      if (files.length) return openPathsRef.current(files);
      const saved = await window.kortin.autosaveRead();
      if (alive && saved?.data?.clips?.length) setRecovery(saved);
      return undefined;
    })().catch(() => {});
    const off = window.kortin.onOpenFiles((p) => openPathsRef.current(p));
    return () => { alive = false; off(); };
  }, [setRecovery]);

  useEffect(() => {
    window.kortin.version().then(setVersion).catch(() => {});
    return window.kortin.onUpdateReady(setUpdate);
  }, []);

  const finishWelcome = useCallback((choice, importNow) => {
    writeFlag(WELCOME_KEY, '1');
    setWelcome(false);
    // projeto vazio: trocar o formato não deve marcar "não salvo"
    if (!docRef.current.clips.length) project.newProject({ aspect: choice, skipConfirm: true });
    else ops.set('aspect', choice);
    if (importNow) openImport();
  }, [ops, openImport, project]);

  // ---------- Edição ----------
  const split = useCallback(() => {
    const res = splitAt(docRef.current.clips, player.getTime());
    if (!res) return notify('Posicione o cursor no meio de um clipe para dividir.');
    ops.commit((d) => ({ ...d, clips: res.clips }));
    setSelectedId(res.newId);
    return undefined;
  }, [ops, notify, player]);

  const removeSelected = useCallback(() => {
    const list = docRef.current.clips;
    const idx = list.findIndex((c) => c.id === selectedId);
    if (idx < 0) return;
    const next = list.filter((c) => c.id !== selectedId);
    ops.commit((d) => ({ ...d, clips: next }));
    setSelectedId(next[Math.min(idx, next.length - 1)]?.id || null);
  }, [ops, selectedId]);

  const duplicateSelected = useCallback(() => {
    const list = docRef.current.clips;
    const idx = list.findIndex((c) => c.id === selectedId);
    if (idx < 0) return;
    const copy = { ...list[idx], id: uid() };
    ops.commit((d) => {
      const next = [...d.clips];
      next.splice(idx + 1, 0, copy);
      return { ...d, clips: next };
    });
    setSelectedId(copy.id);
  }, [ops, selectedId]);

  const reorder = useCallback((from, to) => {
    const target = to > from ? to - 1 : to;
    if (target === from) return;
    const moved = docRef.current.clips[from];
    ops.commit((d) => {
      const next = [...d.clips];
      next.splice(from, 1);
      next.splice(target, 0, moved);
      return { ...d, clips: next };
    });
    setSelectedId(moved.id);
  }, [ops]);

  // Inspector: mudanças discretas viram 1 passo; sliders usam transação (1 passo no fim)
  const clipEdit = useMemo(() => ({
    commit: (patch) => selectedId && ops.commit(patchClip(selectedId, patch)),
    preview: (patch) => {
      if (!selectedId) return;
      ops.begin();
      ops.preview(patchClip(selectedId, patch));
    },
    end: ops.end,
  }), [ops, selectedId]);

  const resetClip = useCallback(() => {
    if (!selectedClip) return;
    clipEdit.commit({
      inPoint: 0, outPoint: selectedClip.duration, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, denoise: false,
    });
  }, [clipEdit, selectedClip]);

  // Timeline: arrastar alça = transação
  const trim = useMemo(() => ({
    start: ops.begin,
    move: (id, patch) => ops.preview(patchClip(id, patch)),
    end: ops.end,
  }), [ops]);

  // ---------- Legendas ----------
  const captionsApi = useMemo(() => ({
    settings: (patch) => ops.commit((d) => ({ ...d, captions: { ...d.captions, ...patch } })),
    previewSettings: (patch) => {
      ops.begin();
      ops.preview((d) => ({ ...d, captions: { ...d.captions, ...patch } }));
    },
    end: ops.end,
    addTranscripts: (results) => ops.commit((d) => ({
      ...d,
      transcripts: { ...d.transcripts, ...results },
      captions: { ...d.captions, enabled: true },
    })),
    editCue: (cue, text) => ops.commit((d) => ({ ...d, transcripts: editCue(d.transcripts, cue, text) })),
  }), [ops]);

  const applyCleanup = useCallback((plan, msg) => {
    ops.commit((d) => ({ ...d, clips: plan.clips }));
    notify(`Fala limpa: ${msg}. Ctrl+Z desfaz.`);
  }, [ops, notify]);

  const seekPaused = useCallback((t) => { player.pause(); player.seek(t); }, [player]);

  // ---------- Atalhos ----------
  useShortcuts({
    save: project.saveProject,
    open: () => project.openProject(),
    newProject: () => project.newProject(),
    togglePlay: player.toggle,
    undo: ops.undo,
    redo: ops.redo,
    duplicate: duplicateSelected,
    toggleSnap: () => setSnap((v) => !v),
    split,
    remove: removeSelected,
    step: (delta) => { player.pause(); player.seek(player.getTime() + delta); },
    seek: player.seek,
  }, !exporting && !welcome && !relink);

  // ---------- Arrastar arquivos para a janela ----------
  const onWindowDragOver = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onWindowDrop = async (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(false);
    const dropped = [...e.dataTransfer.files].map((f) => window.kortin.pathForFile(f)).filter(Boolean);
    // o processo principal só libera arquivos locais de vídeo/projeto que existem
    const accepted = await window.kortin.authorizeFiles(dropped);
    if (accepted.length < dropped.length) notify(`${dropped.length - accepted.length} arquivo(s) ignorado(s): formato não suportado ou pasta de rede.`);
    if (accepted.length) openPaths(accepted);
  };

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
          <div className="project-name" title={project.projectPath || 'Projeto ainda não salvo'}>
            {project.projectName}
            {project.dirty && <span className="dirty-dot" title="Alterações não salvas" />}
          </div>
          <div className="file-actions">
            <button className="icon-btn" onClick={() => project.newProject()} title="Novo projeto (Ctrl+N)"><Icon.File /></button>
            <button className="icon-btn" onClick={() => project.openProject()} title="Abrir projeto (Ctrl+O)"><Icon.Open /></button>
            <button className="icon-btn" onClick={() => project.saveProject(false)} title="Salvar projeto (Ctrl+S)"><Icon.Save /></button>
          </div>
        </div>

        <div className="topbar-center">
          <div className="segmented compact" role="group" aria-label="Formato">
            {Object.entries(ASPECTS).map(([k, a]) => (
              <button key={k} className={aspect === k ? 'active' : ''} onClick={() => ops.set('aspect', k)} title={a.hint}>
                {a.label}
              </button>
            ))}
          </div>
          <select className="select" value={fit} onChange={(e) => ops.set('fit', e.target.value)} title="Como o vídeo ocupa o quadro">
            {Object.entries(FITS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>

        <div className="topbar-right">
          <ExportQueue jobs={exportQueue.jobs} onCancel={exportQueue.cancel} onShow={(p) => window.kortin.showInFolder(p)} onClear={exportQueue.clear} />
          <button className="icon-btn" onClick={() => setWelcome(true)} title="Boas-vindas e atalhos"><Icon.Help /></button>
          <button className="btn ghost ai-soon" disabled title="Chega no módulo 3">
            <Icon.Sparkles width={15} height={15} /> Corte com IA <small>em breve</small>
          </button>
          <button className="btn primary" disabled={!clips.length} onClick={() => { player.pause(); setExporting(true); }}>
            <Icon.Export width={16} height={16} /> Exportar
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="panel bin">
          <div className="panel-tabs" role="tablist">
            <button role="tab" aria-selected={leftTab === 'media'} className={leftTab === 'media' ? 'active' : ''} onClick={() => setLeftTab('media')}>
              <Icon.Film width={14} height={14} /> Mídia
            </button>
            <button role="tab" aria-selected={leftTab === 'captions'} className={leftTab === 'captions' ? 'active' : ''} onClick={() => setLeftTab('captions')}>
              <Icon.Captions width={14} height={14} /> Legendas{cues.length ? <span className="tab-badge">{cues.length}</span> : null}
            </button>
          </div>
          {leftTab === 'media' ? (
            <MediaBin media={library.media} busy={library.busy} onImport={openImport} onAdd={addFromBin} />
          ) : (
            <CaptionsPanel
              clips={clips}
              cues={cues}
              transcripts={transcripts}
              settings={captionSettings}
              store={player.store}
              api={captionsApi}
              onSeek={seekPaused}
              onApplyCleanup={applyCleanup}
              notify={notify}
            />
          )}
        </aside>
        <div className="stage">
          <RecoveryBanner recovery={project.recovery} onRecover={project.recover} onDiscard={project.discardRecovery} />
          <Preview
            player={player}
            segments={segments}
            aspect={aspect}
            fit={fit}
            empty={!clips.length}
            onImport={openImport}
            onOpenProject={() => project.openProject()}
            cues={cues}
            captionSettings={captionSettings}
          />
        </div>
        <Inspector
          clip={selectedClip}
          segment={selectedSegment}
          store={player.store}
          edit={clipEdit}
          onSplit={split}
          onDuplicate={duplicateSelected}
          onDelete={removeSelected}
          onReset={resetClip}
        />
      </main>

      <section className="editor-bottom">
        <div className="toolbar">
          <div className="toolbar-group">
            <button className="icon-btn" onClick={ops.undo} disabled={!docApi.canUndo} title="Desfazer (Ctrl+Z)"><Icon.Undo /></button>
            <button className="icon-btn" onClick={ops.redo} disabled={!docApi.canRedo} title="Refazer (Ctrl+Y)"><Icon.Redo /></button>
            <span className="divider" />
            <button className="icon-btn" onClick={split} disabled={!clips.length} title="Dividir no cursor (S)"><Icon.Split /></button>
            <button className="icon-btn" onClick={duplicateSelected} disabled={!selectedClip} title="Duplicar clipe (Ctrl+D)"><Icon.Copy /></button>
            <button className="icon-btn" onClick={removeSelected} disabled={!selectedClip} title="Excluir clipe (Delete)"><Icon.Trash /></button>
            <span className="divider" />
            <button
              className={`icon-btn toggle${snap ? ' on' : ''}`}
              onClick={() => setSnap((v) => !v)}
              aria-pressed={snap}
              title={`Ímã ${snap ? 'ligado' : 'desligado'} (N): cortes e cursor grudam nas emendas`}
            >
              <Icon.Magnet />
            </button>
          </div>

          <div className="toolbar-group center">
            <PlayButton store={player.store} onToggle={player.toggle} disabled={!clips.length} />
            <Timecode store={player.store} total={total} />
          </div>

          <div className="toolbar-group right">
            <span className="zoom-label">Zoom</span>
            <input type="range" min={4} max={400} step={1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </div>
        </div>

        <Timeline
          segments={segments}
          total={total}
          store={player.store}
          zoom={zoom}
          setZoom={setZoom}
          selectedId={selectedId}
          snap={snap}
          peaksByPath={library.peaksByPath}
          cues={captionSettings.enabled ? cues : []}
          onSeek={player.seek}
          onSelect={setSelectedId}
          trim={trim}
          onReorder={reorder}
        />
      </section>

      {dragOver && <div className="drop-overlay"><div>Solte para importar</div></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
      {exporting && (
        <ExportDialog
          clips={clips}
          total={total}
          aspect={aspect}
          fit={fit}
          projectName={project.projectPath ? project.projectName : null}
          segments={segments}
          transcripts={transcripts}
          captionSettings={captionSettings}
          onQueue={exportQueue.enqueue}
          onClose={() => setExporting(false)}
        />
      )}
      {relink && (
        <RelinkDialog
          missing={relink.missing}
          onDone={(map) => { relink.resolve(map); setRelink(null); }}
          onCancel={() => { relink.resolve(null); setRelink(null); }}
        />
      )}
      {welcome && <Welcome aspect={aspect} version={version} onDone={finishWelcome} />}
      {update && (
        <div className="update-banner">
          <span>A versão <strong>{update.version}</strong> do Kortin está pronta.</span>
          <button className="btn ghost sm" onClick={() => setUpdate(null)}>Depois</button>
          <button className="btn primary sm" onClick={() => window.kortin.installUpdate()}>Reiniciar e atualizar</button>
        </div>
      )}
    </div>
  );
}

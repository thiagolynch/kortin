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
import MusicCard from './components/MusicCard';
import TitlesPanel from './components/TitlesPanel';
import HighlightsPanel from './components/HighlightsPanel';
import TitleOverlay from './components/TitleOverlay';
import { ColorFilterDefs } from './components/ColorFilters';
import { newTitle } from './lib/titles';
import { PlayButton, Timecode } from './components/Transport';
import { Icon, Logo } from './components/Icons';
import { CUT_TYPES, FILLERS, MAX_CHARS, applyCuts, deriveCues, editCue, suggestCuts } from './lib/captions';
import { usePlayer } from './lib/usePlayer';
import { useMusic } from './hooks/useMusic';
import {
  ASPECTS, FITS, MUSIC_DEFAULTS, baseName, buildSegments, cleanError, mediaToClip, musicFields, smoothAllJoins, splitAt, totalOf, uid,
} from './lib/timeline';
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

const TOAST_LEAVE_MS = 260; // = duração da animação toast-out no CSS

/** O aviso some suavindo (não desmonta de uma vez): mostra, espera, marca "saindo" e só então some. */
function useToast() {
  const [toast, setToast] = useState({ text: '', leaving: false });
  const hideTimer = useRef(0);
  const leaveTimer = useRef(0);
  const notify = useCallback((msg) => {
    clearTimeout(hideTimer.current);
    clearTimeout(leaveTimer.current);
    setToast({ text: msg, leaving: false });
    hideTimer.current = setTimeout(() => {
      setToast((t) => ({ ...t, leaving: true }));
      leaveTimer.current = setTimeout(() => setToast({ text: '', leaving: false }), TOAST_LEAVE_MS);
    }, 4000);
  }, []);
  useEffect(() => () => { clearTimeout(hideTimer.current); clearTimeout(leaveTimer.current); }, []);
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
  const { clips, aspect, fit, captions: captionSettings, transcripts, music, titles } = doc;
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
  useMusic(music, player.store, segments, total);
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
      filter: 'natural', videoFadeIn: 0, videoFadeOut: 0,
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

  // ---------- Cortes sugeridos (Módulo 3) ----------
  const [cutOptions, setCutOptions] = useState(() => ({
    minPause: 0.7,
    fillers: FILLERS.filter((f) => f.on).map((f) => f.word),
    restarts: true,
  }));
  const [cutDecisions, setCutDecisions] = useState({}); // id → true/false (o que a pessoa decidiu)
  const [cutFocus, setCutFocus] = useState(null);
  const suggestions = useMemo(() => (Object.keys(transcripts).length
    ? suggestCuts(clips, transcripts, {
      minPause: cutOptions.minPause,
      fillers: FILLERS.filter((f) => cutOptions.fillers.includes(f.word)),
      restarts: cutOptions.restarts,
    })
    : []), [clips, transcripts, cutOptions]);
  const isCutOn = useCallback((s) => cutDecisions[s.id] ?? CUT_TYPES[s.type].defaultOn, [cutDecisions]);

  const review = useMemo(() => ({
    suggestions,
    isOn: isCutOn,
    options: cutOptions,
    focusId: cutFocus,
    onOptions: (patch) => setCutOptions((o) => ({ ...o, ...patch })),
    onDecide: (id, on) => setCutDecisions((d) => ({ ...d, [id]: on })),
    onDecideAll: (on) => setCutDecisions(Object.fromEntries(suggestions.map((x) => [x.id, on]))),
    onFocus: (id) => {
      setCutFocus(id);
      const sug = suggestions.find((x) => x.id === id);
      if (sug) { player.pause(); player.seek(sug.start); }
    },
    // ouve 1 s antes e 1 s depois do trecho, para decidir com contexto
    onListen: (sug) => { setCutFocus(sug.id); player.playRange(sug.start - 1, sug.end + 1); },
    onApply: () => {
      const accepted = suggestions.filter(isCutOn);
      const res = applyCuts(docRef.current.clips, accepted);
      if (!res.cuts) return;
      ops.commit((d) => ({ ...d, clips: res.clips }));
      setCutDecisions({});
      setCutFocus(null);
      notify(`${res.cuts} corte(s) aplicados, ${res.seconds.toFixed(1).replace('.', ',')} s a menos. Ctrl+Z desfaz.`);
    },
  }), [suggestions, isCutOn, cutOptions, cutFocus, player, ops, notify]);

  // ---------- Música de fundo ----------
  const [musicBusy, setMusicBusy] = useState(false);
  const setMusicFromPath = useCallback(async (p) => {
    if (!p) return;
    setMusicBusy(true);
    try {
      const info = await window.kortin.probeAudio(p);
      // trocar de música mantém o volume e as escolhas da anterior
      ops.commit((d) => ({
        ...d,
        music: { ...MUSIC_DEFAULTS, ...(d.music ? musicFields(d.music) : {}), path: info.path, name: info.name, duration: info.duration },
      }));
      notify(`Música de fundo: ${info.name}`);
    } catch (err) {
      notify(`Não foi possível usar esta música: ${cleanError(err)}`);
    } finally {
      setMusicBusy(false);
    }
  }, [ops, notify]);
  const musicApi = useMemo(() => ({
    onPick: async () => setMusicFromPath(await window.kortin.openMusic()),
    onRemove: () => ops.set('music', null),
    onChange: (patch) => ops.commit((d) => (d.music ? { ...d, music: { ...d.music, ...patch } } : d)),
    onPreview: (patch) => {
      ops.begin();
      ops.preview((d) => (d.music ? { ...d, music: { ...d.music, ...patch } } : d));
    },
    onEnd: ops.end,
  }), [ops, setMusicFromPath]);

  // ---------- Cor e transições (todos os clipes) ----------
  const onFilterAll = useCallback((f) => {
    ops.commit((d) => ({ ...d, clips: d.clips.map((c) => (c.filter === f ? c : { ...c, filter: f })) }));
    notify('Cor aplicada a todos os clipes. Ctrl+Z desfaz.');
  }, [ops, notify]);
  const onSmoothJoins = useCallback(() => {
    ops.commit((d) => ({ ...d, clips: smoothAllJoins(d.clips) }));
    notify('Transição suave em todas as emendas. Ctrl+Z desfaz.');
  }, [ops, notify]);

  // ---------- Títulos ----------
  const [selectedTitleId, setSelectedTitleId] = useState(null);
  const titlesApi = useMemo(() => {
    const patchTitle = (id, patch) => (d) => ({ ...d, titles: d.titles.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    return {
      patchTitle,
      commit: (id, patch) => ops.commit(patchTitle(id, patch)),
      preview: (id, patch) => { ops.begin(); ops.preview(patchTitle(id, patch)); },
      end: ops.end,
      remove: (id) => { ops.commit((d) => ({ ...d, titles: d.titles.filter((t) => t.id !== id) })); setSelectedTitleId(null); },
    };
  }, [ops]);
  const addTitle = useCallback(() => {
    const t = newTitle(player.getTime());
    ops.commit((d) => ({ ...d, titles: [...(d.titles || []), t] }));
    setSelectedTitleId(t.id);
    setLeftTab('textos');
  }, [ops, player]);
  const selectTitle = useCallback((id, seek = false) => {
    setSelectedTitleId(id);
    setLeftTab('textos');
    const t = docRef.current.titles.find((x) => x.id === id);
    if (seek && t) { player.pause(); player.seek(t.start + 0.05); }
  }, [player]);
  const titleDrag = useMemo(() => ({
    start: ops.begin,
    move: (id, start) => ops.preview(titlesApi.patchTitle(id, { start })),
    end: ops.end,
  }), [ops, titlesApi]);

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
    // áudio solto na janela vira a música de fundo; vídeos e projetos seguem o caminho normal
    const isAudio = (p) => /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|wma)$/i.test(p);
    const audio = accepted.find(isAudio);
    if (audio) setMusicFromPath(audio);
    const rest = accepted.filter((p) => !isAudio(p));
    if (rest.length) openPaths(rest);
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
          <button
            className="btn ghost"
            disabled={!clips.length}
            onClick={() => setLeftTab('captions')}
            title="Pausas, vícios e frases reiniciadas sugeridos pela transcrição: você revisa e aplica"
          >
            <Icon.Sparkles width={15} height={15} /> Cortes com IA
            {suggestions.length > 0 && <span className="tab-badge">{suggestions.length}</span>}
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
            <button role="tab" aria-selected={leftTab === 'textos'} className={leftTab === 'textos' ? 'active' : ''} onClick={() => setLeftTab('textos')}>
              <Icon.Edit width={14} height={14} /> Textos{titles.length ? <span className="tab-badge">{titles.length}</span> : null}
            </button>
            <button role="tab" aria-selected={leftTab === 'captions'} className={leftTab === 'captions' ? 'active' : ''} onClick={() => setLeftTab('captions')}>
              <Icon.Captions width={14} height={14} /> Legendas{cues.length ? <span className="tab-badge">{cues.length}</span> : null}
            </button>
            <button role="tab" aria-selected={leftTab === 'momentos'} className={leftTab === 'momentos' ? 'active' : ''} onClick={() => setLeftTab('momentos')}>
              <Icon.Sparkles width={14} height={14} /> Melhores momentos
            </button>
          </div>
          {leftTab === 'media' ? (
            <div className="media-tab">
              <MediaBin media={library.media} busy={library.busy} onImport={openImport} onAdd={addFromBin} />
              <MusicCard music={music} total={total} busy={musicBusy} {...musicApi} />
            </div>
          ) : leftTab === 'textos' ? (
            <TitlesPanel
              titles={titles}
              selectedId={selectedTitleId}
              onSelect={selectTitle}
              onAdd={addTitle}
              api={titlesApi}
              getTime={player.getTime}
            />
          ) : leftTab === 'momentos' ? (
            <HighlightsPanel
              clip={selectedClip}
              transcripts={transcripts}
              player={player}
              onExport={(job) => { exportQueue.enqueue([job]); notify(`"${job.label}" entrou na fila de exportação.`); }}
              notify={notify}
            />
          ) : (
            <CaptionsPanel
              clips={clips}
              cues={cues}
              transcripts={transcripts}
              settings={captionSettings}
              store={player.store}
              api={captionsApi}
              onSeek={seekPaused}
              review={review}
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
          >
            {(box) => (
              <TitleOverlay
                titles={titles}
                aspect={aspect}
                store={player.store}
                width={box.w}
                height={box.h}
                selectedId={selectedTitleId}
                onSelect={(id) => selectTitle(id)}
              />
            )}
          </Preview>
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
          onFilterAll={onFilterAll}
          onSmoothJoins={onSmoothJoins}
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
          cutMarks={leftTab === 'captions' ? suggestions : null}
          music={music}
          titles={titles}
          selectedTitleId={selectedTitleId}
          onTitleSelect={selectTitle}
          titleDrag={titleDrag}
          isCutOn={isCutOn}
          cutFocus={cutFocus}
          onCutClick={review.onFocus}
          onSeek={player.seek}
          onSelect={setSelectedId}
          trim={trim}
          onReorder={reorder}
        />
      </section>

      <ColorFilterDefs />
      {dragOver && <div className="drop-overlay"><div>Solte para importar</div></div>}
      {toast.text && <div className={`toast${toast.leaving ? ' leaving' : ''}`} role="status">{toast.text}</div>}
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
          music={musicFields(music)}
          titles={titles}
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

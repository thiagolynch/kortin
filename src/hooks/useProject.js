// Ciclo de vida do projeto: abrir, salvar, novo, recuperação automática e "não salvo".
// "Não salvo" é comparação por referência (documento atual !== documento salvo): O(1),
// sem serializar o projeto inteiro a cada mudança.
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyDocument } from '../state/document';
import { DEFAULT_CAPTIONS } from '../lib/captions';
import { ASPECTS, FITS, baseName, cleanError, restoreClips, serializeProject } from '../lib/timeline';

const AUTOSAVE_DELAY = 1500;

export function useProject({ docApi, library, player, notify, onLoaded }) {
  const { doc, ops } = docApi;
  const [projectPath, setProjectPath] = useState(null);
  const [savedDoc, setSavedDoc] = useState(doc);
  const [recovery, setRecovery] = useState(null);
  const dirty = doc !== savedDoc;
  const projectName = projectPath ? baseName(projectPath) : 'Sem título';

  useEffect(() => {
    window.kortin.setDirty(dirty, `${dirty ? '• ' : ''}${projectName} — Kortin`);
  }, [dirty, projectName]);

  // Recuperação automática: grava 1,5 s depois da última mudança
  const pathRef = useRef(projectPath);
  pathRef.current = projectPath;
  useEffect(() => {
    if (!dirty || !doc.clips.length || docApi.inTransaction) return undefined;
    const t = setTimeout(() => window.kortin.autosaveWrite({ ...serializeProject(doc), _path: pathRef.current }), AUTOSAVE_DELAY);
    return () => clearTimeout(t);
  }, [doc, dirty, docApi.inTransaction]);

  const confirmDiscard = useCallback(
    () => !dirty || window.confirm('Você tem alterações não salvas neste projeto. Deseja descartá-las?'),
    [dirty]
  );

  const loadProject = useCallback(async (data, path, { recovered = false } = {}) => {
    player.pause();
    const paths = [...new Set(data.clips.map((c) => c.path))];
    const { ok, errors } = await library.probeAll(paths);
    const infoByPath = Object.fromEntries(ok.map((i) => [i.path, i]));
    const next = {
      clips: restoreClips(data.clips, infoByPath),
      aspect: ASPECTS[data.aspect] ? data.aspect : '9:16',
      fit: FITS[data.fit] ? data.fit : 'blur',
      captions: { ...DEFAULT_CAPTIONS, ...(data.captions || {}) },
      transcripts: data.transcripts && typeof data.transcripts === 'object' ? data.transcripts : {},
    };
    library.replaceMedia(ok);
    ops.reset(next);
    setSavedDoc(recovered ? null : next);
    setProjectPath(recovered ? data._path || null : path);
    player.seek(0);
    onLoaded(next);
    if (errors.length) {
      notify(`${errors.length} vídeo(s) não foram encontrados e ficaram de fora: ${errors.map((e) => baseName(e.path)).join(', ')}`);
    } else {
      notify(recovered ? 'Projeto recuperado.' : `Projeto "${baseName(path)}" aberto.`);
    }
  }, [library, notify, onLoaded, ops, player]);

  const openProject = useCallback(async (filePath) => {
    if (!confirmDiscard()) return;
    try {
      const res = await window.kortin.openProject(filePath);
      if (res) {
        setRecovery(null);
        await loadProject(res.data, res.path);
      }
    } catch (err) {
      notify(`Não foi possível abrir o projeto: ${cleanError(err)}`);
    }
  }, [confirmDiscard, loadProject, notify]);

  const saveProject = useCallback(async (saveAs = false) => {
    const snapshot = doc; // o que for editado durante o diálogo continua "não salvo"
    try {
      const file = await window.kortin.saveProject(serializeProject(snapshot), projectPath, saveAs);
      if (!file) return;
      setProjectPath(file);
      setSavedDoc(snapshot);
      window.kortin.autosaveClear();
      notify(`Projeto salvo em ${baseName(file)}.kortin`);
    } catch (err) {
      notify(`Não foi possível salvar: ${cleanError(err)}`);
    }
  }, [doc, notify, projectPath]);

  const newProject = useCallback(({ aspect, skipConfirm = false } = {}) => {
    if (!skipConfirm && !confirmDiscard()) return;
    player.pause();
    const next = emptyDocument(aspect || doc.aspect, doc.fit);
    library.replaceMedia([]);
    ops.reset(next);
    setSavedDoc(next);
    setProjectPath(null);
    player.seek(0);
    onLoaded(next);
    window.kortin.autosaveClear();
  }, [confirmDiscard, doc.aspect, doc.fit, library, onLoaded, ops, player]);

  const recover = useCallback(() => {
    const r = recovery;
    setRecovery(null);
    if (r) loadProject(r.data, null, { recovered: true });
  }, [loadProject, recovery]);

  const discardRecovery = useCallback(() => {
    setRecovery(null);
    window.kortin.autosaveClear();
  }, []);

  return {
    projectPath, projectName, dirty, recovery, setRecovery,
    openProject, saveProject, newProject, loadProject, recover, discardRecovery,
  };
}

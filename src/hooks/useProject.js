// Ciclo de vida do projeto: abrir, salvar, novo, recuperação automática e "não salvo".
// "Não salvo" é comparação por referência (documento atual !== documento salvo): O(1),
// sem serializar o projeto inteiro a cada mudança.
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyDocument } from '../state/document';
import { DEFAULT_CAPTIONS } from '../lib/captions';
import {
  ASPECTS, FITS, MUSIC_DEFAULTS, baseName, cleanError, durationMismatches, musicFields, remapProjectPaths, restoreClips,
  serializeProject,
} from '../lib/timeline';

const AUTOSAVE_DELAY = 1500;

export function useProject({ docApi, library, player, notify, onLoaded, askRelink }) {
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

  /**
   * Abre um projeto já lido pelo processo principal. `missing` = vídeos que ele não achou nem pelo
   * caminho relativo: o usuário pode relocalizá-los antes (ou desistir: devolve false).
   */
  const loadProject = useCallback(async (input, path, { recovered = false, missing = [], relinked = 0 } = {}) => {
    let data = input;
    let notifyLater = '';
    if (missing.length) {
      const map = await askRelink(missing);
      if (!map) return false; // cancelou
      data = remapProjectPaths(data, map);
      // os que o usuário decidiu deixar de fora nem são lidos
      const left = new Set(missing.map((m) => m.path).filter((p) => !map[p]));
      if (left.size) {
        data = { ...data, clips: data.clips.filter((c) => !left.has(c.path)) };
        notifyLater = `${left.size} vídeo(s) ficaram de fora.`;
      }
    }
    player.pause();
    // música: confirma que existe e lê a duração (se falhar, o projeto abre sem ela)
    let music = null;
    if (data.music?.path) {
      try {
        const info = await window.kortin.probeAudio(data.music.path);
        music = { ...MUSIC_DEFAULTS, ...musicFields(data.music), name: info.name, duration: info.duration };
      } catch {
        notifyLater = `A música "${baseName(data.music.path)}" não foi encontrada e ficou de fora.`;
      }
    }
    const paths = [...new Set(data.clips.map((c) => c.path))];
    const { ok, errors } = await library.probeAll(paths);
    const infoByPath = Object.fromEntries(ok.map((i) => [i.path, i]));
    const different = durationMismatches(data.clips, infoByPath);
    const next = {
      clips: restoreClips(data.clips, infoByPath),
      aspect: ASPECTS[data.aspect] ? data.aspect : '9:16',
      fit: FITS[data.fit] ? data.fit : 'blur',
      captions: { ...DEFAULT_CAPTIONS, ...(data.captions || {}) },
      transcripts: data.transcripts && typeof data.transcripts === 'object' ? data.transcripts : {},
      music,
    };
    library.replaceMedia(ok);
    ops.reset(next);
    setSavedDoc(recovered ? null : next);
    setProjectPath(recovered ? data._path || null : path);
    player.seek(0);
    onLoaded(next);
    if (errors.length) {
      notify(`${errors.length} vídeo(s) ficaram de fora: ${errors.map((e) => baseName(e.path)).join(', ')}`);
    } else if (different.length) {
      notify(`Atenção: ${different.map(baseName).join(', ')} tem duração diferente da salva. Confira se é o mesmo vídeo.`);
    } else if (notifyLater) {
      notify(notifyLater);
    } else {
      const moved = relinked ? ` ${relinked} vídeo(s) foram achados no novo local.` : '';
      notify(`${recovered ? 'Projeto recuperado.' : `Projeto "${baseName(path)}" aberto.`}${moved}`);
    }
    return true;
  }, [askRelink, library, notify, onLoaded, ops, player]);

  const openProject = useCallback(async (filePath) => {
    if (!confirmDiscard()) return;
    try {
      const res = await window.kortin.openProject(filePath);
      if (res) {
        setRecovery(null);
        await loadProject(res.data, res.path, { missing: res.missing || [], relinked: res.relinked || 0 });
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
    if (r) loadProject(r.data, null, { recovered: true, missing: r.missing || [], relinked: r.relinked || 0 });
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

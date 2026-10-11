// Projetos portáteis: o .kortin guarda, para cada vídeo, o caminho absoluto E o caminho relativo
// à pasta do projeto. Ao abrir em outro PC (ou depois de mover a pasta), o Kortin acha os vídeos
// sozinho; o que não achar vai para a tela "Arquivos não encontrados".
const fs = require('fs');
const path = require('path');
const { assertMediaPath } = require('../core/security');

const toPosix = (p) => p.split(path.sep).join('/');

/** Acrescenta `rel` (relativo à pasta do projeto, com "/") em cada clipe e na música. */
function withRelativePaths(data, projectFile) {
  const dir = path.dirname(projectFile);
  const addRel = (item) => {
    const rel = path.relative(dir, item.path);
    // outro disco no Windows: não existe caminho relativo
    return rel && !path.isAbsolute(rel) ? { ...item, rel: toPosix(rel) } : (({ rel: _r, ...rest }) => rest)(item);
  };
  return {
    ...data,
    clips: data.clips.map(addRel),
    ...(data.music && typeof data.music.path === 'string' ? { music: addRel(data.music) } : {}),
  };
}

/** Troca caminhos antigos pelos novos nos clipes e nas transcrições (que são indexadas por caminho). */
function remapPaths(data, map) {
  const has = (p) => Object.prototype.hasOwnProperty.call(map, p);
  const musicMoved = data.music && has(data.music.path);
  if (!data.clips.some((c) => has(c.path)) && !musicMoved) return data;
  const transcripts = data.transcripts
    ? Object.fromEntries(Object.entries(data.transcripts).map(([p, t]) => [has(p) ? map[p] : p, t]))
    : data.transcripts;
  return {
    ...data,
    clips: data.clips.map((c) => (has(c.path) ? { ...c, path: map[c.path] } : c)),
    transcripts,
    ...(musicMoved ? { music: { ...data.music, path: map[data.music.path] } } : {}),
  };
}

/**
 * Resolve os vídeos de um projeto. Ordem: caminho absoluto → relativo ao projeto → mesmo nome na
 * pasta do projeto. Só aceita caminhos locais de vídeo (assertVideoPath recusa pastas de rede).
 * Devolve { data (com caminhos atualizados), relinked, missing: [{ path, name, duration }] }.
 */
function resolveMedia(data, projectFile, exists = fs.existsSync) {
  const dir = projectFile ? path.dirname(projectFile) : null;
  const map = {};
  const missing = [];
  const seen = new Set();
  const items = data.music && typeof data.music.path === 'string' ? [...data.clips, data.music] : data.clips;
  for (const c of items) {
    if (typeof c.path !== 'string' || seen.has(c.path)) continue;
    seen.add(c.path);
    const candidates = [c.path];
    if (dir && typeof c.rel === 'string' && c.rel) candidates.push(path.resolve(dir, c.rel));
    if (dir) candidates.push(path.join(dir, path.basename(String(c.path).replace(/\\/g, '/'))));
    let found = null;
    for (const cand of candidates) {
      try {
        const p = assertMediaPath(cand);
        if (exists(p)) { found = p; break; }
      } catch { /* caminho recusado: tenta o próximo */ }
    }
    if (found && found !== c.path) map[c.path] = found;
    if (!found) missing.push({ path: c.path, name: path.basename(String(c.path).replace(/\\/g, '/')), duration: c.duration });
  }
  return { data: remapPaths(data, map), relinked: Object.keys(map).length, missing };
}

// Pastas que nunca têm vídeo do usuário e só deixariam a busca lenta
const SKIP = new Set(['node_modules', '$recycle.bin', 'system volume information', 'windows', 'appdata', '.git']);

/**
 * Procura arquivos por nome dentro de uma pasta escolhida pelo usuário.
 * Limitada (profundidade e quantidade de itens) para nunca travar num disco inteiro.
 * Devolve { [nomeEmMinúsculas]: caminho } com o primeiro achado de cada nome.
 */
async function findByName(root, names, { maxDepth = 6, maxEntries = 50000 } = {}) {
  const wanted = new Set(names.map((n) => String(n).toLowerCase()));
  const found = {};
  let visited = 0;
  const queue = [[root, 0]];
  while (queue.length && wanted.size && visited < maxEntries) {
    const [dir, depth] = queue.shift(); // largura primeiro: acha antes o que está mais perto
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // sem permissão: segue
    }
    for (const e of entries) {
      if (++visited > maxEntries) break;
      const lower = e.name.toLowerCase();
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP.has(lower) && !lower.startsWith('.')) queue.push([path.join(dir, e.name), depth + 1]);
      } else if (e.isFile() && wanted.has(lower)) {
        found[lower] = path.join(dir, e.name);
        wanted.delete(lower);
      }
    }
  }
  return { found, complete: visited < maxEntries };
}

module.exports = { withRelativePaths, remapPaths, resolveMedia, findByName };

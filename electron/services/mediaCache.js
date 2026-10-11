// Cache em disco do que é caro de recalcular por vídeo: leitura (duração, tamanho), miniatura e
// onda sonora. Reabrir um projeto com 50 vídeos deixa de rodar 150 processos do FFmpeg.
//
// Chave = caminho + tamanho + data de modificação + versão do formato: se o arquivo mudar, a chave
// muda e o valor antigo simplesmente deixa de ser usado (e sai pelo LRU).
// LRU: ler um item "toca" o arquivo; quando passa do limite, apaga os menos usados até 80%.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORMAT = 1; // mudar quando o formato do que é guardado mudar
const DEFAULT_LIMIT = 200 * 1024 * 1024;

function createMediaCache(dir, { limitBytes = DEFAULT_LIMIT } = {}) {
  let total = null; // calculado sob demanda na primeira gravação

  const keyFor = (kind, file) => {
    const st = fs.statSync(file);
    return crypto.createHash('sha1').update(`${FORMAT}|${kind}|${file}|${st.size}|${st.mtimeMs}`).digest('hex');
  };
  const fileFor = (key) => path.join(dir, `${key}.json`);

  function get(kind, file) {
    try {
      const f = fileFor(keyFor(kind, file));
      const value = JSON.parse(fs.readFileSync(f, 'utf8'));
      const now = new Date();
      fs.utimesSync(f, now, now); // LRU: usado agora
      return value;
    } catch {
      return null; // sem cache, cache corrompido ou arquivo de vídeo sumiu: recalcula
    }
  }

  function prune() {
    const items = [];
    for (const name of fs.readdirSync(dir)) {
      try {
        const st = fs.statSync(path.join(dir, name));
        items.push({ name, size: st.size, t: st.mtimeMs });
      } catch { /* sumiu no meio */ }
    }
    total = items.reduce((n, i) => n + i.size, 0);
    if (total <= limitBytes) return;
    items.sort((a, b) => a.t - b.t); // mais antigos primeiro
    for (const i of items) {
      if (total <= limitBytes * 0.8) break;
      try {
        fs.unlinkSync(path.join(dir, i.name));
        total -= i.size;
      } catch { /* em uso: tenta o próximo */ }
    }
  }

  function set(kind, file, value) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const json = JSON.stringify(value);
      const f = fileFor(keyFor(kind, file));
      const tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, json);
      fs.renameSync(tmp, f);
      if (total === null) prune();
      else {
        total += Buffer.byteLength(json);
        if (total > limitBytes) prune();
      }
    } catch {
      /* cache é opcional: falhar aqui nunca impede o trabalho */
    }
  }

  /** Devolve do cache ou calcula, guarda e devolve. Valores null/undefined não são guardados. */
  async function remember(kind, file, compute) {
    const hit = get(kind, file);
    if (hit !== null) return hit;
    const value = await compute();
    if (value != null) set(kind, file, value);
    return value;
  }

  return { get, set, remember, prune, dir };
}

module.exports = { createMediaCache };

// Integridade dos modelos de IA (cadeia de suprimentos).
// Cada modelo tem tamanho e SHA-256 fixados no código, e a URL aponta para uma revisão fixa do
// repositório (não para "main"). Se o servidor for comprometido, o arquivo não bate e é apagado:
// o Kortin nunca carrega um modelo que não seja byte a byte o esperado.
const crypto = require('crypto');
const fs = require('fs');

/** SHA-256 de um arquivo em streaming (não carrega 500 MB na memória). */
function sha256File(file, onProgress) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const total = fs.statSync(file).size || 1;
    let read = 0;
    const s = fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 });
    s.on('data', (chunk) => {
      hash.update(chunk);
      read += chunk.length;
      if (onProgress) onProgress(read / total);
    });
    s.on('error', reject);
    s.on('end', () => resolve(hash.digest('hex')));
  });
}

// Marca "já verificado" ao lado do modelo: evita refazer o hash de 500 MB a cada uso.
// Guarda tamanho e data de modificação; se o arquivo mudar, a marca deixa de valer.
const markerPath = (file) => `${file}.verificado`;

function isMarkedVerified(file, expected) {
  try {
    const st = fs.statSync(file);
    const m = JSON.parse(fs.readFileSync(markerPath(file), 'utf8'));
    return m.sha256 === expected.sha256 && m.size === st.size && m.mtimeMs === st.mtimeMs;
  } catch {
    return false;
  }
}

function markVerified(file, expected) {
  const st = fs.statSync(file);
  fs.writeFileSync(markerPath(file), JSON.stringify({ sha256: expected.sha256, size: st.size, mtimeMs: st.mtimeMs }));
}

class IntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntegrityError';
    this.userFacing = true;
  }
}

/**
 * Garante que o arquivo é o modelo esperado. Se não for, APAGA o arquivo e lança erro.
 * Não existe modo "só avisar": modelo adulterado não roda.
 */
async function ensureVerified(file, expected, onProgress) {
  if (isMarkedVerified(file, expected)) return true;
  const { size } = fs.statSync(file);
  const ok = size === expected.bytes && (await sha256File(file, onProgress)) === expected.sha256;
  if (!ok) {
    for (const f of [file, markerPath(file)]) {
      try { fs.unlinkSync(f); } catch { /* já não existe */ }
    }
    throw new IntegrityError('O modelo de legenda estava corrompido ou foi alterado e foi apagado por segurança. Baixe-o de novo.');
  }
  markVerified(file, expected);
  return true;
}

module.exports = { sha256File, ensureVerified, isMarkedVerified, markVerified, markerPath, IntegrityError };

// Remove sobras de execuções anteriores (o app pode ter sido fechado à força no meio de uma tarefa).
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../core/logger');

const DAY = 24 * 60 * 60 * 1000;

function sweep(dir, prefix, olderThan = DAY) {
  let removed = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(prefix)) continue;
      const full = path.join(dir, name);
      try {
        if (Date.now() - fs.statSync(full).mtimeMs > olderThan) {
          fs.rmSync(full, { recursive: true, force: true });
          removed++;
        }
      } catch { /* em uso ou já removido */ }
    }
  } catch { /* pasta não existe */ }
  return removed;
}

function cleanup(modelsDir) {
  const n = sweep(os.tmpdir(), 'kortin-') + sweep(modelsDir, 'tmp-');
  if (n) log.info('cleanup', `${n} pasta(s) temporária(s) antiga(s) removida(s)`);
}

module.exports = { cleanup, sweep };

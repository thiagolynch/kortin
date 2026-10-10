// Registro de erros em arquivo (userData/logs/kortin.log), com rotação simples.
// Nunca derruba o app: falha de log é ignorada.
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024;
let file = null;

function init(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    file = path.join(dir, 'kortin.log');
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      fs.renameSync(file, path.join(dir, 'kortin.1.log'));
    }
  } catch {
    file = null;
  }
}

function write(level, scope, msg, extra) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${msg}${extra ? ` ${extra}` : ''}\n`;
  if (process.env.KORTIN_LOG_STDOUT) process.stdout.write(line);
  if (!file) return;
  try {
    fs.appendFileSync(file, line);
  } catch {
    /* sem log: segue */
  }
}

const describe = (err) => (err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err));

module.exports = {
  init,
  info: (scope, msg) => write('info', scope, msg),
  warn: (scope, msg, err) => write('warn', scope, msg, err ? describe(err) : ''),
  error: (scope, msg, err) => write('error', scope, msg, err ? describe(err) : ''),
  get file() {
    return file;
  },
};

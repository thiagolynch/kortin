// Execução de processos do FFmpeg. Nada aqui passa por shell: argumentos vão direto ao
// executável, então nomes de arquivo com espaços, aspas ou "&" não viram comandos.
const { spawn } = require('child_process');
const { FFMPEG } = require('./binary');

const STDERR_KEEP = 64 * 1024;

/** Roda e coleta o fim do stderr (onde o FFmpeg explica erros). Nunca rejeita: devolve { code, signal, stderr }. */
function run(args, { onStdout, onSpawn, cwd, bin = FFMPEG } = {}) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(bin, args, { windowsHide: true, cwd });
    } catch (err) {
      resolve({ code: -1, signal: null, stderr: String(err) });
      return;
    }
    if (onSpawn) onSpawn(proc);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > STDERR_KEEP * 2) stderr = stderr.slice(-STDERR_KEEP);
    });
    proc.stdout.on('data', (d) => onStdout && onStdout(d));
    proc.on('error', (err) => resolve({ code: -1, signal: null, stderr: `${stderr}\n${err}` }));
    proc.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
}

/** Roda e devolve o stdout inteiro como Buffer (para saídas pequenas, como uma miniatura). */
async function runBuffer(args, { maxBytes = 8 * 1024 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  let proc;
  const res = await run(args, {
    onSpawn: (p) => (proc = p),
    onStdout: (d) => {
      size += d.length;
      if (size > maxBytes) proc?.kill('SIGKILL');
      else chunks.push(d);
    },
  });
  return { ...res, stdout: Buffer.concat(chunks) };
}

const lastLines = (stderr, n = 6) => stderr.trim().split('\n').slice(-n).join('\n');

module.exports = { run, runBuffer, lastLines, FFMPEG };

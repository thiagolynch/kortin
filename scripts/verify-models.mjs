// Confere, contra o servidor real, os SHA-256 e tamanhos fixados em electron/services/stt/transcribe.js.
// Roda no CI (com cache por revisão): se alguém mudar a revisão ou um hash estiver errado, o build falha
// antes de chegar ao usuário — e o app recusaria o modelo de qualquer forma.
import { createRequire } from 'node:module';
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stt = require('../electron/services/stt/transcribe.js');
const { sha256File } = require('../electron/services/stt/integrity.js');

const dir = join(root, 'vendor-src', 'models-verify', stt.REVISION);
mkdirSync(dir, { recursive: true });

let failed = 0;
for (const [key, m] of Object.entries(stt.MODELS)) {
  const file = join(dir, m.file);
  if (!existsSync(file) || statSync(file).size !== m.bytes) {
    console.log(`Baixando ${m.file} (${m.sizeMB} MB)…`);
    const res = await fetch(stt.modelUrl(key));
    if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status} — a revisão ${stt.REVISION} existe?`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(`${file}.part`));
    renameSync(`${file}.part`, file);
  }
  const size = statSync(file).size;
  const sha = await sha256File(file);
  const ok = size === m.bytes && sha === m.sha256;
  console.log(`${ok ? '✅' : '❌'} ${key}: ${m.file} ${size} bytes sha256 ${sha}`);
  if (!ok) {
    console.log(`   esperado: ${m.bytes} bytes sha256 ${m.sha256}`);
    failed++;
  }
}
if (failed) process.exit(1);
console.log('Modelos conferidos.');

// Teste real da legenda (roda no GitHub Actions, onde há acesso ao Hugging Face):
// baixa o modelo "tiny" e transcreve o áudio de exemplo do whisper.cpp.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const t = require('../electron/transcribe.js');

const models = join(root, 'vendor-src', 'models');
mkdirSync(models, { recursive: true });
const tiny = join(models, 'ggml-tiny.bin');
if (!existsSync(tiny)) {
  console.log('Baixando o modelo tiny…');
  const res = await fetch('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(tiny, Buffer.from(await res.arrayBuffer()));
}
// o app procura pelo nome do modelo "rapido"; aqui usamos o tiny no lugar dele
copyFileSync(tiny, join(models, t.MODELS.rapido.file));

const sample = join(root, 'vendor-src', 'whisper.cpp-v1.9.5', 'samples', 'jfk.wav');
const r = await t.transcribe(sample, { modelsDir: models, model: 'rapido', language: 'en' });
const text = r.words.map((w) => w.w).join(' ');
console.log(`${r.words.length} palavras: ${text}`);
const ok = /country/i.test(text) && r.words.every((w) => w.e > w.s);
if (!ok) {
  console.error('❌ A transcrição não reconheceu o áudio de exemplo.');
  process.exit(1);
}
console.log('✅ Legenda funcionando de ponta a ponta.');

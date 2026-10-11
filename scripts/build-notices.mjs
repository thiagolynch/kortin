// Gera licenses/AVISOS-DE-TERCEIROS.txt: componentes de terceiros que vão dentro do instalador,
// com a licença de cada um. Roda antes de todo build (npm run dist), então nunca fica desatualizado.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = [];
const hr = '='.repeat(78);

out.push(`Kortin ${pkg.version} — Avisos de componentes de terceiros`, hr, '');
out.push(`FFmpeg
------
O Kortin usa o programa FFmpeg (https://ffmpeg.org), executado como um processo separado,
sem modificações, para ler, converter e exportar vídeos.

Windows: FFmpeg 6.1.1, build "essentials" de https://www.gyan.dev/ffmpeg/builds/,
compilado com --enable-gpl e --enable-version3. Licença: GNU GPL versão 3 (ffmpeg-LICENSE.txt).
Configuração completa do build e versões das bibliotecas incluídas: ffmpeg-windows-build.txt.
Código-fonte do FFmpeg desta versão: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93
                                    https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz

OFERTA DE CÓDIGO-FONTE: por no mínimo 3 anos a partir da distribuição desta versão, qualquer
pessoa pode pedir uma cópia completa do código-fonte correspondente do FFmpeg e das bibliotecas
GPL incluídas neste build (como x264), em meio digital, sem custo além do de envio, abrindo uma
solicitação em https://github.com/thiagolynch/kortin/issues com o título "Código-fonte do FFmpeg".

FFmpeg é marca de Fabrice Bellard, criador do projeto. O Kortin não é afiliado ao projeto FFmpeg.
`, hr, '');

out.push(`whisper.cpp (legenda automática)
--------------------------------
https://github.com/ggml-org/whisper.cpp — Licença MIT (whisper.cpp-LICENSE.txt).
Os modelos de IA (ggml-*.bin) são baixados sob demanda do repositório oficial no Hugging Face
(https://huggingface.co/ggerganov/whisper.cpp) e derivam dos modelos Whisper da OpenAI (MIT).
`, hr, '');

out.push(`Fontes das legendas e títulos
------------------------------
Todas sob SIL Open Font License 1.1, do catálogo do Google Fonts (fonts.google.com):

Montserrat — Copyright 2011 The Montserrat Project Authors (Montserrat-OFL.txt).
Anton — Copyright 2020 The Anton Project Authors (Anton-OFL.txt).
Bebas Neue — Copyright 2010 Dharma Type (BebasNeue-OFL.txt).
Archivo Black — Copyright 2017 The Archivo Black Project Authors (ArchivoBlack-OFL.txt).
`, hr, '');

out.push(`Electron e Chromium
-------------------
Electron (MIT). As licenças do Chromium acompanham o app no arquivo LICENSES.chromium.html,
na pasta de instalação.
`, hr, '');

// Pacotes npm que vão dentro do app (dependências de produção) + React, que é empacotado no build
const listed = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).slice(1);
const bundled = ['react', 'react-dom', 'scheduler'].map((n) => join(root, 'node_modules', n)).filter(existsSync);
const seen = new Set();
out.push('Pacotes JavaScript incluídos', '----------------------------', '');
for (const dir of [...bundled, ...listed]) {
  let meta;
  try { meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { continue; }
  const id = `${meta.name}@${meta.version}`;
  if (seen.has(id) || meta.name === 'ffmpeg-static') continue; // o FFmpeg já está descrito acima
  seen.add(id);
  const licFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  out.push(`${id} — ${meta.license || 'ver texto'}${meta.homepage ? ` — ${meta.homepage}` : ''}`);
  if (licFile) out.push('', readFileSync(join(dir, licFile), 'utf8').trim(), '');
  else out.push(`  (sem arquivo de licença no pacote: ${relative(root, dir)})`, '');
  out.push('-'.repeat(78));
}

writeFileSync(join(root, 'licenses', 'AVISOS-DE-TERCEIROS.txt'), `${out.join('\n')}\n`, 'utf8');
console.log(`Avisos gerados: ${seen.size} pacotes JavaScript + FFmpeg, whisper.cpp, fontes (Montserrat/Anton/Bebas Neue/Archivo Black), Electron.`);

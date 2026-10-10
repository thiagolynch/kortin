// Compila o whisper.cpp (IA de transcrição que roda no PC) em duas versões:
//   fast   → usa as instruções AVX2 dos processadores de 2013 em diante (bem mais rápida)
//   compat → funciona em qualquer processador x64 (o app usa se a "fast" não rodar)
// Resultado: vendor/whisper/<plataforma>/{fast,compat}/whisper-cli(.exe)
// Uso: npm run setup:whisper   (precisa de git e cmake; no Windows, do Visual Studio Build Tools)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = 'v1.9.5';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'vendor-src', `whisper.cpp-${VERSION}`);
const plat = platform() === 'win32' ? 'win' : platform() === 'darwin' ? 'mac' : 'linux';
const exe = plat === 'win' ? 'whisper-cli.exe' : 'whisper-cli';
const outRoot = join(root, 'vendor', 'whisper', plat);

const run = (cmd, args, cwd = root) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
};

if (!existsSync(join(src, 'CMakeLists.txt'))) {
  mkdirSync(dirname(src), { recursive: true });
  run('git', ['clone', '--depth', '1', '--branch', VERSION, 'https://github.com/ggml-org/whisper.cpp', src]);
}

const common = [
  '-DCMAKE_BUILD_TYPE=Release',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DWHISPER_BUILD_TESTS=OFF',
  '-DWHISPER_BUILD_SERVER=OFF',
  '-DWHISPER_SDL2=OFF',
  '-DWHISPER_CURL=OFF',
  '-DGGML_NATIVE=OFF',
  '-DGGML_OPENMP=OFF', // sem dependência de DLL extra
  // no Windows: runtime do Visual C++ embutido no .exe (não exige instalar nada)
  '-DCMAKE_POLICY_DEFAULT_CMP0091=NEW',
  '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded',
];

const variants = {
  fast: ['-DGGML_AVX=ON', '-DGGML_AVX2=ON', '-DGGML_FMA=ON', '-DGGML_F16C=ON'],
  compat: ['-DGGML_AVX=OFF', '-DGGML_AVX2=OFF', '-DGGML_FMA=OFF', '-DGGML_F16C=OFF'],
};

for (const [name, flags] of Object.entries(variants)) {
  const build = join(src, `build-${name}`);
  run('cmake', ['-S', src, '-B', build, ...common, ...flags]);
  run('cmake', ['--build', build, '--config', 'Release', '--target', 'whisper-cli', '-j', String(Math.max(2, cpus().length))]);
  const candidates = [join(build, 'bin', 'Release', exe), join(build, 'bin', exe)];
  const built = candidates.find(existsSync);
  if (!built) throw new Error(`Não achei o ${exe} compilado em ${build}`);
  const dest = join(outRoot, name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(built, join(dest, exe));
  console.log(`✔ ${name}: ${join(dest, exe)}`);
}

// Teste do motor de vídeo: gera vídeos de exemplo, exporta nos 3 formatos e confere o resultado.
// Rodar com: npm run test:engine
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const engine = require('../electron/engine');

const tmp = path.join(__dirname, 'tmp');
fs.mkdirSync(tmp, { recursive: true });

function make(name, args) {
  const out = path.join(tmp, name);
  const r = spawnSync(engine.FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return out;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('❌', msg);
    process.exit(1);
  }
  console.log('✅', msg);
}

(async () => {
  console.log('FFmpeg:', engine.FFMPEG);

  const horizontal = make('horizontal.mp4', [
    '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  ]);
  const vertical = make('vertical-sem-audio.mp4', [
    '-f', 'lavfi', '-i', 'testsrc2=size=720x1280:rate=25:duration=4',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  ]);

  const a = await engine.probe(horizontal);
  const b = await engine.probe(vertical);
  assert(Math.abs(a.duration - 6) < 0.1 && a.width === 1920 && a.hasAudio, 'Leitura do vídeo horizontal');
  assert(Math.abs(b.duration - 4) < 0.1 && b.height === 1280 && !b.hasAudio, 'Leitura do vídeo vertical sem áudio');

  const thumb = await engine.thumbnail(horizontal, 1);
  assert(thumb && thumb.startsWith('data:image/jpeg'), 'Geração de miniatura');

  const clips = [
    { path: horizontal, inPoint: 1, outPoint: 3.5, hasAudio: true },
    { path: vertical, inPoint: 0.5, outPoint: 2.5, hasAudio: false },
    { path: horizontal, inPoint: 4, outPoint: 5, hasAudio: true, volume: 0.5 },
    { path: horizontal, inPoint: 0, outPoint: 1, hasAudio: true, volume: 0 },
  ];
  const expected = 2.5 + 2 + 1 + 1;

  const formats = [
    { label: '9:16 desfoque', width: 1080, height: 1920, fit: 'blur' },
    { label: '16:9 preencher', width: 1920, height: 1080, fit: 'cover' },
    { label: '1:1 ajustar', width: 1080, height: 1080, fit: 'contain' },
  ];

  for (const f of formats) {
    const output = path.join(tmp, `saida-${f.width}x${f.height}-${f.fit}.mp4`);
    let lastProgress = 0;
    const job = engine.exportVideo(clips, { ...f, crf: 28, preset: 'ultrafast', output }, (p) => (lastProgress = p));
    const res = await job.promise;
    const info = await engine.probe(output);
    assert(
      res.ok && info.width === f.width && info.height === f.height &&
        Math.abs(info.duration - expected) < 0.15 && info.hasAudio && lastProgress === 1,
      `Exportação ${f.label}: ${info.width}x${info.height}, ${info.duration.toFixed(2)}s (esperado ${expected}s)`
    );
  }

  // Cancelamento
  const cancelOut = path.join(tmp, 'cancelado.mp4');
  const job = engine.exportVideo(clips, { width: 1080, height: 1920, fit: 'blur', preset: 'veryslow', output: cancelOut });
  setTimeout(job.cancel, 300);
  const r = await job.promise;
  assert(r.cancelled && !fs.existsSync(cancelOut), 'Cancelamento da exportação');

  console.log('\nTudo certo! 🎬');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

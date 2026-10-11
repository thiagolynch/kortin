// Teste do motor de vídeo: gera vídeos de exemplo, exporta e confere o resultado.
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

function meanVolume(file, start, dur) {
  const r = spawnSync(engine.FFMPEG, ['-hide_banner', '-ss', String(start), '-t', String(dur), '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
  const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr.toString());
  return m ? Number(m[1]) : null;
}

let failures = 0;
function check(cond, msg) {
  console.log(cond ? '✅' : '❌', msg);
  if (!cond) failures++;
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

  // Leitura
  const a = await engine.probe(horizontal);
  const b = await engine.probe(vertical);
  check(Math.abs(a.duration - 6) < 0.1 && a.width === 1920 && a.hasAudio, 'Leitura do vídeo horizontal');
  check(Math.abs(b.duration - 4) < 0.1 && b.height === 1280 && !b.hasAudio, 'Leitura do vídeo vertical sem áudio');
  check((await engine.thumbnail(horizontal, 1))?.startsWith('data:image/jpeg'), 'Geração de miniatura');

  // Onda sonora
  const peaks = await engine.audioPeaks(horizontal, 50);
  check(Math.abs(peaks.length - 300) <= 3 && Math.max(...peaks) > 50, `Onda sonora: ${peaks.length} pontos para 6s`);
  check((await engine.audioPeaks(vertical, 50)).length === 0, 'Onda sonora vazia em vídeo sem áudio');

  // Velocidade
  const tempoProduct = (sp) => engine.atempoChain(sp).split(',').map((x) => Number(x.split('=')[1]))
    .reduce((acc, v) => acc * v, 1);
  for (const sp of [0.25, 0.5, 1.5, 4]) {
    const chain = engine.atempoChain(sp).split(',');
    check(Math.abs(tempoProduct(sp) - sp) < 1e-4 && chain.every((x) => { const v = Number(x.split('=')[1]); return v >= 0.5 && v <= 2; }),
      `Cadeia de atempo para ${sp}x: ${engine.atempoChain(sp)}`);
  }

  const clips = [
    { path: horizontal, inPoint: 1, outPoint: 3.5, hasAudio: true },                         // 2,5 s
    { path: vertical, inPoint: 0.5, outPoint: 2.5, hasAudio: false },                        // 2 s
    { path: horizontal, inPoint: 4, outPoint: 5, hasAudio: true, volume: 0.5 },              // 1 s
    { path: horizontal, inPoint: 0, outPoint: 1, hasAudio: true, volume: 0 },                // 1 s
    { path: horizontal, inPoint: 0, outPoint: 4, hasAudio: true, speed: 2, fadeIn: 0.5 },    // 2 s
    { path: horizontal, inPoint: 2, outPoint: 3, hasAudio: true, speed: 0.5, volume: 1.5 },  // 2 s
  ];
  const expected = clips.reduce((s, c) => s + engine.outDuration(c), 0);

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
    check(
      res.ok && info.width === f.width && info.height === f.height &&
        Math.abs(info.duration - expected) < 0.2 && info.hasAudio && lastProgress === 1,
      `Exportação ${f.label}: ${info.width}x${info.height}, ${info.duration.toFixed(2)}s (esperado ${expected}s)`
    );
  }

  // Volumes e fades no arquivo 9:16
  const out = path.join(tmp, 'saida-1080x1920-blur.mp4');
  const full = meanVolume(out, 0.5, 1.5);
  const half = meanVolume(out, 4.6, 0.8);
  const muted = meanVolume(out, 5.6, 0.8);
  const fadeStart = meanVolume(out, 6.5, 0.15);
  const afterFade = meanVolume(out, 7.2, 0.6);
  const boosted = meanVolume(out, 8.6, 0.8);
  check(Math.abs(full - half - 6) < 1, `Volume 50%: ${(half - full).toFixed(1)} dB (esperado -6)`);
  check(muted < -80, `Clipe silenciado: ${muted} dB`);
  check(fadeStart < afterFade - 6, `Fade de entrada: ${fadeStart} dB no início vs ${afterFade} dB depois`);
  check(Math.abs(boosted - full - 3.5) < 1, `Volume 150%: +${(boosted - full).toFixed(1)} dB (esperado +3,5)`);

  // Legendas queimadas no vídeo (todas as variações de estilo)
  const cues = [
    { start: 0.2, end: 2.0, words: [
      { start: 0.2, end: 0.6, text: 'Olá,' }, { start: 0.6, end: 1.0, text: 'tudo' },
      { start: 1.0, end: 1.4, text: 'bem?' }, { start: 1.4, end: 2.0, text: 'Bora editar!' }] },
    { start: 2.2, end: 4.0, words: [
      { start: 2.2, end: 2.8, text: 'Sem' }, { start: 2.8, end: 3.4, text: 'marca' }, { start: 3.4, end: 4.0, text: "d'água" }] },
  ];
  for (const [style, f] of [['destaque', formats[0]], ['caixa', formats[1]], ['classica', formats[2]], ['neon', formats[0]]]) {
    const out = path.join(tmp, `legenda-${style}.mp4`);
    const res = await engine.exportVideo(clips.slice(0, 2), {
      ...f, crf: 28, preset: 'ultrafast', output: out,
      captions: { cues, settings: { style, position: 0.72, size: 'm' } },
    }).promise;
    spawnSync(engine.FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1.2', '-i', out, '-frames:v', '1', '-vf', 'scale=-2:480', path.join(tmp, `legenda-${style}.png`)]);
    check(res.ok && fs.existsSync(path.join(tmp, `legenda-${style}.png`)), `Legenda queimada: estilo ${style} (${f.label})`);
  }

  // Placa de vídeo: neste computador de teste não há placa, então a detecção volta vazia
  const hw = await engine.detectHardwareEncoders();
  console.log('   placas de vídeo detectadas:', hw.map((h) => h.label).join(', ') || 'nenhuma');

  // Volta automática para a CPU quando a placa falha
  const fbOut = path.join(tmp, 'fallback.mp4');
  const used = [];
  const fb = await engine.exportVideo(
    clips.slice(0, 2),
    { width: 540, height: 960, fit: 'cover', crf: 30, preset: 'ultrafast', encoder: 'h264_nvenc', output: fbOut },
    null,
    (e) => used.push(e)
  ).promise;
  check(
    hw.some((h) => h.id === 'h264_nvenc') ? fb.ok : fb.ok && fb.fellBack && used.join('>') === 'h264_nvenc>libx264',
    `Volta automática para CPU: ${used.join(' → ')}`
  );

  // Cancelamento
  const cancelOut = path.join(tmp, 'cancelado.mp4');
  const job = engine.exportVideo(clips, { width: 1080, height: 1920, fit: 'blur', preset: 'veryslow', output: cancelOut });
  setTimeout(job.cancel, 300);
  const r = await job.promise;
  check(r.cancelled && !fs.existsSync(cancelOut), 'Cancelamento da exportação');

  // Muitos clipes: o grafo passa de 32 mil caracteres e precisa ir por arquivo (limite do Windows)
  const many = Array.from({ length: 160 }, (_, i) => ({
    path: horizontal, inPoint: (i % 50) * 0.1, outPoint: (i % 50) * 0.1 + 0.2, hasAudio: true,
    volume: 1, speed: [1, 2, 0.5, 4][i % 4], fadeIn: 0, fadeOut: 0, denoise: false,
  }));
  const manyOut = path.join(tmp, 'muitos-clipes.mp4');
  const manyRes = await engine.exportVideo(many, { width: 540, height: 960, fit: 'cover', crf: 35, preset: 'ultrafast', output: manyOut }).promise;
  const manyInfo = manyRes.ok ? await engine.probe(manyOut) : null;
  const manyExpected = many.reduce((n, c) => n + (c.outPoint - c.inPoint) / c.speed, 0);
  check(manyInfo && manyRes.parts > 1 && Math.abs(manyInfo.duration - manyExpected) < 0.05, `160 clipes em ${manyRes.parts} partes: ${manyInfo?.duration.toFixed(2)}s (esperado ${manyExpected.toFixed(2)}s)`);

  // Clipe minúsculo acelerado: 0,1 s a 4x = 0,025 s (menos que 1 quadro)
  const tinyOut = path.join(tmp, 'minusculo.mp4');
  const tinyRes = await engine.exportVideo(
    [{ path: horizontal, inPoint: 1, outPoint: 1.1, hasAudio: true, volume: 1, speed: 4 }, { path: vertical, inPoint: 0, outPoint: 1, hasAudio: false, volume: 1, speed: 1 }],
    { width: 1080, height: 1080, fit: 'contain', crf: 30, preset: 'ultrafast', output: tinyOut }
  ).promise;
  check(tinyRes.ok && fs.existsSync(tinyOut), 'Clipe de 0,1 s a 4x exporta sem erro');

  // Pasta e arquivo com acentos e emoji (usuário "João" no Windows)
  const uniDir = path.join(tmp, 'Vídeos do João 🎬');
  fs.mkdirSync(uniDir, { recursive: true });
  const uniIn = path.join(uniDir, 'ação.mp4');
  fs.copyFileSync(horizontal, uniIn);
  const uniOut = path.join(uniDir, 'saída final.mp4');
  const uniRes = await engine.exportVideo([{ path: uniIn, inPoint: 0, outPoint: 1, hasAudio: true, volume: 1, speed: 1 }], {
    width: 1080, height: 1920, fit: 'blur', crf: 30, preset: 'ultrafast', output: uniOut,
    captions: { cues: [{ start: 0, end: 1, words: [{ start: 0, end: 1, text: 'Olá {\\p1} çãõ' }] }], settings: { style: 'neon', size: 'm', position: 0.7 } },
  }).promise;
  check(uniRes.ok && fs.existsSync(uniOut) && !fs.existsSync(`${uniOut}.parcial.mp4`), 'Caminhos com acentos/emoji + legenda com caracteres de controle');

  // Música de fundo: repete, entra com fade e abaixa sozinha quando há voz (ducking)
  const music = make('musica.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-c:a', 'libmp3lame', '-q:a', '4']);
  const band = (file, start, dur) => {
    const r = spawnSync(engine.FFMPEG, ['-hide_banner', '-ss', String(start), '-t', String(dur), '-i', file, '-vn', '-af', 'bandpass=f=220:width_type=q:w=8,volumedetect', '-f', 'null', '-']);
    const m = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr.toString());
    return m ? Number(m[1]) : null;
  };
  const withVoiceThenSilence = [
    { path: horizontal, inPoint: 0, outPoint: 3, hasAudio: true, volume: 1, speed: 1 }, // "voz" (440 Hz)
    { path: vertical, inPoint: 0, outPoint: 3, hasAudio: false, volume: 1, speed: 1 }, // sem voz
  ];
  for (const duck of [true, false]) {
    const out = path.join(tmp, `musica-${duck ? 'duck' : 'reta'}.mp4`);
    const res = await engine.exportVideo(withVoiceThenSilence, {
      width: 1080, height: 1080, fit: 'contain', crf: 32, preset: 'ultrafast', output: out,
      music: { path: music, volume: 0.5, duck, fadeIn: 0, fadeOut: 0 },
    }).promise;
    const info = res.ok ? await engine.probe(out) : null;
    const underVoice = band(out, 0.8, 1.8);
    const alone = band(out, 3.8, 1.8); // a música (2 s) precisa ter repetido para tocar aqui
    const diff = alone - underVoice;
    check(
      info && Math.abs(info.duration - 6) < 0.1 && alone > -40 && (duck ? diff > 6 : Math.abs(diff) < 3),
      `Música ${duck ? 'com abaixamento' : 'sem abaixamento'}: ${underVoice} dB sob a voz vs ${alone} dB sozinha (repetiu: ${alone > -40 ? 'sim' : 'não'})`
    );
  }
  // música também no caminho em partes (mais de 16 clipes)
  const manyMusic = Array.from({ length: 20 }, (_, i) => ({ path: i % 2 ? vertical : horizontal, inPoint: 0, outPoint: 0.5, hasAudio: !(i % 2), volume: 1, speed: 1 }));
  const mmOut = path.join(tmp, 'musica-partes.mp4');
  const mmRes = await engine.exportVideo(manyMusic, { width: 540, height: 960, fit: 'cover', crf: 35, preset: 'ultrafast', output: mmOut, music: { path: music, volume: 0.4, duck: true, fadeIn: 1, fadeOut: 1 } }).promise;
  const mmInfo = mmRes.ok ? await engine.probe(mmOut) : null;
  check(mmRes.parts > 1 && mmInfo && Math.abs(mmInfo.duration - 10) < 0.1 && band(mmOut, 4, 2) > -45, `Música na exportação em partes: ${mmRes.parts} partes, ${mmInfo?.duration.toFixed(2)}s`);

  // Projeto completo do checklist do beta: 24 clipes (em partes) + música com abaixamento + legenda queimada
  const proj = Array.from({ length: 24 }, (_, i) => ({
    path: i % 3 ? horizontal : vertical, inPoint: (i % 5) * 0.2, outPoint: (i % 5) * 0.2 + 0.5,
    hasAudio: i % 3 !== 0, volume: 1, speed: [1, 1.5, 2][i % 3], fadeIn: 0.1, fadeOut: 0.1, denoise: i % 4 === 0,
  }));
  const projDur = proj.reduce((t, c) => t + (c.outPoint - c.inPoint) / c.speed, 0);
  const projCues = Array.from({ length: Math.floor(projDur) }, (_, k) => ({
    start: k, end: k + 0.9, words: [{ start: k, end: k + 0.45, text: 'Teste' }, { start: k + 0.45, end: k + 0.9, text: `${k + 1}!` }],
  }));
  const projOut = path.join(tmp, 'projeto-completo.mp4');
  const projRes = await engine.exportVideo(proj, {
    width: 1080, height: 1920, fit: 'blur', crf: 32, preset: 'ultrafast', output: projOut,
    captions: { cues: projCues, settings: { style: 'destaque', size: 'm', position: 0.72 } },
    music: { path: music, volume: 0.3, duck: true, fadeIn: 1, fadeOut: 1 },
  }).promise;
  const projInfo = projRes.ok ? await engine.probe(projOut) : null;
  const expectedProj = Math.round(projDur * 30) / 30;
  // legenda: compara o mesmo quadro com e sem legenda na faixa onde ela fica (o vídeo de teste é claro,
  // então "contar pixels claros" não prova nada — a diferença entre as duas versões prova)
  const noCapOut = path.join(tmp, 'projeto-completo-sem-legenda.mp4');
  await engine.exportVideo(proj, { width: 1080, height: 1920, fit: 'blur', crf: 32, preset: 'ultrafast', output: noCapOut }).promise;
  const bandPixels = (file) => spawnSync(engine.FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', '2.3', '-i', file, '-frames:v', '1', '-vf', 'crop=iw:ih*0.12:0:ih*0.66,scale=96:24,format=gray', '-f', 'rawvideo', '-']).stdout || Buffer.alloc(0);
  const withCap = bandPixels(projOut);
  const noCap = bandPixels(noCapOut);
  const changed = withCap.length && withCap.length === noCap.length ? [...withCap].filter((v, i) => Math.abs(v - noCap[i]) > 40).length : 0;
  const musicLevel = band(projOut, 1.5, 3);
  check(
    projRes.ok && projRes.parts > 1 && projInfo && Math.abs(projInfo.duration - expectedProj) < 0.05 && musicLevel > -50 && changed > 40,
    `Projeto completo: ${projRes.parts} partes, ${projInfo?.duration.toFixed(2)}s (esperado ${expectedProj.toFixed(2)}s), música ${musicLevel} dB, legenda mudou ${changed} de ${withCap.length} pontos da faixa`
  );

  // v0.7: cor, transição e título, medidos no vídeo exportado
  const v7clips = [
    { path: horizontal, inPoint: 0, outPoint: 2, hasAudio: true, volume: 1, speed: 1, filter: 'pb', videoFadeOut: 0.5 },
    { path: horizontal, inPoint: 2, outPoint: 4, hasAudio: true, volume: 1, speed: 1, filter: 'quente', videoFadeIn: 0.5 },
  ];
  const v7opts = { width: 1080, height: 1080, fit: 'contain', crf: 28, preset: 'ultrafast' };
  const v7Out = path.join(tmp, 'v07-titulo.mp4');
  const v7Plain = path.join(tmp, 'v07-sem-titulo.mp4');
  const v7res = await engine.exportVideo(v7clips, { ...v7opts, output: v7Out, titles: [{ start: 0.2, end: 1.6, lines: ['Meu título'], style: 'titulo', position: 0.5 }] }).promise;
  await engine.exportVideo(v7clips, { ...v7opts, output: v7Plain }).promise;
  const rgbAt = (file, t) => spawnSync(engine.FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=48:48,format=rgb24', '-f', 'rawvideo', '-']).stdout || Buffer.alloc(0);
  const v7stats = (b) => {
    let sat = 0; let lum = 0; let rb = 0;
    for (let i = 0; i < b.length; i += 3) {
      sat += Math.max(b[i], b[i + 1], b[i + 2]) - Math.min(b[i], b[i + 1], b[i + 2]);
      lum += (b[i] + b[i + 1] + b[i + 2]) / 3;
      rb += b[i] - b[i + 2];
    }
    const n = b.length / 3 || 1;
    return { sat: sat / n, lum: lum / n, warm: rb / n };
  };
  const pb = v7stats(rgbAt(v7Plain, 1.0));
  const nearEnd = v7stats(rgbAt(v7Plain, 1.97));
  const warm = v7stats(rgbAt(v7Plain, 3.0));
  const neutral = v7stats(rgbAt(horizontal, 3.0)); // mesmo quadro, sem filtro
  check(v7res.ok && pb.sat < 3, `Filtro P&B: saturação média ${pb.sat.toFixed(1)} (esperado ≈ 0)`);
  check(warm.warm > neutral.warm + 5, `Filtro quente: vermelho−azul ${warm.warm.toFixed(1)} vs ${neutral.warm.toFixed(1)} sem filtro`);
  check(nearEnd.lum < 15 && pb.lum > 40, `Transição: brilho ${nearEnd.lum.toFixed(1)} no fim do clipe vs ${pb.lum.toFixed(1)} no meio`);
  const v7a = rgbAt(v7Out, 1.0);
  const v7b = rgbAt(v7Plain, 1.0);
  const v7diff = [...v7a].filter((v, i) => Math.abs(v - v7b[i]) > 40).length;
  check(v7diff > 30, `Título gravado no vídeo: ${v7diff} pontos diferentes do vídeo sem título`);

  // Tonemap de HDR: um vídeo com metadados HDR reais (bt2020/smpte2084, igual a um iPhone) precisa
  // sair diferente com hdr:true vs hdr:false — essa é a mesma marca que a ExportDialog.jsx precisa
  // enviar (o bug real era ela nunca enviar `hdr`, então nenhuma exportação pela interface
  // aplicava o tonemap, mesmo em vídeos HDR de verdade).
  const hdrSrc = make('hdr-fonte.mp4', [
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=2',
    '-pix_fmt', 'yuv420p10le', '-color_primaries', 'bt2020', '-colorspace', 'bt2020nc', '-color_trc', 'smpte2084',
    '-c:v', 'libx265', '-tag:v', 'hvc1',
  ]);
  const hdrOn = path.join(tmp, 'hdr-on.mp4');
  const hdrOff = path.join(tmp, 'hdr-off.mp4');
  const hdrBase = { width: 1080, height: 1080, fit: 'contain', crf: 28, preset: 'ultrafast' };
  const hdrOnRes = await engine.exportVideo([{ path: hdrSrc, inPoint: 0, outPoint: 2, hasAudio: false, volume: 1, speed: 1, hdr: true }], { ...hdrBase, output: hdrOn }).promise;
  const hdrOffRes = await engine.exportVideo([{ path: hdrSrc, inPoint: 0, outPoint: 2, hasAudio: false, volume: 1, speed: 1, hdr: false }], { ...hdrBase, output: hdrOff }).promise;
  const hdrA = rgbAt(hdrOn, 1.0);
  const hdrB = rgbAt(hdrOff, 1.0);
  const hdrDiff = [...hdrA].filter((v, i) => Math.abs(v - hdrB[i]) > 4).length;
  check(
    hdrOnRes.ok && hdrOffRes.ok && hdrDiff > 50,
    `Tonemap de HDR muda a imagem quando hdr:true: ${hdrDiff} pontos diferentes do mesmo vídeo sem a marca`
  );

  // Sobreposição: um retângulo vermelho sólido por cima do canto, com e sem fundo verde removido
  const overlayGreen = make('overlay-verde.mp4', [
    '-f', 'lavfi', '-i', 'color=c=green:size=320x180:rate=30:duration=3',
    '-f', 'lavfi', '-i', 'color=c=red:size=160x90:rate=30:duration=3',
    '-filter_complex', '[0:v][1:v]overlay=(W-w)/2:(H-h)/2[v]', '-map', '[v]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  ]);
  const ovClip = [{ path: horizontal, inPoint: 0, outPoint: 3, hasAudio: true, volume: 1, speed: 1 }];
  const ovBase = { width: 1080, height: 1080, fit: 'contain', crf: 28, preset: 'ultrafast' };
  const ovOut = path.join(tmp, 'sobreposicao.mp4');
  const ovRes = await engine.exportVideo(ovClip, {
    ...ovBase, output: ovOut,
    overlay: {
      path: overlayGreen, start: 0, end: 3, inPoint: 0, outPoint: 3, width: 320, height: 180,
      x: 0.8, y: 0.8, scale: 0.3, opacity: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.2, blend: 0.1 },
    },
  }).promise;
  const ovInfo = ovRes.ok ? await engine.probe(ovOut) : null;
  // pixel no canto onde a sobreposição fica (perto de x=0.8·1080, y=0.8·1080): sem ela, é o padrão de teste
  const pixelAt = (file, x, y) => spawnSync(engine.FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', `crop=1:1:${x}:${y},format=rgb24`, '-f', 'rawvideo', '-']).stdout || Buffer.alloc(0);
  const ovPixel = pixelAt(ovOut, 860, 860); // dentro do retângulo (verde+vermelho) de ~324x324 centrado em (864,864)
  const isGreenish = ovPixel.length === 3 && ovPixel[1] > ovPixel[0] && ovPixel[1] > ovPixel[2];
  const isReddish = ovPixel.length === 3 && ovPixel[0] > ovPixel[1] && ovPixel[0] > ovPixel[2];
  check(ovRes.ok && ovInfo && Math.abs(ovInfo.duration - 3) < 0.1 && (isGreenish || isReddish), `Sobreposição aplicada: vídeo com ${ovInfo?.duration.toFixed(2)}s, pixel da sobreposição = rgb(${[...ovPixel]})`);

  // Com chroma key: o verde deve sair (e o vídeo de baixo aparecer no lugar dele)
  const ovChromaOut = path.join(tmp, 'sobreposicao-chroma.mp4');
  const ovChromaRes = await engine.exportVideo(ovClip, {
    ...ovBase, output: ovChromaOut,
    overlay: {
      path: overlayGreen, start: 0, end: 3, inPoint: 0, outPoint: 3, width: 320, height: 180,
      x: 0.8, y: 0.8, scale: 0.3, opacity: 1, chroma: { enabled: true, color: '#008000', similarity: 0.4, blend: 0.1 },
    },
  }).promise;
  const chromaPixel = pixelAt(ovChromaOut, 864, 864); // mesmo ponto: devia deixar de ser verde puro
  const stillPureGreen = chromaPixel.length === 3 && chromaPixel[1] > 150 && chromaPixel[0] < 40 && chromaPixel[2] < 40;
  check(ovChromaRes.ok && !stillPureGreen, `Chroma key remove o fundo verde: pixel = rgb(${[...chromaPixel]})`);

  // Sobreposição também no caminho em partes (mais de 16 clipes)
  const manyOverlay = Array.from({ length: 20 }, () => ({ path: horizontal, inPoint: 0, outPoint: 0.4, hasAudio: true, volume: 1, speed: 1 }));
  const moOut = path.join(tmp, 'sobreposicao-partes.mp4');
  const moRes = await engine.exportVideo(manyOverlay, {
    width: 540, height: 960, fit: 'cover', crf: 35, preset: 'ultrafast', output: moOut,
    overlay: { path: overlayGreen, start: 0, end: 8, inPoint: 0, outPoint: 3, width: 320, height: 180, x: 0.5, y: 0.5, scale: 0.4, opacity: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.2, blend: 0.1 } },
  }).promise;
  const moInfo = moRes.ok ? await engine.probe(moOut) : null;
  check(moRes.parts > 1 && moInfo && Math.abs(moInfo.duration - 8) < 0.1, `Sobreposição na exportação em partes: ${moRes.parts} partes, ${moInfo?.duration.toFixed(2)}s`);

  if (failures) {
    console.error(`\n${failures} teste(s) falharam.`);
    process.exit(1);
  }
  console.log('\nTudo certo! 🎬');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

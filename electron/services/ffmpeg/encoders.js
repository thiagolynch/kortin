// Codificadores de vídeo: processador (x264) e placas de vídeo (NVIDIA, Intel, AMD).
const { run, runBuffer } = require('./process');

const HW_ENCODERS = [
  { id: 'h264_nvenc', label: 'NVIDIA' },
  { id: 'h264_qsv', label: 'Intel' },
  { id: 'h264_amf', label: 'AMD' },
];

function encoderArgs(encoder, crf, preset) {
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(crf + 1), '-b:v', '0', '-pix_fmt', 'yuv420p'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', String(crf + 1), '-pix_fmt', 'nv12'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp',
        '-qp_i', String(crf), '-qp_p', String(crf + 2), '-qp_b', String(crf + 4), '-pix_fmt', 'yuv420p'];
    default:
      return ['-c:v', 'libx264', '-preset', preset || 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p'];
  }
}

let cache = null;

/** Descobre (uma vez por execução) quais placas funcionam de verdade, com um teste de 3 quadros. */
function detectHardwareEncoders() {
  if (cache) return cache;
  cache = (async () => {
    if (process.env.KORTIN_NO_HW) return [];
    const { stdout } = await runBuffer(['-hide_banner', '-encoders']);
    const list = stdout.toString();
    const working = [];
    for (const enc of HW_ENCODERS) {
      if (!list.includes(enc.id)) continue;
      const { code } = await run([
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=black:s=320x240:d=0.2',
        '-frames:v', '3', ...encoderArgs(enc.id, 23, 'veryfast'), '-f', 'null', '-',
      ]);
      if (code === 0) working.push(enc);
    }
    return working;
  })().catch(() => []);
  return cache;
}

module.exports = { HW_ENCODERS, encoderArgs, detectHardwareEncoders };

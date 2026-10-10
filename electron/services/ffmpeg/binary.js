// Onde está o executável do FFmpeg (embutido pelo ffmpeg-static; fora do .asar quando empacotado).
const fs = require('fs');

function resolveFfmpeg() {
  if (process.env.KORTIN_FFMPEG) return process.env.KORTIN_FFMPEG;
  try {
    const p = require('ffmpeg-static');
    if (p) {
      const unpacked = p.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) return unpacked;
      if (fs.existsSync(p)) return p;
    }
  } catch {
    /* sem ffmpeg-static: usa o do sistema */
  }
  return 'ffmpeg';
}

module.exports = { FFMPEG: resolveFfmpeg() };

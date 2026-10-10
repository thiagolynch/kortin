// Leitura das informações de um vídeo e da miniatura.
const { run, runBuffer } = require('./process');

const toSeconds = (h, m, s) => Number(h) * 3600 + Number(m) * 60 + Number(s);

/**
 * Interpreta a saída do "ffmpeg -i". Ignora capas embutidas ("attached pic"), que não são vídeo:
 * sem isso, um MP3 com capa seria aceito como vídeo e o preview quebraria.
 */
function parseProbe(text) {
  const lines = text.split('\n');
  const videoLine = lines.find((l) => /Stream #\d+:\d+.*: Video:/.test(l) && !/attached pic/.test(l));
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!videoLine) throw new Error('Este arquivo não tem uma trilha de vídeo.');
  if (!d) throw new Error('Não foi possível ler a duração do vídeo.');

  const dims = /,\s*(\d{2,5})x(\d{2,5})[\s,[]/.exec(`${videoLine} `);
  if (!dims) throw new Error('Não foi possível ler o tamanho do vídeo.');
  const fps = /(\d+(?:\.\d+)?) fps/.exec(videoLine);
  const rot = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(text) || /rotate\s*:\s*(-?\d+)/.exec(text);

  let width = Number(dims[1]);
  let height = Number(dims[2]);
  const rotation = rot ? Math.round(Number(rot[1])) : 0;
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];

  const duration = toSeconds(d[1], d[2], d[3]);
  if (!(duration > 0)) throw new Error('O vídeo está vazio ou corrompido.');

  return {
    duration,
    width,
    height,
    fps: fps ? Number(fps[1]) : 30,
    hasAudio: lines.some((l) => /Stream #\d+:\d+.*: Audio:/.test(l)),
    rotation,
  };
}

async function probe(file) {
  const { stderr } = await run(['-hide_banner', '-i', file]);
  if (/No such file or directory/.test(stderr)) throw new Error('Arquivo não encontrado.');
  if (/Invalid data found|could not find codec parameters/i.test(stderr)) throw new Error('Formato de arquivo não suportado.');
  return parseProbe(stderr);
}

/** Miniatura em JPEG direto pelo stdout (sem arquivo temporário). */
async function thumbnail(file, atSeconds) {
  const { code, stdout } = await runBuffer([
    '-hide_banner', '-loglevel', 'error',
    '-ss', Math.max(0, atSeconds).toFixed(3), '-i', file,
    '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5',
    '-f', 'image2pipe', '-c:v', 'mjpeg', '-',
  ]);
  if (code !== 0 || !stdout.length) return null;
  return `data:image/jpeg;base64,${stdout.toString('base64')}`;
}

module.exports = { parseProbe, probe, thumbnail };

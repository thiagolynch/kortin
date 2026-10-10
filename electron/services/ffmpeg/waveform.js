// Picos de áudio para desenhar a onda sonora (0 a 255 por ponto).
const { spawn } = require('child_process');
const { FFMPEG } = require('./binary');

const RATE = 8000;

/**
 * Lê o áudio em 8 kHz mono e guarda o maior valor de cada janela.
 * Tempo O(n) nas amostras, memória O(pontos): o áudio nunca fica inteiro na memória.
 */
function audioPeaks(file, perSecond = 50) {
  const win = Math.round(RATE / perSecond);
  return new Promise((resolve) => {
    const proc = spawn(
      FFMPEG,
      ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE), '-f', 's16le', '-'],
      { windowsHide: true }
    );
    const peaks = [];
    let count = 0;
    let max = 0;
    let carry = null; // byte que sobrou de um pedaço ímpar
    const push = () => peaks.push(Math.min(255, Math.round(Math.sqrt(max / 32768) * 255)));

    proc.stdout.on('data', (chunk) => {
      let buf = chunk;
      if (carry) {
        buf = Buffer.concat([carry, chunk]);
        carry = null;
      }
      const usable = buf.length - (buf.length % 2);
      if (usable < buf.length) carry = buf.subarray(usable);
      // visão de 16 bits sem cópia quando o buffer está alinhado
      const samples = buf.byteOffset % 2 === 0
        ? new Int16Array(buf.buffer, buf.byteOffset, usable / 2)
        : new Int16Array(Uint8Array.from(buf.subarray(0, usable)).buffer);
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i] < 0 ? -samples[i] : samples[i];
        if (v > max) max = v;
        if (++count === win) {
          push();
          count = 0;
          max = 0;
        }
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('error', () => resolve([]));
    proc.on('close', () => {
      if (count > 0) push();
      resolve(peaks);
    });
  });
}

module.exports = { audioPeaks };

// Protocolo media:// — entrega vídeos locais ao preview, com suporte a "Range" (pular no vídeo).
// Só arquivos autorizados pelo usuário (Grants) passam.
const fs = require('fs');
const path = require('path');
const { protocol } = require('electron');
const { Readable } = require('stream');

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.3gp': 'video/3gpp',
};

function registerPrivileged() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

/** Interpreta o cabeçalho Range. Função pura (testada). */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start;
  let end;
  if (!m[1]) {
    start = Math.max(0, size - parseInt(m[2], 10));
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
  }
  if (start > end || start >= size) return { invalid: true };
  return { start, end };
}

function register(grants) {
  protocol.handle('media', async (request) => {
    try {
      const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1));
      if (!grants.hasMedia(filePath)) return new Response('Acesso negado', { status: 403 });
      const { size } = await fs.promises.stat(filePath);
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
      const range = request.headers.get('range') ? parseRange(request.headers.get('range'), size) : null;
      if (range?.invalid) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      if (range) {
        const stream = fs.createReadStream(filePath, { start: range.start, end: range.end });
        return new Response(Readable.toWeb(stream), {
          status: 206,
          headers: { ...base, 'Content-Length': String(range.end - range.start + 1), 'Content-Range': `bytes ${range.start}-${range.end}/${size}` },
        });
      }
      return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
        status: 200,
        headers: { ...base, 'Content-Length': String(size) },
      });
    } catch {
      return new Response('Arquivo indisponível', { status: 404 });
    }
  });
}

module.exports = { registerPrivileged, register, parseRange };

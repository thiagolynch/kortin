import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content-Security-Policy só no build de produção (o servidor de dev precisa de scripts inline do HMR).
// Mesmo que um texto malicioso chegue ao DOM, nenhum script de fora roda e nada sai para a rede.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: media:",
  "media-src media:",
  "font-src 'self'",
  "connect-src 'self' media:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

const cspPlugin = {
  name: 'kortin-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  plugins: [react(), cspPlugin],
  base: './',
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});

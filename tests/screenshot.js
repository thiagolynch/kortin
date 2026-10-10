// Abre o app com os vídeos de teste e salva um print da janela.
// Uso: npm run build && npx electron tests/screenshot.js <saida.png>
const path = require('path');
const { app, BrowserWindow } = require('electron');

const out = process.argv.find((a) => a.endsWith('.png')) || path.join(__dirname, 'tmp', 'screenshot.png');
const tmp = path.join(__dirname, 'tmp');
process.argv.push(path.join(tmp, 'horizontal.mp4'), path.join(tmp, 'vertical-sem-audio.mp4'));

require('../electron/main.js');

app.whenReady().then(() => {
  setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0];
    await win.webContents.executeJavaScript(`
      (async () => {
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const clip = document.querySelectorAll('.tl-clip')[0];
        const r = clip.getBoundingClientRect();
        clip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.45, clientY: r.top + 10, button: 0 }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        await wait(800);
        return document.querySelectorAll('.tl-clip').length;
      })()
    `).then((n) => console.log('clipes na linha do tempo:', n));
    await new Promise((r) => setTimeout(r, 1000));
    const img = await win.webContents.capturePage();
    require('fs').writeFileSync(out, img.toPNG());
    console.log('print salvo em', out);
    app.exit(0);
  }, 5000);
});

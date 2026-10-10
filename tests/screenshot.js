// Teste visual: abre o app, executa um roteiro na interface e salva prints.
// Uso:
//   npm run build
//   npx electron tests/screenshot.js editar  <pasta-de-saida>   (boas-vindas, edição, exportação em fila)
//   npx electron tests/screenshot.js recuperar <pasta-de-saida> (abre sem arquivos e testa a recuperação)
const path = require('path');
const fs = require('fs');
const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;

const mode = process.argv.includes('recuperar') ? 'recuperar' : 'editar';
const outDir = process.argv[process.argv.length - 1];
const tmp = path.join(__dirname, 'tmp');
const exportDir = path.join(tmp, 'exportados');
app.setPath('userData', path.join(tmp, 'userdata'));

if (mode === 'editar') {
  process.argv.push(path.join(tmp, 'horizontal.mp4'), path.join(tmp, 'vertical-sem-audio.mp4'));
  fs.rmSync(exportDir, { recursive: true, force: true });
  fs.mkdirSync(exportDir, { recursive: true });
  // a janela de "escolher pasta" é do Windows; no teste ela responde sozinha
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportDir] });
}

require('../electron/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  console.log('print:', file);
}

app.whenReady().then(async () => {
  await wait(4500);
  const win = BrowserWindow.getAllWindows()[0];
  const js = (code) => win.webContents.executeJavaScript(`(async () => { const wait = (ms) => new Promise(r => setTimeout(r, ms)); ${code} })()`);
  const click = (selector, text) => js(`
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(b => ${text ? `b.textContent.includes(${JSON.stringify(text)})` : 'true'});
    if (!el) throw new Error('não achei ' + ${JSON.stringify(selector + ' ' + (text || ''))});
    el.click(); await wait(250); return true;
  `);

  if (mode === 'editar') {
    console.log('boas-vindas visível:', await js(`return !!document.querySelector('.welcome');`));
    await shot(win, 'kortin-boas-vindas');
    await click('.welcome button', 'Explorar primeiro');
    await wait(2500); // importação + leitura da onda sonora

    const result = await js(`
      const clip = document.querySelectorAll('.tl-clip')[0];
      const r = clip.getBoundingClientRect();
      clip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + 10, button: 0 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await wait(300);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true })); // dividir
      await wait(300);
      [...document.querySelectorAll('.speed-chips button')].find(b => b.textContent === '2x').click();
      await wait(200);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const ranges = document.querySelectorAll('.inspector input[type=range]');
      setter.call(ranges[0], '150'); ranges[0].dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(ranges[1], '1');   ranges[1].dispatchEvent(new Event('input', { bubbles: true }));
      await wait(400);
      const v = document.querySelector('.frame-video');
      return {
        clips: document.querySelectorAll('.tl-clip').length,
        waves: document.querySelectorAll('.tl-wave path').length,
        speedBadge: document.querySelector('.tl-speed')?.textContent,
        fades: document.querySelectorAll('.tl-fade').length,
        volume: document.querySelector('.insp-control-head span').textContent,
        previewLoaded: v.readyState >= 1 && v.videoWidth > 0,
        total: document.querySelector('.timecode').textContent,
      };
    `);
    console.log('resultado:', JSON.stringify(result));
    await shot(win, 'kortin-editor-v02');

    // Exportar dois formatos de uma vez, em segundo plano
    await click('.topbar-right .btn.primary', 'Exportar');
    await click('.format-card', '16:9');
    await shot(win, 'kortin-exportar');
    await click('.modal .btn.primary', 'exportar');
    await wait(1500);
    await click('.queue-pill');
    await shot(win, 'kortin-fila');
    for (let i = 0; i < 60; i++) {
      const pending = await js(`return document.querySelectorAll('.queue-item.running, .queue-item.queued').length;`);
      if (!pending) break;
      await wait(1000);
    }
    const queue = await js(`return [...document.querySelectorAll('.queue-item')].map(x => x.innerText.replace(/\\n/g, ' | '));`);
    console.log('fila:', JSON.stringify(queue));
    console.log('arquivos exportados:', fs.readdirSync(exportDir).join(', '));
  } else {
    const banner = await js(`return document.querySelector('.recovery')?.innerText || null;`);
    console.log('banner:', JSON.stringify(banner));
    const after = await js(`
      [...document.querySelectorAll('.recovery button')].find(b => b.textContent.includes('Recuperar')).click();
      await wait(2500);
      return {
        clips: document.querySelectorAll('.tl-clip').length,
        speedBadge: document.querySelector('.tl-speed')?.textContent,
        toast: document.querySelector('.toast')?.innerText,
      };
    `);
    console.log('após recuperar:', JSON.stringify(after));
  }
  app.exit(0);
});

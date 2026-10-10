// Teste visual: abre o app, executa um roteiro na interface e salva prints.
// Uso:
//   npm run build
//   npx electron tests/screenshot.js editar  <pasta-de-saida>   (importa, edita e deixa o autosave gravar)
//   npx electron tests/screenshot.js recuperar <pasta-de-saida> (abre sem arquivos e testa a recuperação)
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');

const mode = process.argv.includes('recuperar') ? 'recuperar' : 'editar';
const outDir = process.argv[process.argv.length - 1];
const tmp = path.join(__dirname, 'tmp');
app.setPath('userData', path.join(tmp, 'userdata'));

if (mode === 'editar') {
  process.argv.push(path.join(tmp, 'horizontal.mp4'), path.join(tmp, 'vertical-sem-audio.mp4'));
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
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);

  if (mode === 'editar') {
    const result = await js(`
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const clip = document.querySelectorAll('.tl-clip')[0];
      const r = clip.getBoundingClientRect();
      clip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.5, clientY: r.top + 10, button: 0 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await wait(300);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));       // dividir
      await wait(300);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true })); // duplicar
      await wait(300);
      const range = document.querySelector('.insp-volume input[type=range]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(range, '40');
      range.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(2500); // espera o autosave
      return {
        clips: document.querySelectorAll('.tl-clip').length,
        volume: document.querySelector('.insp-volume-head span').textContent,
        title: document.title,
        dirty: !!document.querySelector('.dirty-dot'),
      };
    `);
    console.log('resultado:', JSON.stringify(result));
    await shot(win, 'kortin-editor');
    const auto = path.join(tmp, 'userdata', 'recuperacao.kortin');
    console.log('autosave existe:', fs.existsSync(auto));
  } else {
    const banner = await js(`return document.querySelector('.recovery')?.innerText || null;`);
    console.log('banner:', JSON.stringify(banner));
    await shot(win, 'kortin-recuperacao');
    const after = await js(`
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      [...document.querySelectorAll('.recovery button')].find(b => b.textContent.includes('Recuperar')).click();
      await wait(2500);
      return { clips: document.querySelectorAll('.tl-clip').length, toast: document.querySelector('.toast')?.innerText };
    `);
    console.log('após recuperar:', JSON.stringify(after));
  }
  app.exit(0);
});

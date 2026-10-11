// Teste visual: abre o app, executa um roteiro na interface e salva prints.
// Uso:
//   npm run build
//   npx electron tests/screenshot.js editar  <pasta-de-saida>   (boas-vindas, edição, exportação em fila)
//   npx electron tests/screenshot.js recuperar <pasta-de-saida> (abre sem arquivos e testa a recuperação)
const path = require('path');
const fs = require('fs');
const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;

const MODES = ['recuperar', 'legenda', 'mover', 'editar'];
const mode = MODES.find((m) => process.argv.includes(m)) || 'editar';
const outDir = process.argv[process.argv.length - 1];
const tmp = process.env.KORTIN_SHOT_TMP || path.join(__dirname, 'tmp'); // KORTIN_SHOT_TMP: vídeos de demonstração para os prints do README
const exportDir = path.join(tmp, 'exportados');
app.setPath('userData', path.join(tmp, 'userdata'));

if (mode === 'editar' || mode === 'legenda') {
  process.argv.push(path.join(tmp, 'horizontal.mp4'), path.join(tmp, 'vertical-sem-audio.mp4'));
  fs.rmSync(exportDir, { recursive: true, force: true });
  fs.mkdirSync(exportDir, { recursive: true });
  // a janela de "escolher pasta" é do Windows; no teste ela responde sozinha
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportDir] });
  dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: path.join(exportDir, path.basename((o || _w).defaultPath)) });
}

// "mover": projeto salvo em outro PC — os caminhos absolutos não existem mais aqui
if (mode === 'mover') {
  fs.mkdirSync(path.join(tmp, 'projetos'), { recursive: true });
  const proj = path.join(tmp, 'projetos', 'projeto-movido.kortin'); // vídeos fora da pasta do projeto
  const gone = process.platform === 'win32' ? 'D:\\Outro PC\\Videos' : '/outro-pc/videos';
  fs.writeFileSync(proj, JSON.stringify({
    app: 'kortin', version: 4, aspect: '9:16', fit: 'blur',
    clips: [
      { id: 'a', path: path.join(gone, 'horizontal.mp4'), name: 'horizontal.mp4', duration: 6, inPoint: 0, outPoint: 3, speed: 1, volume: 1 },
      { id: 'b', path: path.join(gone, 'vertical-sem-audio.mp4'), name: 'vertical-sem-audio.mp4', duration: 4, inPoint: 0, outPoint: 4, speed: 1, volume: 1 },
      { id: 'c', path: path.join(gone, 'nao-existe.mp4'), name: 'nao-existe.mp4', duration: 9, inPoint: 0, outPoint: 2, speed: 1, volume: 1 },
    ],
  }));
  process.argv.push(proj);
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [tmp] }); // "Procurar numa pasta" → tests/tmp
}

require('../electron/main.js');

// No modo "legenda", a IA é simulada com uma transcrição fixa (o modelo real é testado em tests/../scripts/test-whisper.mjs)
if (mode === 'legenda') {
  const { ipcMain } = electron;
  const fake = [
    [0.3, 0.7, 'Olá,'], [0.75, 1.0, 'é,'], [1.05, 1.35, 'tudo'], [1.4, 1.8, 'bem?'],
    [2.2, 2.45, 'Hoje'], [2.5, 2.65, 'eu'], // começa…
    [2.9, 3.2, 'Hoje'], [3.25, 3.4, 'eu'], [3.45, 3.7, 'vou'], [3.75, 4.2, 'mostrar'], [4.25, 4.4, 'o'], [4.45, 4.9, 'Kortin.'],
    [5.0, 5.3, 'Hum,'], [5.35, 5.6, 'muito'], [5.62, 5.95, 'fácil!'],
  ].map(([s, e, w]) => ({ s, e, w }));
  app.whenReady().then(() => {
    ipcMain.removeHandler('captions:status');
    ipcMain.handle('captions:status', () => ({
      available: true,
      models: {
        rapido: { label: 'Rápido', sizeMB: 148, installed: true, hint: 'Bom para fala clara, roda em qualquer PC' },
        preciso: { label: 'Preciso', sizeMB: 488, installed: false, hint: 'Acerta mais nomes e gírias' },
        maximo: { label: 'Máximo', sizeMB: 574, installed: false, hint: 'O mais preciso' },
      },
    }));
    ipcMain.removeHandler('captions:transcribe');
    ipcMain.handle('captions:transcribe', async (event, { filePath, model, language }) => {
      for (const p of [0.2, 0.6, 1]) {
        event.sender.send('captions:progress', { filePath, p });
        await new Promise((r) => setTimeout(r, 150));
      }
      return { words: fake, model, language };
    });
  });
}

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
  win.webContents.on('console-message', (e) => {
    const { level, message } = e;
    if (level === 'error' || level === 3) console.log('[renderer]', message);
  });
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
      ranges[0].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      setter.call(ranges[1], '1');   ranges[1].dispatchEvent(new Event('input', { bubbles: true }));
      ranges[1].dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
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
    // desfazer: o arrasto do slider de volume é UM passo só (transação)
    const undo = await js(`
      const before = document.querySelector('.insp-control-head span').textContent;
      setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const vol = document.querySelectorAll('.inspector input[type=range]')[0];
      for (const v of ['120', '130', '140']) { setter.call(vol, v); vol.dispatchEvent(new Event('input', { bubbles: true })); await wait(30); }
      vol.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await wait(100);
      const dragged = document.querySelector('.insp-control-head span').textContent;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      await wait(200);
      const undone = document.querySelector('.insp-control-head span').textContent;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
      await wait(200);
      return { before, dragged, undone, redone: document.querySelector('.insp-control-head span').textContent,
               dirty: !!document.querySelector('.dirty-dot') };
    `.replace('setter =', 'const setter ='));
    console.log('desfazer:', JSON.stringify(undo));

    // música de fundo: o diálogo do Windows responde com a música de teste
    const folderDialog = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(tmp, 'musica.mp3')] });
    await click('.music-card .btn', 'Escolher música');
    await wait(1200);
    dialog.showOpenDialog = folderDialog;
    const mus = await js(`
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const vol = document.querySelector('.music-card input[type=range]');
      setter.call(vol, '0.4'); vol.dispatchEvent(new Event('input', { bubbles: true }));
      vol.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      await wait(150);
      return {
        name: document.querySelector('.music-name strong')?.textContent,
        info: document.querySelector('.music-name small')?.textContent,
        volume: document.querySelector('.music-card .insp-control-head span')?.textContent,
        lane: document.querySelector('.tl-music-bar')?.textContent,
        loops: document.querySelectorAll('.tl-music-loop').length,
      };
    `);
    console.log('música:', JSON.stringify(mus));
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
  } else if (mode === 'legenda') {
    await click('.welcome button', 'Explorar primeiro');
    await wait(2000);
    await click('.panel-tabs button', 'Legendas');
    await wait(500);
    await shot(win, 'kortin-legenda-vazia');
    await click('.cap-card .btn.primary', 'Gerar');
    await wait(2000);
    const r1 = await js(`
      return {
        cues: document.querySelectorAll('.cap-item').length,
        texts: [...document.querySelectorAll('.cap-text')].map(x => x.textContent),
        lane: document.querySelectorAll('.tl-cue').length,
        cleanup: [...document.querySelectorAll('.cap-card .btn.sm')].map(b => b.textContent.trim()).find(t => t.includes('corte')),
      };
    `);
    console.log('legendas:', JSON.stringify(r1));
    // revisão de cortes: tipos, atalhos A/R e marcas na timeline
    const review = await js(`
      const types = [...document.querySelectorAll('.cut-item .cut-badge')].map(x => x.textContent);
      const marks = document.querySelectorAll('.tl-cut').length;
      const summary0 = document.querySelector('.cut-summary span').textContent;
      const list = document.querySelector('.cut-list'); list.focus();
      const restartIdx = [...document.querySelectorAll('.cut-item')].findIndex(x => x.classList.contains('cut-restart'));
      [...document.querySelectorAll('.cut-item')][restartIdx].click(); await wait(100);
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); await wait(150);
      const summary1 = document.querySelector('.cut-summary span').textContent;
      [...document.querySelectorAll('.cut-item')][0].click(); await wait(100);
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); await wait(150);
      const summary2 = document.querySelector('.cut-summary span').textContent;
      return { types, marks, summary0, summary1, summary2, clipsStill: document.querySelectorAll('.tl-clip').length };
    `);
    console.log('revisão:', JSON.stringify(review));
    await shot(win, 'kortin-cortes-sugeridos');
    // posiciona em 1,5 s para ver a legenda com destaque na palavra
    await js(`document.querySelectorAll('.cap-item')[0].click(); await wait(200);`);
    await js(`
      const ruler = document.querySelector('.tl-ruler'); const r = ruler.getBoundingClientRect();
      ruler.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 16 + 1.5 * 40, clientY: r.top + 5, button: 0 }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await wait(400);
    `);
    await shot(win, 'kortin-legenda');
    // edita a primeira legenda
    const edited = await js(`
      document.querySelectorAll('.cap-edit')[0].click(); await wait(150);
      const inp = document.querySelector('.cap-input');
      inp.value = 'Oi, tudo bem?'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.blur(); await wait(300);
      return document.querySelectorAll('.cap-text')[0].textContent;
    `);
    console.log('editada:', edited);
    // limpa a fala
    const before = await js(`return document.querySelector('.timecode').textContent;`);
    await click('.cap-card .btn.sm', 'Aplicar');
    await wait(400);
    const after = await js(`return { time: document.querySelector('.timecode').textContent, clips: document.querySelectorAll('.tl-clip').length, cues: document.querySelectorAll('.cap-item').length };`);
    console.log('limpeza:', before, '→', JSON.stringify(after));
    await shot(win, 'kortin-legenda-limpa');
    // exporta com legenda
    await click('.topbar-right .btn.primary', 'Exportar');
    await shot(win, 'kortin-exportar-legenda');
    await click('.modal .btn.primary', 'exportar');
    for (let i = 0; i < 60; i++) {
      const pending = await js(`return document.querySelectorAll('.queue-item.running, .queue-item.queued').length || (document.querySelector('.queue-pill')?.textContent.includes('Exportando') ? 1 : 0);`);
      if (!pending) break;
      await wait(1000);
    }
    await wait(500);
    console.log('exportados:', fs.readdirSync(exportDir).join(', '));
  } else if (mode === 'mover') {
    await js(`document.querySelector('.welcome') && [...document.querySelectorAll('.welcome button')].find(b => b.textContent.includes('Explorar')).click(); await wait(300);`);
    const before = await js(`return { dialog: !!document.querySelector('.relink'), items: [...document.querySelectorAll('.relink-list strong')].map(x => x.textContent) };`);
    console.log('diálogo:', JSON.stringify(before));
    await shot(win, 'kortin-arquivos-nao-encontrados');
    await click('.relink .btn', 'Procurar');
    await wait(800);
    const mid = await js(`return { note: document.querySelector('.relink-note')?.textContent, action: document.querySelector('.relink .modal-actions .btn.primary').textContent };`);
    console.log('após procurar:', JSON.stringify(mid));
    await shot(win, 'kortin-arquivos-encontrados');
    await click('.relink .modal-actions .btn.primary');
    await wait(2500);
    const after = await js(`return { clips: document.querySelectorAll('.tl-clip').length, toast: document.querySelector('.toast')?.innerText };`);
    console.log('projeto aberto:', JSON.stringify(after));
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

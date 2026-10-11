// Informações do app e atualização.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, clipboard, ipcMain, shell } = require('electron');
const log = require('../core/logger');
const updater = require('../services/updater');
const { handle } = require('./handle');

/** "Windows 11 (build 22631)": o Windows 11 ainda se identifica como versão 10.0, só o build muda. */
function systemName() {
  if (process.platform !== 'win32') return `${os.type()} ${os.release()}`;
  const build = Number(os.release().split('.')[2]) || 0;
  return `Windows ${build >= 22000 ? '11' : '10'} (build ${build})`;
}

function register(ctx) {
  handle('app:version', async () => app.getVersion());
  handle('update:install', async () => updater.install());
  // Diagnóstico para o beta: só dados do computador e do app (sem nomes de arquivos, sem caminhos).
  // Copiado pelo processo principal (a interface não tem permissão de área de transferência).
  handle('app:copyDiagnostics', async () => {
    const VENDORS = { 0x10de: 'NVIDIA', 0x8086: 'Intel', 0x1002: 'AMD', 0x1022: 'AMD' };
    let gpus = 'não identificada';
    try {
      const info = await app.getGPUInfo('basic');
      const list = (info.gpuDevice || []).map((g) => `${VENDORS[g.vendorId] || `fabricante 0x${g.vendorId.toString(16)}`}${g.active ? ' (em uso)' : ''}`);
      if (list.length) gpus = list.join(', ');
    } catch { /* sem informação de GPU */ }
    let encoders = 'nenhuma (usa o processador)';
    try {
      const hw = await require('../engine').detectHardwareEncoders();
      if (hw.length) encoders = hw.map((h) => h.label).join(', ');
    } catch { /* teste falhou */ }
    let models = '—';
    try {
      const stt = require('../transcribe');
      const st = stt.modelStatus(ctx.modelsDir());
      models = Object.values(st).map((m) => `${m.label}: ${m.installed ? 'instalado' : 'não baixado'}`).join(' · ');
      if (!stt.isAvailable()) models = `componente de legenda ausente · ${models}`;
    } catch { /* sem legenda */ }
    const cpus = os.cpus();
    const text = [
      `Kortin ${require('../../package.json').version} (${app.isPackaged ? 'instalado' : 'desenvolvimento'})`,
      `Sistema: ${systemName()} ${os.arch()}`,
      `Processador: ${cpus[0]?.model?.trim() || '?'} · ${cpus.length} núcleos`,
      `Memória: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB (livre agora: ${(os.freemem() / 1024 ** 3).toFixed(1)} GB)`,
      `Placa de vídeo: ${gpus}`,
      `Aceleração na exportação: ${encoders}`,
      `Legenda: ${models}`,
    ].join('\n');
    clipboard.writeText(text);
    return text;
  });

  // Registros (para quem quiser mandar junto do relato): abre a pasta, o usuário escolhe se envia
  handle('app:openLogs', async () => {
    const file = log.file;
    if (file && fs.existsSync(file)) shell.showItemInFolder(file);
    else await shell.openPath(path.join(app.getPath('userData'), 'logs'));
    return true;
  });

  // Pasta fixa (nunca vem do renderer): licenças e oferta de código-fonte dos componentes de terceiros
  handle('app:openLicenses', async () => {
    const dir = app.isPackaged ? path.join(process.resourcesPath, 'licenses') : path.join(__dirname, '..', '..', 'licenses');
    const file = path.join(dir, 'AVISOS-DE-TERCEIROS.txt');
    const err = await shell.openPath(fs.existsSync(file) ? file : dir);
    return !err;
  });
  ipcMain.on('app:dirty', (_e, dirty, title) => {
    ctx.state.isDirty = !!dirty;
    const win = ctx.window();
    if (win && typeof title === 'string') win.setTitle(title.slice(0, 200));
  });
}

module.exports = { register };

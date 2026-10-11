// Guarda de regressão: toda vez que um campo novo é adicionado ao clipe (zoom, vignette, hdr...),
// ele precisa aparecer em 3 lugares — o modelo (security.validateClip), o salvar/abrir projeto
// (timeline.serializeProject/restoreClips) e a tela de exportação real (ExportDialog.jsx). Faltar
// no terceiro é o bug que já aconteceu duas vezes nesta sessão (zoom/vignette na v0.7.8, hdr aqui):
// o recurso funciona no motor e na prévia, mas nenhuma exportação feita pela interface o usa.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { require } from './_require';

const { validateExportJob, Grants } = require('../../electron/core/security');

describe('ExportDialog.jsx envia todos os campos de clipe validados pelo motor', () => {
  it('cada campo que validateClip aceita aparece no snapshot da tela de exportação', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/components/ExportDialog.jsx'), 'utf8');
    const match = /const snapshot = clips\.map\(\(\{([\s\S]*?)\}\) => \(\{/.exec(source);
    expect(match, 'não achei a montagem do snapshot em ExportDialog.jsx — o arquivo mudou de formato?').toBeTruthy();
    const destructured = new Set(match[1].split(',').map((s) => s.trim()).filter(Boolean));

    // campos que o clipe validado devolve — usamos a saída real de validateExportJob como fonte
    // da verdade (o mesmo validador que roda no processo principal), não uma lista mantida à mão.
    const video = path.resolve('/u/v.mp4');
    const output = path.resolve('/u/out.mp4');
    const grants = new Grants();
    grants.allowMedia(video);
    grants.allowOutput(output);
    const result = validateExportJob(
      { clips: [{ path: video, inPoint: 0, outPoint: 1, hasAudio: true, volume: 1 }], options: { width: 1080, height: 1920, output } },
      grants
    );
    const fieldsValidatedClipHas = Object.keys(result.clips[0]);
    for (const field of fieldsValidatedClipHas) {
      expect(destructured.has(field), `campo "${field}" existe no clipe validado mas não é enviado pela tela de exportação`).toBe(true);
    }
  });
});

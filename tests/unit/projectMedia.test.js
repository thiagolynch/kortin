import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { require } from './_require';
import { durationMismatches, remapProjectPaths } from '../../src/lib/timeline';

const { withRelativePaths, resolveMedia, findByName, remapPaths } = require('../../electron/services/projectMedia');

const dirs = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kortin-pm-'));
  dirs.push(root);
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), 'x');
  }
  return root;
}
const project = (clips, transcripts) => ({ app: 'kortin', version: 4, clips, transcripts });

describe('projetos portáteis', () => {
  it('salva caminho relativo e reabre depois de mover a pasta inteira', () => {
    const a = tree(['Projeto/meu.kortin', 'Projeto/brutos/aula.mp4']);
    const oldFile = path.join(a, 'Projeto', 'meu.kortin');
    const oldVideo = path.join(a, 'Projeto', 'brutos', 'aula.mp4');
    const saved = withRelativePaths(project([{ path: oldVideo, duration: 10 }], { [oldVideo]: { words: [] } }), oldFile);
    expect(saved.clips[0].rel).toBe('brutos/aula.mp4');

    // "outro PC": a pasta foi para outro lugar e o caminho absoluto antigo não existe mais
    const b = tree(['Movido/meu.kortin', 'Movido/brutos/aula.mp4']);
    const newFile = path.join(b, 'Movido', 'meu.kortin');
    fs.rmSync(path.join(a, 'Projeto'), { recursive: true });
    const res = resolveMedia(saved, newFile);
    const expected = path.join(b, 'Movido', 'brutos', 'aula.mp4');
    expect(res.missing).toEqual([]);
    expect(res.relinked).toBe(1);
    expect(res.data.clips[0].path).toBe(expected);
    expect(Object.keys(res.data.transcripts)).toEqual([expected]); // a transcrição acompanha
  });

  it('acha pelo nome na pasta do projeto quando tudo foi copiado junto', () => {
    const b = tree(['p/meu.kortin', 'p/aula.mp4']);
    const res = resolveMedia(project([{ path: path.resolve('/nao/existe/aula.mp4') }]), path.join(b, 'p', 'meu.kortin'));
    expect(res.data.clips[0].path).toBe(path.join(b, 'p', 'aula.mp4'));
  });

  it('relativo malicioso apontando para pasta de rede é ignorado', () => {
    const b = tree(['p/meu.kortin']);
    const evil = project([{ path: path.resolve('/x/a.mp4'), rel: '//atacante/share/a.mp4' }]);
    const res = resolveMedia(evil, path.join(b, 'p', 'meu.kortin'), () => true);
    expect(res.data.clips[0].path).toBe(path.resolve('/x/a.mp4'));
    const unc = project([{ path: '\\\\atacante\\share\\a.mp4' }]);
    expect(resolveMedia(unc, null, () => true).missing).toHaveLength(1);
  });

  it('o que não achar vai para a lista de ausentes, uma vez por arquivo', () => {
    const p = path.resolve('/sumiu/a.mp4');
    const res = resolveMedia(project([{ path: p, duration: 5 }, { path: p, duration: 5 }]), null, () => false);
    expect(res.missing).toEqual([{ path: p, name: 'a.mp4', duration: 5 }]);
  });

  it('busca por nome numa pasta, sem diferenciar maiúsculas, e respeita o limite', async () => {
    const root = tree(['a/b/c/Aula.MP4', 'node_modules/x/aula2.mp4', 'outra.mp4']);
    const { found, complete } = await findByName(root, ['aula.mp4', 'aula2.mp4', 'outra.mp4']);
    expect(found['aula.mp4']).toBe(path.join(root, 'a', 'b', 'c', 'Aula.MP4'));
    expect(found['aula2.mp4']).toBeUndefined(); // node_modules é pulado
    expect(complete).toBe(true);
    const limited = await findByName(root, ['aula.mp4'], { maxEntries: 2 });
    expect(limited.complete).toBe(false);
  });

  it('remapeamento do renderer e do processo principal são equivalentes', () => {
    const d = project([{ path: '/a.mp4' }, { path: '/b.mp4' }], { '/a.mp4': 1, '/b.mp4': 2 });
    expect(remapProjectPaths(d, { '/a.mp4': '/z.mp4' })).toEqual(remapPaths(d, { '/a.mp4': '/z.mp4' }));
  });

  it('avisa quando o vídeo achado tem outra duração', () => {
    expect(durationMismatches([{ path: '/a', duration: 10 }, { path: '/b', duration: 3 }], { '/a': { duration: 10.2 }, '/b': { duration: 30 } })).toEqual(['/b']);
  });
});

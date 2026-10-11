import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { require } from './_require';

const { sha256File, ensureVerified, markerPath } = require('../../electron/services/stt/integrity');
const stt = require('../../electron/services/stt/transcribe');

const dirs = [];
const tmpdir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kortin-int-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

const content = crypto.randomBytes(3 * 1024 * 1024 + 7);
const spec = { bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };

describe('integridade dos modelos', () => {
  it('sha256File confere com o hash em memória', async () => {
    const f = path.join(tmpdir(), 'm.bin');
    fs.writeFileSync(f, content);
    expect(await sha256File(f)).toBe(spec.sha256);
  });

  it('modelo correto é aceito e marcado; a marca vale só para o mesmo arquivo', async () => {
    const f = path.join(tmpdir(), 'm.bin');
    fs.writeFileSync(f, content);
    await ensureVerified(f, spec);
    expect(fs.existsSync(markerPath(f))).toBe(true);
    // adulterado depois de marcado (tamanho igual, conteúdo diferente, data diferente) → apagado
    const evil = Buffer.from(content);
    evil[100] ^= 0xff;
    fs.writeFileSync(f, evil);
    fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
    await expect(ensureVerified(f, spec)).rejects.toThrow(/apagado/);
    expect(fs.existsSync(f)).toBe(false);
  });

  it('download: aceita o arquivo íntegro e recusa um adulterado, sem deixar lixo', async () => {
    const dir = tmpdir();
    const original = { ...stt.MODELS.rapido };
    Object.assign(stt.MODELS.rapido, spec);
    const fakeFetch = (bytes) => async () => new Response(new Blob([bytes]).stream(), { status: 200 });
    try {
      await stt.downloadModel(dir, 'rapido', null, fakeFetch(content));
      expect(fs.statSync(path.join(dir, original.file)).size).toBe(content.length);
      fs.rmSync(path.join(dir, original.file));
      fs.rmSync(markerPath(path.join(dir, original.file)));

      const evil = Buffer.from(content);
      evil[0] ^= 1;
      await expect(stt.downloadModel(dir, 'rapido', null, fakeFetch(evil))).rejects.toThrow(/SHA-256/);
      await expect(stt.downloadModel(dir, 'rapido', null, fakeFetch(Buffer.concat([content, Buffer.alloc(10)])))).rejects.toThrow(/maior/);
      expect(fs.readdirSync(dir).filter((f) => !f.startsWith('.'))).toEqual([]);
    } finally {
      Object.assign(stt.MODELS.rapido, original);
    }
  });

  it('URLs apontam para uma revisão fixa, nunca para main', () => {
    for (const key of Object.keys(stt.MODELS)) {
      expect(stt.modelUrl(key)).toMatch(/\/resolve\/[0-9a-f]{40}\//);
      expect(stt.MODELS[key].sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

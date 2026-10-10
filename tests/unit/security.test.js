import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { require } from './_require';

const { Grants, ValidationError, assertLocalPath, validateExportJob } = require('../../electron/core/security');

const VIDEO = '/home/u/videos/a.mp4';
const OUT = '/home/u/export/final.mp4';

function setup() {
  const g = new Grants();
  g.allowMedia(VIDEO);
  g.allowOutput(OUT);
  return g;
}

const job = (over = {}, clipOver = {}) => ({
  clips: [{ path: VIDEO, inPoint: 0, outPoint: 5, speed: 1, hasAudio: true, volume: 1, ...clipOver }],
  options: { width: 1080, height: 1920, fit: 'blur', fps: 30, crf: 20, preset: 'veryfast', encoder: 'libx264', output: OUT, ...over },
});

const rejects = (fn, re) => expect(fn).toThrow(re ?? ValidationError);

describe('caminhos', () => {
  it('recusa pasta de rede (vazamento de hash NTLM)', () => {
    rejects(() => assertLocalPath('\\\\atacante\\share\\v.mp4'), /rede/);
    rejects(() => assertLocalPath('//atacante/share/v.mp4'), /rede/);
  });
  it('recusa relativo, NUL e caminho gigante', () => {
    rejects(() => assertLocalPath('videos/a.mp4'));
    rejects(() => assertLocalPath('/a\0.mp4'));
    rejects(() => assertLocalPath(`/${'a'.repeat(5000)}`));
  });
});

describe('validateExportJob', () => {
  it('aceita um trabalho válido', () => {
    expect(validateExportJob(job(), setup()).options.output).toBe(OUT);
  });
  it('bloqueia injeção de filtergraph por número em texto', () => {
    rejects(() => validateExportJob(job({ width: '1080,movie=/etc/passwd' }), setup()));
    rejects(() => validateExportJob(job({}, { volume: '1,movie=x' }), setup()));
    rejects(() => validateExportJob(job({}, { inPoint: Infinity }), setup()));
  });
  it('só aceita tamanhos e opções conhecidos', () => {
    rejects(() => validateExportJob(job({ width: 1000, height: 1000 }), setup()));
    rejects(() => validateExportJob(job({ preset: 'veryfast -f null' }), setup()));
    rejects(() => validateExportJob(job({ encoder: 'libx265' }), setup()));
    rejects(() => validateExportJob(job({}, { speed: 1.1 }), setup()));
  });
  it('saída precisa ter sido escolhida pelo usuário', () => {
    rejects(() => validateExportJob(job({ output: '/home/u/.bashrc.mp4' }), setup()), /Escolha/);
    rejects(() => validateExportJob(job({ output: '/home/u/export/final.exe' }), setup()));
  });
  it('vídeo não autorizado é recusado', () => {
    rejects(() => validateExportJob(job({}, { path: '/etc/shadow.mp4' }), setup()), /autorizado/);
  });
  it('não deixa sobrescrever um vídeo de entrada', () => {
    const g = setup();
    g.allowOutputDir('/home/u/videos');
    rejects(() => validateExportJob(job({ output: VIDEO }), g), /substituir/);
  });
  it('fuzz: entrada arbitrária só gera ValidationError (nunca TypeError)', () => {
    fc.assert(fc.property(fc.anything(), fc.anything(), (clips, options) => {
      try {
        validateExportJob({ clips, options }, setup());
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
      }
    }), { numRuns: 500 });
    fc.assert(fc.property(fc.array(fc.dictionary(fc.constantFrom('path', 'inPoint', 'outPoint', 'speed', 'volume', 'fadeIn'), fc.anything())), (clips) => {
      try {
        validateExportJob({ clips, options: job().options }, setup());
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
      }
    }), { numRuns: 500 });
  });
});

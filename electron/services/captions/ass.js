// Gera o arquivo de legenda (.ass) que o FFmpeg queima no vídeo exportado.
// As legendas chegam prontas da interface: [{ start, end, words: [{ start, end, text }] }] em segundos da linha do tempo.
const fs = require('fs');
const path = require('path');

let fontsDir = path.join(__dirname, '..', '..', '..', 'assets', 'fonts').replace('app.asar', 'app.asar.unpacked');
const setFontsDir = (dir) => { fontsDir = dir; };
const getFontsDir = () => fontsDir;

// Estilos (os mesmos nomes e cores da prévia na interface)
const PRESETS = {
  classica: { font: 'Montserrat', bold: true, size: 0.05, primary: 'FFFFFF', outline: '000000', bord: 0.11 },
  destaque: { font: 'Montserrat ExtraBold', bold: false, size: 0.058, primary: 'FFFFFF', outline: '000000', bord: 0.12, highlight: 'FFE14D', upper: true },
  caixa: { font: 'Montserrat', bold: true, size: 0.046, primary: 'FFFFFF', box: '000000', boxAlpha: 0x50, bord: 0.32 },
  neon: { font: 'Montserrat ExtraBold', bold: false, size: 0.054, primary: 'FFFFFF', outline: '22D3EE', bord: 0.09, blur: 5, highlight: 'FF4FD8', upper: true },
};

const SIZES = { p: 0.8, m: 1, g: 1.25 };

// Títulos (camada de texto livre). Mesmos nomes e cores da prévia (TitleOverlay).
const TITLE_PRESETS = {
  titulo: { font: 'Montserrat ExtraBold', bold: false, size: 0.085, primary: 'FFFFFF', outline: '000000', bord: 0.06, shadow: 3 },
  destaque: { font: 'Montserrat ExtraBold', bold: false, size: 0.055, primary: '111111', box: 'FFE14D', boxAlpha: 0x00, bord: 0.35 },
  rodape: { font: 'Montserrat', bold: true, size: 0.036, primary: 'FFFFFF', box: '0B0D12', boxAlpha: 0x40, bord: 0.45 },
};
const TITLE_FADE_MS = 200;

/** RRGGBB → &HAABBGGRR do ASS */
function assColor(hex, alpha = 0) {
  const h = hex.replace('#', '');
  const a = alpha.toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assTime(t) {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

// texto do usuário: sem barra invertida (\N, \h…), sem chaves (tags de estilo) e sem caracteres de controle
// eslint-disable-next-line no-control-regex
const escapeText = (t) => String(t).replace(/\\/g, '/').replace(/[{}]/g, '').replace(/[\u0000-\u001f\u007f]+/g, ' ');

/**
 * cues: legendas na linha do tempo · settings: { style, position (0 a 1, centro vertical), size, uppercase }
 */
function titleStyleLine(name, t, W, H) {
  const fontSize = Math.round(t.size * Math.sqrt(W * H));
  const bord = Math.max(1, Math.round(fontSize * t.bord));
  const outline = t.box ? assColor(t.box, t.boxAlpha) : assColor(t.outline || '000000');
  const back = t.box ? assColor(t.box, t.boxAlpha) : assColor('000000', 0x60);
  const margin = Math.round(W * 0.06);
  return `Style: ${[name, t.font, fontSize, assColor(t.primary), assColor(t.primary), outline, back, t.bold ? -1 : 0, 0, 0, 0, 100, 100, 0, 0, t.box ? 3 : 1, bord, t.shadow || 0, 5, margin, margin, 0, 1].join(',')}`;
}

/** Eventos dos títulos: linhas já quebradas pela interface, com entrada e saída suaves. */
function titleEvents(titles, W, H) {
  return titles
    .filter((t) => t.end > t.start && t.lines.some((l) => l.trim()))
    .map((t) => {
      const x = Math.round(W / 2);
      const y = Math.round(H * Math.min(0.95, Math.max(0.05, t.position ?? 0.5)));
      const text = t.lines.map(escapeText).join('\\N');
      // camada 1: títulos ficam por cima da legenda
      return `Dialogue: 1,${assTime(t.start)},${assTime(t.end)},T_${t.style},,0,0,0,,{\\an5\\pos(${x},${y})\\fad(${TITLE_FADE_MS},${TITLE_FADE_MS})}${text}`;
    });
}

function buildAss(cues, settings, W, H, titles = []) {
  const p = PRESETS[settings.style] || PRESETS.classica;
  const fontSize = Math.round(p.size * Math.sqrt(W * H) * (SIZES[settings.size] || 1));
  const bord = Math.max(1, Math.round(fontSize * p.bord));
  const margin = Math.round(W * 0.08);
  const x = Math.round(W / 2);
  const y = Math.round(H * Math.min(0.92, Math.max(0.08, settings.position ?? 0.72)));
  const upper = settings.uppercase ?? p.upper ?? false;
  const fmt = (t) => escapeText(upper ? t.toLocaleUpperCase('pt-BR') : t);

  const outline = p.box ? assColor(p.box, p.boxAlpha) : assColor(p.outline || '000000');
  const back = p.box ? assColor(p.box, p.boxAlpha) : assColor('000000', 0x80);
  const style = [
    'K', p.font, fontSize, assColor(p.primary), assColor(p.primary), outline, back,
    p.bold ? -1 : 0, 0, 0, 0, 100, 100, 0, 0, p.box ? 3 : 1, bord, 0, 5, margin, margin, 0, 1,
  ].join(',');

  const lead = `{\\an5\\pos(${x},${y})${p.blur ? `\\blur${p.blur}` : ''}}`;
  const hl = p.highlight ? assColor(p.highlight) : null;
  const base = assColor(p.primary);
  const lines = [];

  for (const cue of cues) {
    if (!cue.words?.length || cue.end <= cue.start) continue;
    if (!hl) {
      const text = cue.words.map((w) => fmt(w.text)).join(' ');
      lines.push(`Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},K,,0,0,0,,${lead}${text}`);
      continue;
    }
    // Destaque palavra a palavra: um evento por palavra, com a palavra da vez colorida
    cue.words.forEach((w, i) => {
      const from = i === 0 ? cue.start : w.start;
      const to = i === cue.words.length - 1 ? cue.end : cue.words[i + 1].start;
      if (to <= from) return;
      const text = cue.words
        .map((x, j) => (j === i ? `{\\c${hl}\\fscx108\\fscy108}${fmt(x.text)}{\\c${base}\\fscx100\\fscy100}` : fmt(x.text)))
        .join(' ');
      lines.push(`Dialogue: 0,${assTime(from)},${assTime(to)},K,,0,0,0,,${lead}${text}`);
    });
  }

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${style}`,
    ...Object.entries(TITLE_PRESETS).map(([name, t]) => titleStyleLine(`T_${name}`, t, W, H)),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines,
    ...titleEvents(titles, W, H),
    '',
  ].join('\n');
}

/** Prepara uma pasta de trabalho com o .ass e as fontes (o FFmpeg roda com cwd nela, sem caminhos complicados). */
function prepareCaptionDir(workDir, cues, settings, W, H, titles = []) {
  fs.mkdirSync(path.join(workDir, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(fontsDir)) {
    if (f.endsWith('.ttf')) fs.copyFileSync(path.join(fontsDir, f), path.join(workDir, 'fonts', f));
  }
  fs.writeFileSync(path.join(workDir, 'legenda.ass'), buildAss(cues, settings, W, H, titles), 'utf8');
  return 'ass=legenda.ass:fontsdir=fonts';
}

module.exports = { PRESETS, TITLE_PRESETS, buildAss, prepareCaptionDir, setFontsDir, getFontsDir, assTime };

// Гитарные аппликатуры: словарь открытых аккордов + баррэ от форм Ми и Ля.
// Формат: массив из 6 чисел, струны 6→1 (E A D G B e). -1 = глухая, 0 = открытая.
import { parseChord, noteName } from './chords.js';

const X = -1;

// Открытые аккорды (наиболее привычные пальцовки)
const OPEN = {
  'C': [X, 3, 2, 0, 1, 0], 'C7': [X, 3, 2, 3, 1, 0], 'Cmaj7': [X, 3, 2, 0, 0, 0],
  'Cadd9': [X, 3, 2, 0, 3, 0], 'Csus2': [X, 3, 0, 0, 1, X], 'Csus4': [X, 3, 3, 0, 1, 1],
  'D': [X, X, 0, 2, 3, 2], 'Dm': [X, X, 0, 2, 3, 1], 'D7': [X, X, 0, 2, 1, 2],
  'Dm7': [X, X, 0, 2, 1, 1], 'Dmaj7': [X, X, 0, 2, 2, 2], 'Dsus2': [X, X, 0, 2, 3, 0],
  'Dsus4': [X, X, 0, 2, 3, 3], 'D6': [X, X, 0, 2, 0, 2], 'Dm6': [X, X, 0, 2, 0, 1],
  'E': [0, 2, 2, 1, 0, 0], 'Em': [0, 2, 2, 0, 0, 0], 'E7': [0, 2, 0, 1, 0, 0],
  'Em7': [0, 2, 0, 0, 0, 0], 'Emaj7': [0, 2, 1, 1, 0, 0], 'Esus4': [0, 2, 2, 2, 0, 0],
  'Em6': [0, 2, 2, 0, 2, 0], 'E6': [0, 2, 2, 1, 2, 0],
  'G': [3, 2, 0, 0, 0, 3], 'G7': [3, 2, 0, 0, 0, 1], 'Gmaj7': [3, 2, 0, 0, 0, 2],
  'G6': [3, 2, 0, 0, 0, 0], 'Gsus4': [3, 3, 0, 0, 1, 3],
  'A': [X, 0, 2, 2, 2, 0], 'Am': [X, 0, 2, 2, 1, 0], 'A7': [X, 0, 2, 0, 2, 0],
  'Am7': [X, 0, 2, 0, 1, 0], 'Amaj7': [X, 0, 2, 1, 2, 0], 'Asus2': [X, 0, 2, 2, 0, 0],
  'Asus4': [X, 0, 2, 2, 3, 0], 'A6': [X, 0, 2, 2, 2, 2], 'Am6': [X, 0, 2, 2, 1, 2],
  'B7': [X, 2, 1, 2, 0, 2], 'Fmaj7': [X, X, 3, 2, 1, 0],
};

// Формы для баррэ: смещения от лада баррэ
const E_SHAPE = {
  '': [0, 2, 2, 1, 0, 0], 'm': [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0],
  'm7': [0, 2, 0, 0, 0, 0], 'maj7': [0, 2, 1, 1, 0, 0], 'sus4': [0, 2, 2, 2, 0, 0],
  '6': [0, 2, 2, 1, 2, 0], 'm6': [0, 2, 2, 0, 2, 0], '7sus4': [0, 2, 0, 2, 0, 0],
};
const A_SHAPE = {
  '': [X, 0, 2, 2, 2, 0], 'm': [X, 0, 2, 2, 1, 0], '7': [X, 0, 2, 0, 2, 0],
  'm7': [X, 0, 2, 0, 1, 0], 'maj7': [X, 0, 2, 1, 2, 0], 'sus2': [X, 0, 2, 2, 0, 0],
  'sus4': [X, 0, 2, 2, 3, 0], 'dim': [X, 0, 1, 2, 1, X], 'dim7': [X, 0, 1, 2, 1, 2],
  'm7b5': [X, 0, 1, 0, 1, X], '6': [X, 0, 2, 2, 2, 2], 'm6': [X, 0, 2, 2, 1, 2],
  'aug': [X, 0, 3, 2, 2, 1], 'add9': [X, 0, 2, 4, 2, 0], '7sus4': [X, 0, 2, 0, 3, 0],
};

// Приводим суффикс к ключу формы
function normSuffix(s) {
  s = s.replace(/[()]/g, '');
  const map = { 'min': 'm', 'M7': 'maj7', 'mi': 'm', 'maj': '', 'M': '', '°': 'dim', '+': 'aug', 'ø': 'm7b5', 'm7-5': 'm7b5', '-': 'm', 'sus': 'sus4', '2': 'sus2', '4': 'sus4', 'mmaj7': 'm7' };
  if (map[s] != null) return map[s];
  if (/^7\+$/.test(s)) return '7';
  return s;
}

const cache = new Map();

export function getFingering(chordStr) {
  if (cache.has(chordStr)) return cache.get(chordStr);
  const c = parseChord(chordStr);
  let res = null;
  if (c) {
    const suffix = normSuffix(c.suffix);
    const name = noteName(c.root) + suffix;
    const flatName = noteName(c.root, true) + suffix;
    if (OPEN[name] || OPEN[flatName]) {
      res = { frets: OPEN[name] || OPEN[flatName], name };
    } else {
      const cands = [];
      const eFret = (c.root - 4 + 12) % 12; // от ми
      const aFret = (c.root - 9 + 12) % 12; // от ля
      let es = E_SHAPE[suffix], as = A_SHAPE[suffix];
      // запасной вариант: неизвестный хвост → по наличию «m» и «7»
      if (!es && !as) {
        const k = (/^m(?!aj)/.test(suffix) ? 'm' : '') + (/7/.test(suffix) ? '7' : '');
        es = E_SHAPE[k]; as = A_SHAPE[k];
      }
      if (es) cands.push({ frets: es.map((d) => (d < 0 ? X : d + eFret)), base: eFret });
      if (as) cands.push({ frets: as.map((d) => (d < 0 ? X : d + aFret)), base: aFret });
      // при ладе 0 баррэ не нужно; выбираем вариант пониже по грифу
      cands.sort((a, b) => Math.max(...a.frets) - Math.max(...b.frets));
      if (cands[0]) res = { frets: cands[0].frets, name, barre: cands[0].base > 0 ? cands[0].base : null };
    }
  }
  cache.set(chordStr, res);
  return res;
}

// Рисуем SVG схемы
export function chordSVG(chordStr, size = 1) {
  const f = getFingering(chordStr);
  const W = 104 * size, H = 124 * size;
  if (!f) {
    return `<svg class="diagram" viewBox="0 0 104 124" width="${W}" height="${H}" role="img" aria-label="Схемы нет"><text x="52" y="70" text-anchor="middle" class="dg-none">нет схемы</text></svg>`;
  }
  const frets = f.frets;
  const played = frets.filter((x) => x > 0);
  const min = played.length ? Math.min(...played) : 1;
  const max = played.length ? Math.max(...played) : 1;
  const start = max <= 4 ? 1 : min; // первый показываемый лад
  const x0 = 18, y0 = 22, sx = 14, sy = 20, rows = 4;
  let g = '';
  // лады
  for (let r = 0; r <= rows; r++) {
    const y = y0 + r * sy;
    g += `<line x1="${x0}" y1="${y}" x2="${x0 + 5 * sx}" y2="${y}" class="${r === 0 && start === 1 ? 'dg-nut' : 'dg-fret'}"/>`;
  }
  // струны
  for (let s = 0; s < 6; s++) {
    const x = x0 + s * sx;
    g += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + rows * sy}" class="dg-string"/>`;
  }
  if (start > 1) g += `<text x="${x0 - 6}" y="${y0 + sy / 2 + 4}" text-anchor="end" class="dg-fretnum">${start}</text>`;
  // баррэ
  if (f.barre) {
    const bf = f.barre - start;
    const strings = frets.map((v, i) => (v === f.barre ? i : -1)).filter((i) => i >= 0);
    if (strings.length >= 2) {
      const a = Math.min(...strings), b = Math.max(...strings);
      const y = y0 + bf * sy + sy / 2;
      g += `<rect x="${x0 + a * sx - 5}" y="${y - 5}" width="${(b - a) * sx + 10}" height="10" rx="5" class="dg-dot"/>`;
    }
  }
  frets.forEach((v, s) => {
    const x = x0 + s * sx;
    if (v === X) g += `<text x="${x}" y="${y0 - 7}" text-anchor="middle" class="dg-mute">×</text>`;
    else if (v === 0) g += `<circle cx="${x}" cy="${y0 - 10}" r="3.6" class="dg-open"/>`;
    else {
      const y = y0 + (v - start) * sy + sy / 2;
      g += `<circle cx="${x}" cy="${y}" r="5.4" class="dg-dot"/>`;
    }
  });
  return `<svg class="diagram" viewBox="0 0 104 124" width="${W}" height="${H}" role="img" aria-label="Схема ${chordStr}">${g}</svg>`;
}

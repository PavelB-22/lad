// Разбор, распознавание и транспонирование аккордов.
// Русская нотация: H = си (B). Bb/B — тоже понимаем.

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

// Корень, «хвост» (m, 7, sus4, maj7 …) и бас после «/»
const CHORD_RE =
  /^([A-H])(#|b)?((?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|\d|b(?=\d)|#(?=\d)|\(|\)|-)*)(?:\/([A-H])(#|b)?)?$/;

export function parseChord(str) {
  const m = CHORD_RE.exec(str);
  if (!m) return null;
  const root = (BASE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const bass = m[4] != null ? (BASE[m[4]] + (m[5] === '#' ? 1 : m[5] === 'b' ? -1 : 0) + 12) % 12 : null;
  return { root, suffix: m[3] || '', bass, flat: m[2] === 'b' || m[5] === 'b' };
}

export const isChord = (s) => parseChord(s) !== null;

export function noteName(n, useFlats = false) {
  return (useFlats ? FLAT : SHARP)[((n % 12) + 12) % 12];
}

export function chordName(c, useFlats = false) {
  return noteName(c.root, useFlats) + c.suffix + (c.bass != null ? '/' + noteName(c.bass, useFlats) : '');
}

export function transposeChord(str, semis, useFlats = false) {
  const c = parseChord(str);
  if (!c) return str;
  return chordName(
    { root: c.root + semis, suffix: c.suffix, bass: c.bass == null ? null : c.bass + semis },
    useFlats
  );
}

// Мелкий мусор, который бывает в строках аккордов: такты, повторы, скобки
const FILLER_RE = /^(\||\|\||-+|x\d+|х\d+|\(x?\d+\)|\(|\)|\.\.\.|:|\/|%)$/i;

// Строка = строка аккордов, если все её слова — аккорды или «мусор» и есть хотя бы один аккорд
export function isChordLine(line) {
  const t = line.trim();
  if (!t) return false;
  const tokens = t.split(/\s+/);
  let chords = 0;
  for (const tok of tokens) {
    const clean = tok.replace(/^[(\[]+|[)\],]+$/g, '');
    if (isChord(clean)) chords++;
    else if (!FILLER_RE.test(tok)) return false;
  }
  return chords > 0;
}

// Использует ли песня бемоли (тогда и при транспонировании пишем бемоли)
export function prefersFlats(chordList) {
  let f = 0, s = 0;
  for (const ch of chordList) {
    if (/^[A-H]b/.test(ch)) f++;
    if (/^[A-H]#/.test(ch)) s++;
  }
  return f > s;
}

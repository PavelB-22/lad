// Превращает текст «аккорды над словами» в список строк для отрисовки.
// Понимает и формат ChordPro: «[Am]Слово [Dm]дальше».
import { isChordLine, isChord } from './chords.js';

// Тип строки: 'pair' (аккорды+текст), 'chords' (только аккорды), 'text', 'section' (Припев:, Куплет 1), 'empty'
const SECTION_RE = /^\s*\[?\s*(припев|куплет|проигрыш|вступление|бридж|кода|соло|intro|verse|chorus|bridge|outro|solo)(?=$|[\s\d:.\]()])[^\]]*\]?\s*:?\s*$/i;

// Позиции аккордов в строке: [{col, chord}]
function chordPositions(line) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line))) {
    const raw = m[0];
    const clean = raw.replace(/^[(\[]+|[)\],]+$/g, '');
    if (isChord(clean)) out.push({ col: m.index + raw.indexOf(clean), chord: clean });
  }
  return out;
}

// ChordPro-строку «[Am]При[Dm]вет» → пара строк (аккорды над текстом)
function chordProToPair(line) {
  let text = '';
  const chords = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0, m;
  while ((m = re.exec(line))) {
    text += line.slice(last, m.index);
    if (isChord(m[1].trim())) chords.push({ col: text.length, chord: m[1].trim() });
    last = re.lastIndex;
  }
  text += line.slice(last);
  return { chords, text };
}

// Режем текстовую строку на сегменты по позициям аккордов
export function segmentize(chords, text) {
  const segs = [];
  if (!chords.length) return [{ chord: null, text }];
  if (chords[0].col > 0) segs.push({ chord: null, text: text.slice(0, chords[0].col) });
  for (let i = 0; i < chords.length; i++) {
    const from = chords[i].col;
    const to = i + 1 < chords.length ? chords[i + 1].col : Infinity;
    segs.push({ chord: chords[i].chord, text: from < text.length ? text.slice(from, to === Infinity ? undefined : to) : '' });
  }
  // Склеиваем сегменты, где граница проходит внутри слова — чтобы слово не рвалось при переносе
  for (let i = 0; i < segs.length; i++) {
    const prev = segs[i - 1];
    segs[i].joinPrev = !!prev && /\S$/.test(prev.text) && /^\S/.test(segs[i].text);
  }
  return segs;
}

export function parseSong(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '');
    if (!line.trim()) { out.push({ type: 'empty' }); continue; }
    if (SECTION_RE.test(line)) { out.push({ type: 'section', text: line.trim().replace(/^\[|\]$/g, '') }); continue; }
    if (/\[[A-H][^\]]*\]/.test(line) && !isChordLine(line)) {
      const { chords, text } = chordProToPair(line);
      if (chords.length) { out.push({ type: 'pair', segs: segmentize(chords, text), text }); continue; }
    }
    if (isChordLine(line)) {
      const next = lines[i + 1];
      const chords = chordPositions(line);
      if (next != null && next.trim() && !isChordLine(next) && !SECTION_RE.test(next)) {
        const text = next.replace(/\s+$/, '');
        out.push({ type: 'pair', segs: segmentize(chords, text), text });
        i++;
      } else {
        out.push({ type: 'chords', chords });
      }
      continue;
    }
    out.push({ type: 'text', text: line });
  }
  // Убираем двойные пустые строки
  return out.filter((l, i, a) => !(l.type === 'empty' && a[i - 1]?.type === 'empty'));
}

// Все уникальные аккорды песни по порядку появления
export function songChords(parsed) {
  const seen = new Set();
  for (const l of parsed) {
    if (l.type === 'pair') l.segs.forEach((s) => s.chord && seen.add(s.chord));
    if (l.type === 'chords') l.chords.forEach((c) => seen.add(c.chord));
  }
  return [...seen];
}

export function hasChords(raw) {
  return songChords(parseSong(raw)).length > 0;
}

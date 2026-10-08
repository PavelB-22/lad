// Запуск: node tests/core.test.mjs
import assert from 'node:assert/strict';
import { parseChord, transposeChord, isChordLine } from '../js/chords.js';
import { parseSong, songChords } from '../js/parser.js';
import { getFingering } from '../js/diagrams.js';
import { DEMO_SONGS } from '../js/demo-songs.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('разбор аккордов', () => {
  for (const c of ['Am', 'C#m7', 'Bb', 'Hm', 'D/F#', 'Csus4', 'Gmaj7', 'Am7b5', 'E7(9)', 'F#dim7', 'Cadd9', 'A+'])
    assert.ok(parseChord(c), c);
  for (const w of ['Привет', 'Ah', 'Ax', 'Hello', 'am']) assert.equal(parseChord(w), null, w);
});

t('транспонирование', () => {
  assert.equal(transposeChord('Am', 2), 'Bm');
  assert.equal(transposeChord('Hm', 1), 'Cm');
  assert.equal(transposeChord('D/F#', -2), 'C/E');
  assert.equal(transposeChord('E7', 1, true), 'F7');
  assert.equal(transposeChord('A', 1, true), 'Bb');
  for (const c of ['Am', 'C#m7', 'Gsus4', 'D/F#']) assert.equal(transposeChord(transposeChord(c, 12), 0), transposeChord(c, 0));
});

t('строка аккордов', () => {
  assert.ok(isChordLine('Am      Dm   E'));
  assert.ok(isChordLine('| Am | Dm | x2'));
  assert.ok(!isChordLine('А я иду по Am'));
  assert.ok(!isChordLine('Во поле берёза стояла'));
});

t('парсер пар и выравнивание', () => {
  const p = parseSong('Am     Dm\nПривет мир\n\nТекст без аккордов');
  assert.equal(p[0].type, 'pair');
  assert.deepEqual(p[0].segs.map((s) => s.chord), ['Am', 'Dm']);
  assert.equal(p[0].segs[0].text, 'Привет ');
  assert.equal(p[0].segs[1].text, 'мир');
  assert.equal(p[2].type, 'text');
  // аккорд посреди слова → сегмент склеивается со словом
  const q = parseSong('  G\nКонечно')[0];
  assert.equal(q.segs[1].joinPrev, true);
});

t('ChordPro', () => {
  const p = parseSong('[Am]Ой, при [Dm]лужке');
  assert.equal(p[0].type, 'pair');
  assert.equal(p[0].text, 'Ой, при лужке');
});

t('аккорд длиннее строки текста', () => {
  const p = parseSong('Am        Dm     E\nКоротко');
  assert.equal(p[0].segs.length, 3);
  assert.equal(p[0].segs[2].text, '');
});

t('схемы есть для всех аккордов демо и транспонирований', () => {
  for (const s of DEMO_SONGS) for (const c of songChords(parseSong(s.text)))
    for (let k = 0; k < 12; k++) assert.ok(getFingering(transposeChord(c, k)), transposeChord(c, k));
  for (const c of ['F', 'Bm', 'F#m', 'C#m7', 'Bbmaj7', 'Ebsus4', 'G#dim', 'Hm'])
    assert.ok(getFingering(c), c);
  assert.deepEqual(getFingering('F').frets, [1, 3, 3, 2, 1, 1]);
  assert.deepEqual(getFingering('Bm').frets, [-1, 2, 4, 4, 3, 2]);
});

console.log(`\nВсе ${n} проверок прошли`);

import { buildIndex, locate, tokenize } from '../js/voice.js';
t('голос находит строку', () => {
  const lines = ['Во поле берёза стояла', 'Во поле кудрявая стояла', 'Люли люли стояла', 'Некому берёзу заломати', 'Некому кудряву заломати'];
  const idx = buildIndex(lines);
  assert.equal(locate(idx, tokenize('поле кудрявая'), 0).line, 1);
  assert.equal(locate(idx, tokenize('некому кудряво заломати'), 2).line, 4); // опечатка распознавания
  assert.equal(locate(idx, tokenize('берёзу заломать'), 0).line, 3);
  assert.equal(locate(idx, tokenize('ля'), 0), null); // одного слова мало
});
console.log('✓ голос — готово');
t('заголовки секций', () => {
  assert.equal(parseSong('Куплет 1:')[0].type, 'section');
  assert.equal(parseSong('Припев:')[0].type, 'section');
  assert.equal(parseSong('[Chorus]')[0].type, 'section');
  assert.equal(parseSong('Припевает соловей')[0].type, 'text');
});

// «Текст следует за голосом»: распознаём русскую речь и ищем, какую строку поют.

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const voiceSupported = !!SR;

export function normWord(w) {
  return w.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');
}

export function tokenize(text) {
  return String(text).split(/\s+/).map(normWord).filter((w) => w.length > 0);
}

function lev1(a, b) {
  // расстояние Левенштейна ≤ 1?
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function wordsMatch(a, b) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return true; // окончания часто путаются
  if (a.length >= 5 && b.length >= 5 && lev1(a, b)) return true;
  return false;
}

// Индекс слов песни: [{w, line}]
export function buildIndex(lines) {
  const idx = [];
  lines.forEach((text, line) => tokenize(text).forEach((w) => idx.push({ w, line })));
  return idx;
}

// Ищем позицию в песне, где последние услышанные слова совпадают лучше всего.
// cur — текущая позиция (индекс слова). Возвращает {pos, score} или null.
export function locate(index, heard, cur = 0) {
  const H = heard.slice(-6);
  if (H.length < 2 || !index.length) return null;
  let best = null;
  for (let p = 0; p < index.length; p++) {
    if (!wordsMatch(H[H.length - 1], index[p].w) && !(H.length > 2 && wordsMatch(H[H.length - 2], index[p].w))) continue;
    // идём назад по услышанному и по песне, допуская пропуски
    let score = 0, q = p, weight = 0;
    for (let h = H.length - 1; h >= 0 && q >= 0 && q > p - 10; h--) {
      for (let k = q; k >= Math.max(0, q - 2); k--) {
        if (wordsMatch(H[h], index[k].w)) { score++; weight += Math.min(H[h].length, 7); q = k - 1; break; }
      }
    }
    if (score < 2) continue;
    const dist = p - cur;
    // рядом и чуть впереди — бонус, далеко — штраф
    const near = dist >= -3 && dist <= 25 ? 3 : dist < -3 ? -Math.min(4, -dist / 20) : -Math.min(4, dist / 40);
    const total = score * 10 + weight + near;
    if (!best || total > best.total) best = { pos: p, score, total, line: index[p].line };
  }
  return best;
}

// Обёртка вокруг распознавания речи с автоперезапуском
export class VoiceFollower {
  constructor({ onLine, onState, onHeard }) {
    this.onLine = onLine; this.onState = onState; this.onHeard = onHeard || (() => {});
    this.active = false; this.cur = 0; this.index = [];
    this.finalWords = [];
  }
  setLines(lines) { this.index = buildIndex(lines); this.cur = 0; this.finalWords = []; }
  jumpToLine(line) {
    const i = this.index.findIndex((x) => x.line >= line);
    if (i >= 0) this.cur = i;
  }
  start() {
    if (!SR) { this.onState('unsupported'); return; }
    this.active = true;
    this._spawn();
  }
  _spawn() {
    const rec = new SR();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => this.onState('listening');
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) this.finalWords.push(...tokenize(t));
        else interim += ' ' + t;
      }
      this.finalWords = this.finalWords.slice(-12);
      const heard = [...this.finalWords, ...tokenize(interim)];
      this.onHeard(heard.slice(-6).join(' '));
      const hit = locate(this.index, heard, this.cur);
      if (hit) {
        this.cur = hit.pos;
        this.onLine(hit.line);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.active = false;
        this.onState('denied');
      } else if (e.error === 'network') {
        this.onState('network');
      }
    };
    rec.onend = () => {
      // Safari и Chrome сами останавливают распознавание — перезапускаем
      if (this.active) setTimeout(() => this.active && this._spawn(), 250);
      else this.onState('off');
    };
    this.rec = rec;
    try { rec.start(); } catch { /* уже запущено */ }
  }
  stop() {
    this.active = false;
    try { this.rec && this.rec.stop(); } catch { /* ignore */ }
    this.onState('off');
  }
}

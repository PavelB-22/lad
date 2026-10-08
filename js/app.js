// «Лад» — роутер и экраны
import * as store from './store.js';
import { parseSong, songChords, hasChords } from './parser.js';
import { transposeChord, prefersFlats } from './chords.js';
import { chordSVG } from './diagrams.js';
import { VoiceFollower, voiceSupported } from './voice.js';

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K' : String(n));
const hue = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ICON = {
  star: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  starO: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
  eye: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  edit: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};

// ---------- общее ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

function applyTheme() {
  document.documentElement.dataset.theme = store.settings().theme;
  const dark = store.settings().theme === 'dark' || (store.settings().theme === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
  $('meta[name=theme-color]').content = dark ? '#0d0e12' : '#f6f3ee';
}
$('#themeBtn').addEventListener('click', () => {
  const order = ['auto', 'dark', 'light'];
  const next = order[(order.indexOf(store.settings().theme) + 1) % 3];
  store.setSetting('theme', next);
  applyTheme();
  toast({ auto: 'Тема: как в системе', dark: 'Тема: тёмная', light: 'Тема: светлая' }[next]);
});

function songRow(s, i, rank = true) {
  return `<li class="row" style="--i:${Math.min(i, 20)}">
    ${rank ? `<span class="rank">${i + 1}</span>` : ''}
    <a class="row-main" href="#/song/${encodeURIComponent(s.id)}">
      <div class="row-title">${esc(s.title)}</div>
      <div class="row-artist">${esc(s.artist)}</div>
    </a>
    <span class="views" title="Просмотры">${ICON.eye}${fmt(s.views)}</span>
    <button class="star ${s.fav ? 'on' : ''}" data-fav="${esc(s.id)}" aria-label="${s.fav ? 'Убрать из избранного' : 'В избранное'}">${s.fav ? ICON.star : ICON.starO}</button>
  </li>`;
}

const byPopularity = (a, b) => b.views - a.views || (b.created || 0) - (a.created || 0) || a.title.localeCompare(b.title, 'ru');

function bindFavs(root, rerender) {
  root.querySelectorAll('[data-fav]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.preventDefault();
      const on = store.toggleFav(b.dataset.fav);
      b.classList.toggle('on', on);
      b.innerHTML = on ? ICON.star : ICON.starO;
      b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      toast(on ? 'Добавлено в избранное' : 'Убрано из избранного');
      if (rerender) setTimeout(rerender, 350);
    })
  );
}

// ---------- Популярное ----------
const homeState = { q: '', genre: 'Все' };

function renderHome() {
  view.innerHTML = `
    <h1 class="page-title">Популярное</h1>
    <p class="page-sub">Твой рейтинг — по числу открытий</p>
    <label class="search">${ICON.search}<input id="q" type="search" placeholder="Песня или исполнитель" value="${esc(homeState.q)}" autocomplete="off" enterkeyhint="search"><span class="sr-only">Поиск</span></label>
    <div class="chips" id="chips"></div>
    <ul class="list" id="list"></ul>`;
  const q = $('#q');
  q.addEventListener('input', () => { homeState.q = q.value; fillHome(); });
  fillHome();
}

function fillHome() {
  const songs = store.allSongs();
  const genres = ['Все', ...store.GENRES.filter((g) => songs.some((s) => s.genre === g))];
  if (!genres.includes(homeState.genre)) homeState.genre = 'Все';
  $('#chips').innerHTML = genres.map((g) => `<button class="chip ${g === homeState.genre ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
  $('#chips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { homeState.genre = c.dataset.g; fillHome(); }));

  const q = homeState.q.trim().toLowerCase().replace(/ё/g, 'е');
  const list = songs
    .filter((s) => homeState.genre === 'Все' || s.genre === homeState.genre)
    .filter((s) => !q || (s.title + ' ' + s.artist).toLowerCase().replace(/ё/g, 'е').includes(q))
    .sort(byPopularity);
  const el = $('#list');
  if (!songs.length) {
    el.innerHTML = `<div class="empty"><div class="big">🎸</div><p>Здесь пока пусто.<br>Добавь первую песню — вставь текст с аккордами.</p><a class="btn primary" href="#/add">Добавить песню</a></div>`;
    return;
  }
  el.innerHTML = list.length ? list.map((s, i) => songRow(s, i)).join('') : `<div class="empty"><div class="big">🔎</div><p>Ничего не нашлось по «${esc(homeState.q)}»</p><a class="btn" href="#/add">Добавить эту песню</a></div>`;
  bindFavs(el);
}

// ---------- Исполнители ----------
function artistsMap() {
  const m = new Map();
  for (const s of store.allSongs()) {
    const a = m.get(s.artist) || { name: s.artist, count: 0, views: 0 };
    a.count++; a.views += s.views;
    m.set(s.artist, a);
  }
  return [...m.values()].sort((a, b) => b.views - a.views || b.count - a.count || a.name.localeCompare(b.name, 'ru'));
}

function renderArtists() {
  const arts = artistsMap();
  view.innerHTML = `<h1 class="page-title">Исполнители</h1><p class="page-sub">${arts.length} в библиотеке</p>
    <div class="grid">${arts.map((a, i) => `
      <a class="card" style="--i:${Math.min(i, 20)}" href="#/artist/${encodeURIComponent(a.name)}">
        <div class="avatar" style="--h:${hue(a.name)}">${esc(a.name.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').charAt(0).toUpperCase() || '♪')}</div>
        <div class="card-title">${esc(a.name)}</div>
        <div class="card-sub">${a.count} ${plural(a.count, 'песня', 'песни', 'песен')} · ${fmt(a.views)} ${plural(a.views, 'просмотр', 'просмотра', 'просмотров')}</div>
      </a>`).join('')}</div>`;
}

function renderArtist(name) {
  const songs = store.allSongs().filter((s) => s.artist === name).sort(byPopularity);
  view.innerHTML = `<div class="song-head"><button class="icon-btn" onclick="history.back()" aria-label="Назад">${ICON.back}</button>
    <div class="titles"><h1 class="song-title">${esc(name)}</h1><div class="meta"><span class="pill">${songs.length} ${plural(songs.length, 'песня', 'песни', 'песен')}</span></div></div></div>
    <ul class="list" id="list">${songs.map((s, i) => songRow(s, i)).join('')}</ul>`;
  bindFavs(view);
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? few : many;
}

// ---------- Избранное ----------
function renderFavs() {
  const favs = store.allSongs().filter((s) => s.fav);
  view.innerHTML = `<h1 class="page-title">Избранное</h1><p class="page-sub">Только твои любимые</p>
    ${favs.length ? `<ul class="list" id="list">${favs.map((s, i) => songRow(s, i, false)).join('')}</ul>`
      : `<div class="empty"><div class="big">⭐</div><p>Нажми на звёздочку у песни —<br>и она появится здесь.</p><a class="btn" href="#/">К популярному</a></div>`}`;
  bindFavs(view, () => location.hash === '#/favs' && renderFavs());
}

// ---------- Песня ----------
const songState = { id: null, tr: 0, parsed: null, flats: false, lineEls: [] };
let follower = null;

function renderSong(id) {
  const s = store.getSong(id);
  if (!s) {
    view.innerHTML = `<div class="empty"><div class="big">🤷</div><p>Песня не найдена</p><a class="btn" href="#/">На главную</a></div>`;
    return;
  }
  if (songState.id !== id) {
    store.addView(id);
    songState.tr = 0;
  }
  songState.id = id;
  songState.parsed = parseSong(s.text);
  const chords = songChords(songState.parsed);
  songState.flats = prefersFlats(chords);
  document.body.classList.add('song-mode');

  view.innerHTML = `
    <div class="song-head">
      <button class="icon-btn" id="backBtn" aria-label="Назад">${ICON.back}</button>
      <div class="titles">
        <h1 class="song-title">${esc(s.title)}</h1>
        <a class="song-artist" href="#/artist/${encodeURIComponent(s.artist)}">${esc(s.artist)}</a>
        <div class="meta">
          ${s.genre ? `<span class="pill">${esc(s.genre)}</span>` : ''}
          <span class="pill">${fmt(s.views + 1)} ${plural(s.views + 1, 'просмотр', 'просмотра', 'просмотров')}</span>
          ${s.demo ? '<span class="pill">демо</span>' : ''}
        </div>
      </div>
      <button class="star ${s.fav ? 'on' : ''}" data-fav="${esc(s.id)}" aria-label="Избранное">${s.fav ? ICON.star : ICON.starO}</button>
      <a class="icon-btn" href="#/edit/${encodeURIComponent(s.id)}" aria-label="Редактировать">${ICON.edit}</a>
    </div>
    <div class="chord-strip" id="strip" aria-label="Аккорды в песне"></div>
    <div class="lyrics" id="lyrics"></div>`;
  $('#backBtn').addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
  bindFavs(view);
  $('#lyrics').style.setProperty('--fs', store.settings().font + 'px');
  drawLyrics();
  if (!chords.length) $('#strip').outerHTML = '<p class="note" style="color:var(--text-3)">В этой песне аккорды не найдены</p>';
}

const tr = (c) => transposeChord(c, songState.tr, songState.flats);

function drawLyrics() {
  const chords = songChords(songState.parsed);
  const strip = $('#strip');
  if (strip) strip.innerHTML = chords.map((c, i) => `<div class="chord-card" style="--i:${i}"><b>${esc(tr(c))}</b>${chordSVG(tr(c), 0.82)}</div>`).join('');

  const out = [];
  const lines = []; // тексты строк для голоса
  for (const l of songState.parsed) {
    if (l.type === 'empty') { out.push('<div class="line empty"></div>'); continue; }
    if (l.type === 'section') { out.push(`<div class="line sect">${esc(l.text)}</div>`); continue; }
    if (l.type === 'chords') {
      out.push(`<div class="line chords-only">${l.chords.map((c) => `<span class="ch" data-ch="${esc(c.chord)}">${esc(tr(c.chord))}</span>`).join('')}</div>`);
      continue;
    }
    const li = lines.length;
    if (l.type === 'text') {
      lines.push(l.text);
      out.push(`<div class="line text-only" data-li="${li}">${esc(l.text)}</div>`);
      continue;
    }
    lines.push(l.text);
    // сегменты; склеенные внутри слова — в общую обёртку .wg
    let html = '', group = '';
    const flush = () => { if (group) { html += `<span class="wg">${group}</span>`; group = ''; } };
    l.segs.forEach((sg, i) => {
      const name = sg.chord ? tr(sg.chord) : '';
      const emptyText = !sg.text.trim();
      const text = sg.text === '' ? ' ' : sg.text;
      const seg = `<span class="seg${emptyText && sg.chord ? ' empty-text' : ''}" style="--chw:${name.length}">${sg.chord ? `<span class="ch" data-ch="${esc(sg.chord)}">${esc(name)}</span>` : ''}${esc(text)}</span>`;
      const nextJoins = l.segs[i + 1]?.joinPrev;
      if (sg.joinPrev || nextJoins) {
        if (!sg.joinPrev) flush();
        group += seg;
        if (!nextJoins) flush();
      } else {
        flush();
        html += seg;
      }
    });
    flush();
    out.push(`<div class="line pair" data-li="${li}">${html}</div>`);
  }
  $('#lyrics').innerHTML = out.join('');
  songState.lineEls = [...document.querySelectorAll('#lyrics [data-li]')];
  songState.lineTexts = lines;
  if (follower) follower.setLines(lines);
  const v = $('#trVal');
  v.textContent = (songState.tr > 0 ? '+' : '') + songState.tr;
  v.classList.toggle('changed', songState.tr !== 0);
}

// всплывающая схема аккорда
let popover = null;
function closePopover() {
  if (!popover) return;
  const p = popover; popover = null;
  document.querySelectorAll('.ch.open').forEach((c) => c.classList.remove('open'));
  p.classList.add('out');
  setTimeout(() => p.remove(), 160);
}
document.addEventListener('click', (e) => {
  const ch = e.target.closest('.ch');
  if (!ch) { if (!e.target.closest('.popover')) closePopover(); return; }
  e.stopPropagation();
  const wasOpen = ch.classList.contains('open');
  closePopover();
  if (wasOpen) return;
  const name = tr(ch.dataset.ch);
  ch.classList.add('open');
  const p = document.createElement('div');
  p.className = 'popover';
  p.innerHTML = `<b>${esc(name)}</b>${chordSVG(name, 1.15)}`;
  document.body.appendChild(p);
  const r = ch.getBoundingClientRect(), pr = p.getBoundingClientRect();
  let left = r.left + r.width / 2 - pr.width / 2;
  left = Math.max(8, Math.min(left, innerWidth - pr.width - 8));
  let top = r.bottom + 8;
  let oy = '0%';
  if (top + pr.height > innerHeight - 160) { top = r.top - pr.height - 8; oy = '100%'; }
  p.style.left = left + 'px'; p.style.top = top + 'px';
  p.style.setProperty('--ox', r.left + r.width / 2 - left + 'px');
  p.style.setProperty('--oy', oy);
  popover = p;
});
addEventListener('scroll', () => popover && !autoScroll.on && closePopover(), { passive: true });

// ---------- док: транспонирование, шрифт, прокрутка, голос ----------
const autoScroll = { on: false, last: 0, acc: 0 };
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* не поддерживается */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (autoScroll.on || follower?.active)) { wakeLock = null; keepAwake(true); }
});

function setScroll(on) {
  autoScroll.on = on;
  $('#dock').classList.toggle('scrolling', on);
  $('#scrollBtn').classList.toggle('on', on);
  keepAwake(on || !!follower?.active);
  if (on) { autoScroll.last = performance.now(); autoScroll.acc = 0; requestAnimationFrame(stepScroll); }
}
function stepScroll(t) {
  if (!autoScroll.on) return;
  const dt = Math.min(100, t - autoScroll.last); autoScroll.last = t;
  autoScroll.acc += (store.settings().speed * dt) / 1000;
  if (autoScroll.acc >= 1) {
    const px = Math.floor(autoScroll.acc); autoScroll.acc -= px;
    window.scrollBy(0, px);
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) { setScroll(false); toast('Конец песни'); return; }
  }
  requestAnimationFrame(stepScroll);
}
$('#speed').value = store.settings().speed;
$('#speed').addEventListener('input', (e) => store.setSetting('speed', +e.target.value));

let activeLine = -1;
function highlight(li, smooth = true) {
  if (li === activeLine) return;
  songState.lineEls[activeLine]?.classList.remove('active');
  activeLine = li;
  const el = songState.lineEls[li];
  if (!el) return;
  el.classList.add('active');
  const y = el.getBoundingClientRect().top + scrollY - innerHeight * 0.3;
  window.scrollTo({ top: Math.max(0, y), behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
}

function setVoiceUI(state) {
  const mic = $('#micBtn'), heard = $('#heard'), lyr = $('#lyrics');
  const on = state === 'listening';
  mic.classList.toggle('on', !!follower?.active);
  lyr?.classList.toggle('voice-on', !!follower?.active);
  if (state === 'listening') { heard.innerHTML = '<i>●</i>Слушаю… пой'; heard.classList.add('show'); }
  if (state === 'off') { heard.classList.remove('show'); lyr?.classList.remove('voice-on'); keepAwake(autoScroll.on); }
  if (state === 'denied') { heard.classList.remove('show'); toast('Нет доступа к микрофону — разреши его в настройках браузера'); }
  if (state === 'network') toast('Распознаванию речи нужен интернет');
  if (state === 'unsupported') toast('Этот браузер не умеет распознавать речь. Открой в Safari или Chrome — или включи автопрокрутку');
  return on;
}

function toggleVoice() {
  if (!voiceSupported) { setVoiceUI('unsupported'); return; }
  if (follower?.active) { follower.stop(); return; }
  follower = new VoiceFollower({
    onLine: (li) => highlight(li),
    onState: setVoiceUI,
    onHeard: (txt) => { if (txt) $('#heard').innerHTML = `<i>●</i>${esc(txt)}`; },
  });
  follower.setLines(songState.lineTexts || []);
  // начинаем с той строки, что сейчас на экране
  const firstVisible = songState.lineEls.findIndex((el) => el.getBoundingClientRect().top > 80);
  if (firstVisible > 0) follower.jumpToLine(firstVisible);
  setScroll(false);
  follower.start();
  $('#lyrics').classList.add('voice-on');
  $('#micBtn').classList.add('on');
  keepAwake(true);
  if (activeLine < 0 || !songState.lineEls[activeLine]) { activeLine = -1; highlight(Math.max(0, firstVisible)); }
}

// тап по строке во время голоса — «я здесь»
document.addEventListener('click', (e) => {
  if (!follower?.active || e.target.closest('.ch')) return;
  const line = e.target.closest('#lyrics [data-li]');
  if (line) { const li = +line.dataset.li; follower.jumpToLine(li); highlight(li); }
});

$('#dock').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'tr+' || act === 'tr-' || act === 'tr0') {
    songState.tr = act === 'tr0' ? 0 : Math.max(-11, Math.min(11, songState.tr + (act === 'tr+' ? 1 : -1)));
    closePopover();
    drawLyrics();
    if (follower?.active) { const a = activeLine; activeLine = -1; highlight(a, false); }
  } else if (act === 'fs+' || act === 'fs-') {
    const f = Math.max(13, Math.min(30, store.settings().font + (act === 'fs+' ? 1 : -1)));
    store.setSetting('font', f);
    $('#lyrics').style.setProperty('--fs', f + 'px');
  } else if (act === 'scroll') {
    if (follower?.active) follower.stop();
    setScroll(!autoScroll.on);
  } else if (act === 'mic') {
    toggleVoice();
  }
});

function leaveSong() {
  document.body.classList.remove('song-mode');
  setScroll(false);
  if (follower?.active) follower.stop();
  follower = null;
  activeLine = -1;
  closePopover();
  keepAwake(false);
}

// ---------- Добавить / редактировать ----------
function renderEditor(id) {
  const s = id ? store.getSong(id) : null;
  if (id && !s) { view.innerHTML = '<div class="empty"><p>Песня не найдена</p></div>'; return; }
  view.innerHTML = `
    <h1 class="page-title">${s ? 'Редактировать' : 'Новая песня'}</h1>
    <p class="page-sub">${s ? (s.demo ? 'Правка демо сохранится как твоя копия' : 'Изменения сохранятся на этом устройстве') : 'Вставь текст с аккордами из любого источника'}</p>
    <div class="editor">
      <form class="form" id="form" autocomplete="off">
        <div class="row2">
          <div class="field"><label for="fArtist">Исполнитель</label><input id="fArtist" required list="artistsList" value="${esc(s?.artist || '')}" placeholder="Например, Кино"></div>
          <div class="field"><label for="fGenre">Подборка</label><select id="fGenre">${store.GENRES.map((g) => `<option ${g === (s?.genre || 'Другое') ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
        </div>
        <datalist id="artistsList">${artistsMap().map((a) => `<option value="${esc(a.name)}">`).join('')}</datalist>
        <div class="field"><label for="fTitle">Название</label><input id="fTitle" required value="${esc(s?.title || '')}" placeholder="Название песни"></div>
        <div class="field">
          <label for="fText">Текст с аккордами</label>
          <textarea id="fText" required spellcheck="false" placeholder="Am           Dm&#10;Строка текста под аккордами&#10;E            Am&#10;Следующая строка">${esc(s?.text || '')}</textarea>
        </div>
        <p class="hint">Формат как на сайтах с аккордами: строка аккордов, под ней — строка текста. Подходит и <code>[Am]слово</code>. Строки вида <code>Припев:</code> станут заголовками. Русское <code>H</code> = си.</p>
        <div class="actions">
          <button class="btn primary" type="submit">${s ? 'Сохранить' : 'Добавить песню'}</button>
          ${s ? '<button class="btn danger" type="button" id="delBtn">Удалить</button>' : ''}
          <button class="btn" type="button" id="cancelBtn">Отмена</button>
        </div>
      </form>
      <div class="preview" id="preview" aria-live="polite"></div>
    </div>`;
  const fText = $('#fText');
  const upd = () => {
    const parsed = parseSong(fText.value);
    const n = songChords(parsed).length;
    $('#preview').innerHTML = `<div class="preview-title"><span>Предпросмотр</span><span>${n ? `аккордов: ${n}` : ''}</span></div>` +
      (fText.value.trim()
        ? (n ? '' : '<p class="warn">Аккорды не распознаны — песня сохранится как обычный текст.</p>') + previewHTML(parsed)
        : '<p class="hint">Вставь текст — здесь появится, как будет выглядеть песня.</p>');
  };
  fText.addEventListener('input', upd);
  upd();
  $('#cancelBtn').addEventListener('click', () => history.back());
  $('#delBtn')?.addEventListener('click', () => {
    if (!confirm(`Удалить «${s.title}»?`)) return;
    store.deleteSong(s.id);
    toast('Песня удалена');
    location.hash = '#/';
  });
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    const song = {
      id: s?.id,
      artist: $('#fArtist').value.trim(),
      title: $('#fTitle').value.trim(),
      genre: $('#fGenre').value,
      text: fText.value.replace(/\s+$/, ''),
    };
    if (!song.artist || !song.title || !song.text) { toast('Заполни исполнителя, название и текст'); return; }
    try {
      const newId = store.upsertSong(song);
      toast(s ? 'Сохранено' : hasChords(song.text) ? 'Песня добавлена 🎸' : 'Добавлено (без аккордов)');
      location.replace('#/song/' + encodeURIComponent(newId));
    } catch (err) {
      toast(err.message);
    }
  });
}

function previewHTML(parsed) {
  return '<div class="lyrics" style="--fs:15px">' + parsed.map((l) => {
    if (l.type === 'empty') return '<div class="line empty"></div>';
    if (l.type === 'section') return `<div class="line sect">${esc(l.text)}</div>`;
    if (l.type === 'chords') return `<div class="line chords-only">${l.chords.map((c) => `<span class="ch">${esc(c.chord)}</span>`).join('')}</div>`;
    if (l.type === 'text') return `<div class="line text-only">${esc(l.text)}</div>`;
    return `<div class="line pair">${l.segs.map((sg) => `<span class="seg${!sg.text.trim() && sg.chord ? ' empty-text' : ''}" style="--chw:${sg.chord?.length || 0}">${sg.chord ? `<span class="ch">${esc(sg.chord)}</span>` : ''}${esc(sg.text || ' ')}</span>`).join('')}</div>`;
  }).join('') + '</div>';
}

// ---------- Ещё (настройки) ----------
function renderSettings() {
  const st = store.settings();
  const own = store.allSongs().filter((s) => !s.demo).length;
  view.innerHTML = `
    <h1 class="page-title">Ещё</h1>
    <div class="section" style="--i:0"><h3>Тема</h3><p>Как будет выглядеть приложение</p>
      <div class="seg-ctl" id="themeCtl">${[['auto', 'Авто'], ['dark', 'Тёмная'], ['light', 'Светлая']].map(([k, n]) => `<button data-t="${k}" class="${st.theme === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="section" style="--i:1"><h3>Резервная копия</h3>
      <p>Песни хранятся в памяти этого браузера (своих: ${own}). Сохрани файл, чтобы не потерять их или перенести на другое устройство.</p>
      <div class="actions"><button class="btn primary" id="expBtn">Скачать копию</button><label class="btn" for="impFile">Загрузить копию</label><input type="file" id="impFile" accept=".json,application/json" hidden></div></div>
    <div class="section" style="--i:2"><h3>Голос</h3>
      <p>${voiceSupported ? 'Браузер умеет распознавать речь ✅ Нажми 🎤 на странице песни и пой — текст поедет за тобой. Нужен интернет и разрешение на микрофон.' : 'В этом браузере распознавание речи недоступно. Открой приложение в Safari (iPhone) или Chrome. Автопрокрутка работает везде.'}</p></div>
    <div class="section" style="--i:3"><h3>Демо-песни</h3><p>Народные песни для примера. Если удалил — можно вернуть.</p>
      <button class="btn" id="demoBtn">Вернуть демо-песни</button></div>
    <div class="section" style="--i:4"><h3>На экран «Домой»</h3>
      <p>iPhone: Safari → кнопка «Поделиться» → «На экран Домой». Приложение откроется без адресной строки и будет работать без интернета.</p></div>`;
  $('#themeCtl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    store.setSetting('theme', b.dataset.t); applyTheme();
    $('#themeCtl').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#expBtn').addEventListener('click', async () => {
    const data = store.exportJSON();
    const name = `lad-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([data], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Лад — резервная копия' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#impFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const n = store.importJSON(await f.text()); toast(`Загружено песен: ${n}`); renderSettings(); }
    catch (err) { toast(err.message || 'Не получилось прочитать файл'); }
  });
  $('#demoBtn').addEventListener('click', () => { store.restoreDemo(); toast('Демо-песни на месте'); });
}

// ---------- роутер ----------
function route() {
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const [, page, arg] = h.split('/');
  if (page !== 'song') leaveSong();
  const tab = { '': 'home', artists: 'artists', artist: 'artists', favs: 'favs', add: 'add', settings: 'settings' }[page || ''];
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  switch (page) {
    case 'song': renderSong(arg); break;
    case 'artists': renderArtists(); break;
    case 'artist': renderArtist(h.slice('/artist/'.length)); break;
    case 'favs': renderFavs(); break;
    case 'add': renderEditor(null); break;
    case 'edit': renderEditor(arg); break;
    case 'settings': renderSettings(); break;
    default: renderHome();
  }
}

let first = true;
addEventListener('hashchange', () => {
  const go = () => { route(); scrollTo(0, 0); };
  if (!first && document.startViewTransition && !reduceMotion) document.startViewTransition(go);
  else go();
});
applyTheme();
route();
first = false;

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

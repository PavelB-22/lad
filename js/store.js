// Хранилище в localStorage + экспорт/импорт.
import { DEMO_SONGS } from './demo-songs.js';

const KEY = 'lad.v1';
const empty = () => ({ songs: [], favs: [], views: {}, hiddenDemo: [], settings: { theme: 'auto', font: 17, speed: 30 } });

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const s = JSON.parse(raw);
    return { ...empty(), ...s, settings: { ...empty().settings, ...(s.settings || {}) } };
  } catch {
    return empty();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}

export const GENRES = ['Рок', 'Дворовые', 'Армейские', 'Народные', 'Бардовские', 'Поп', 'Другое'];

export function allSongs() {
  const demo = DEMO_SONGS.filter((s) => !state.hiddenDemo.includes(s.id)).map((s) => ({ ...s, demo: true }));
  return [...state.songs, ...demo].map((s) => ({ ...s, views: state.views[s.id] || 0, fav: state.favs.includes(s.id) }));
}

export const getSong = (id) => allSongs().find((s) => s.id === id) || null;

export function addView(id) {
  state.views[id] = (state.views[id] || 0) + 1;
  save();
}

export function toggleFav(id) {
  const i = state.favs.indexOf(id);
  if (i >= 0) state.favs.splice(i, 1); else state.favs.unshift(id);
  save();
  return i < 0;
}

export function upsertSong(song) {
  const now = Date.now();
  if (song.id && song.id.startsWith('demo-')) {
    // правка демо → сохраняем как свою копию, демо прячем
    state.hiddenDemo.push(song.id);
    const copy = { ...song, id: 'u' + now.toString(36), demo: undefined, created: now, updated: now };
    state.views[copy.id] = state.views[song.id] || 0;
    state.songs.unshift(copy);
    save();
    return copy.id;
  }
  if (song.id) {
    const i = state.songs.findIndex((s) => s.id === song.id);
    if (i >= 0) state.songs[i] = { ...state.songs[i], ...song, updated: now };
  } else {
    song = { ...song, id: 'u' + now.toString(36), created: now, updated: now };
    state.songs.unshift(song);
  }
  if (!save()) throw new Error('Не удалось сохранить: память браузера заполнена');
  return song.id;
}

export function deleteSong(id) {
  if (id.startsWith('demo-')) state.hiddenDemo.push(id);
  else state.songs = state.songs.filter((s) => s.id !== id);
  state.favs = state.favs.filter((f) => f !== id);
  delete state.views[id];
  save();
}

export function restoreDemo() { state.hiddenDemo = []; save(); }

export const settings = () => state.settings;
export function setSetting(k, v) { state.settings[k] = v; save(); }

export function exportJSON() {
  return JSON.stringify({ app: 'lad', version: 1, exported: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.songs)) throw new Error('Это не файл резервной копии «Лад»');
  // объединяем: свои песни по id, просмотры — максимум, избранное — объединение
  const byId = new Map(state.songs.map((s) => [s.id, s]));
  for (const s of data.songs) if (s && s.id && s.title && typeof s.text === 'string') byId.set(s.id, s);
  state.songs = [...byId.values()];
  state.favs = [...new Set([...(data.favs || []), ...state.favs])];
  for (const [k, v] of Object.entries(data.views || {})) state.views[k] = Math.max(state.views[k] || 0, +v || 0);
  save();
  return data.songs.length;
}

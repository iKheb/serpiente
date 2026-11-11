// Estado persistente (localStorage con try/catch: funciona aunque esté bloqueado).
import { bus } from './bus.js';

const KEY = 'orbita:v1';

const DEFAULT_PROFILES = [
  { id: 'p1', name: 'Alex', color: '#6d7cff', avatar: 0, kids: false },
  { id: 'p2', name: 'Lucía', color: '#ff5c9d', avatar: 1, kids: false },
  { id: 'p3', name: 'Mateo', color: '#2ee6a6', avatar: 2, kids: false },
  { id: 'p4', name: 'Peques', color: '#ffb35c', avatar: 3, kids: true },
];

const DEFAULTS = {
  profileId: null,
  profiles: DEFAULT_PROFILES,
  myList: {},        // { [profileId]: [contentId, ...] }
  progress: {},      // { [profileId]: { [contentId]: { t: segundos, d: duración, ep: 'S1E2', at: timestamp } } }
  likes: {},         // { [profileId]: { [contentId]: 1 | -1 } }
  recentSearches: {},// { [profileId]: [texto, ...] }
  lastChannel: null,
  settings: {
    quality: 'auto',         // auto | 4k | 1080 | 720 | 480
    audio: 'es',             // es | en | lat
    subtitles: 'off',        // off | es | en
    subtitleSize: 'm',       // s | m | l
    autoplayNext: true,
    autoplayPreviews: true,
    uiSounds: true,
    volume: 0.8,
    parental: '18',          // TP | 7 | 12 | 16 | 18
    reducedMotion: false,
    dataSaver: false,
  },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...(s.settings || {}) } };
    }
  } catch { /* almacenamiento no disponible */ }
  return structuredClone(DEFAULTS);
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignorar */ } }, 120);
}

export const store = {
  get state() { return state; },
  get(key) { return state[key]; },
  set(key, value) { state[key] = value; save(); bus.emit(`store:${key}`, value); bus.emit('store:change', { key, value }); },

  // Perfiles
  profile() { return state.profiles.find((p) => p.id === state.profileId) || null; },
  setProfile(id) { this.set('profileId', id); },
  updateProfile(id, patch) {
    this.set('profiles', state.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  },

  // Mi lista
  myList() { return state.myList[state.profileId] || []; },
  inList(id) { return this.myList().includes(id); },
  toggleList(id) {
    const list = this.myList();
    const next = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list];
    this.set('myList', { ...state.myList, [state.profileId]: next });
    return next.includes(id);
  },

  // Progreso (seguir viendo)
  progressOf(id) { return (state.progress[state.profileId] || {})[id] || null; },
  setProgress(id, t, d, ep) {
    const mine = { ...(state.progress[state.profileId] || {}) };
    if (d && t / d > 0.96) delete mine[id];
    else mine[id] = { t, d, ep, at: Date.now() };
    this.set('progress', { ...state.progress, [state.profileId]: mine });
  },
  continueWatching() {
    const mine = state.progress[state.profileId] || {};
    return Object.entries(mine).sort((a, b) => b[1].at - a[1].at).map(([id, p]) => ({ id, ...p }));
  },

  // Valoraciones
  likeOf(id) { return (state.likes[state.profileId] || {})[id] || 0; },
  setLike(id, v) {
    const mine = { ...(state.likes[state.profileId] || {}), [id]: v };
    this.set('likes', { ...state.likes, [state.profileId]: mine });
  },

  // Búsquedas recientes
  recentSearches() { return state.recentSearches[state.profileId] || []; },
  addSearch(q) {
    q = q.trim(); if (!q) return;
    const list = [q, ...this.recentSearches().filter((x) => x !== q)].slice(0, 8);
    this.set('recentSearches', { ...state.recentSearches, [state.profileId]: list });
  },

  // Ajustes
  setting(k) { return state.settings[k]; },
  setSetting(k, v) { this.set('settings', { ...state.settings, [k]: v }); },
  reset() { state = structuredClone(DEFAULTS); save(); bus.emit('store:change', { key: '*' }); },
};

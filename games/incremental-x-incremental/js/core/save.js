// セーブ。版番号を持ち、足りない項目は初期値で補う（ゲームや項目が増えても古いデータを読める）。
import { Num, N, ZERO } from './num.js';
import { GAMES, RECIPES } from './registry.js';

const KEY = 'incxinc.save';
export const VERSION = 1;

export function newSave() {
  return {
    v: VERSION,
    lang: null,
    lastTime: Date.now(),
    active: 'clicker',
    games: { clicker: GAMES.clicker.newState() },
    lab: { unlocked: false, rp: 0, pairs: {}, hints: {}, research: {}, log: [] },
    meta: { unlocked: false, coins: ZERO, got: ZERO, life: ZERO, resets: 0, up: {}, auto: {}, rules: {}, rulesNext: {}, fullRuleRuns: 0 },
    world: { unlocked: false, stars: ZERO, got: ZERO, resets: 0, up: {}, off: {}, trait: 'plain' },
    milestones: {},
    guide: { step: 0 },
    settings: { buy: 1, bgm: 0.4, se: 0.7 },
    stats: { started: Date.now(), play: 0 },
  };
}

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Num);

function fill(obj, def) {
  for (const k of Object.keys(def)) {
    if (obj[k] === undefined || obj[k] === null) obj[k] = def[k];
    else if (isPlain(obj[k]) && isPlain(def[k])) fill(obj[k], def[k]);
  }
  return obj;
}

// 版が上がったら、ここに旧版からの変換を足す
function migrate(raw) {
  raw.v = VERSION;
  return raw;
}

export function parse(json) {
  const raw = migrate(JSON.parse(json, (k, v) => (typeof v === 'string' && v[0] === '~' ? N(v) : v)));
  const games = {};
  for (const [id, s] of Object.entries(raw.games || {})) {
    if (GAMES[id] && s) games[id] = fill(s, GAMES[id].newState());
  }
  raw.games = games;
  const out = fill(raw, newSave());
  for (const [key, child] of Object.entries(RECIPES)) if (!out.games[child]) delete out.lab.pairs[key];
  return out;
}

export function load() {
  try {
    const json = localStorage.getItem(KEY);
    return json ? parse(json) : null;
  } catch (e) {
    console.error('save load failed', e);
    return null;
  }
}

export function store(save) {
  save.lastTime = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) {
    console.error('save failed', e);
  }
}

export function wipe() {
  localStorage.removeItem(KEY);
}

// 書き出し・読み込み用の文字列
export function exportString(save) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(save))));
}

export function importString(str) {
  return parse(decodeURIComponent(escape(atob(str.trim()))));
}

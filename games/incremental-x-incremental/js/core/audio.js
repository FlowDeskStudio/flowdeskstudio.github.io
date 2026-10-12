// 音の再生。素材が未登録なら何もしない。
import { ASSETS } from './assets.js';

let vol = { bgm: 0.5, se: 0.7 };
let bgmEl = null;

export function setVolume(v) {
  vol = { ...vol, ...v };
  if (bgmEl) bgmEl.volume = vol.bgm;
}

// 音ごとの大きさ、続けて鳴らせる最短の間隔（秒）、高さの揺らぎ。
// 手作業の音は何百回も鳴るので小さめにし、鳴るたびに少しずつ高さを変えて耳に残らないようにする
const MIX = {
  buy: { gain: 0.55, gap: 0.04, vary: 0.04 },
  select: { gain: 0.4, gap: 0.05, vary: 0.03 },
  prestige: { gain: 0.85, gap: 0.3, vary: 0 },
  grand: { gain: 0.9, gap: 0.5, vary: 0 },
  born: { gain: 0.95, gap: 0.4, vary: 0 },
  bonus: { gain: 0.7, gap: 0.2, vary: 0.03 },
  pluck: { gain: 0.5, gap: 0.045, vary: 0.1 },
  pick: { gain: 0.5, gap: 0.045, vary: 0.08 },
  boom: { gain: 0.9, gap: 0.25, vary: 0.06 },
  brick: { gain: 0.4, gap: 0.045, vary: 0.1 },
  crank: { gain: 0.45, gap: 0.05, vary: 0.08 },
  harvest: { gain: 0.6, gap: 0.06, vary: 0.08 },
  water: { gain: 0.5, gap: 0.06, vary: 0.1 },
  step: { gain: 0.45, gap: 0.05, vary: 0.1 },
  dash: { gain: 0.8, gap: 0.3, vary: 0.05 },
  glass: { gain: 0.45, gap: 0.05, vary: 0.08 },
  peg: { gain: 0.4, gap: 0.045, vary: 0.12 },
  bellows: { gain: 0.6, gap: 0.06, vary: 0.08 },
  cast: { gain: 0.85, gap: 0.3, vary: 0.04 },
  tamp: { gain: 0.5, gap: 0.05, vary: 0.1 },
  crate: { gain: 0.5, gap: 0.05, vary: 0.1 },
  toss: { gain: 0.45, gap: 0.05, vary: 0.1 },
  chime: { gain: 0.6, gap: 0.12, vary: 0.05 },
  coins: { gain: 0.7, gap: 0.1, vary: 0.05 },
};
const last = {};
const pool = {};

export function se(key) {
  const list = ASSETS.se[key];
  if (!list || !list.length || vol.se <= 0 || typeof Audio === 'undefined') return;
  const m = MIX[key] || { gain: 0.6, gap: 0.05, vary: 0 };
  const now = performance.now() / 1000;
  if (now - (last[key] || 0) < m.gap) return;
  last[key] = now;
  // いくつかある音から 1 つ選ぶ。同じ音を重ねて鳴らせるよう、再生機は数個を使い回す
  const src = list[Math.floor(Math.random() * list.length)];
  const players = (pool[src] ||= []);
  let a = players.find((x) => x.paused || x.ended);
  if (!a) {
    if (players.length >= 4) return;
    a = new Audio(src);
    players.push(a);
  }
  a.volume = Math.min(1, vol.se * m.gain);
  a.preservesPitch = false;
  a.playbackRate = 1 + (Math.random() - 0.5) * 2 * m.vary;
  a.currentTime = 0;
  a.play().catch(() => {});
}

// ブラウザの制約で、最初の操作のあとに呼ぶ必要がある
export function startBgm(key = 'main') {
  const src = ASSETS.bgm[key];
  if (!src || bgmEl) return;
  bgmEl = new Audio(src);
  bgmEl.loop = true;
  bgmEl.volume = vol.bgm;
  bgmEl.play().catch(() => {
    bgmEl = null;
  });
}

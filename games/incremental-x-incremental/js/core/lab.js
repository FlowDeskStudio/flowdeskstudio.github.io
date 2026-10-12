// 融合実験。失敗はなく、必ず何かの成果が出る。
import { Num, N } from './num.js';
import { GAMES, RECIPES, pairKey } from './registry.js';
import { birthBoost } from './world.js';
import { trait } from './meta.js';

// 実験 1 回あたり、各ゲームが払う主資源の基準額
const EXP_BASE = { clicker: 8000, mining: 120, breakout: 400, factory: 2000, farm: 1000, maze: 600, cell: 800, drop: 500 };
const HINT_COST = 2;
const REBOOST = 1.3; // 同じ特別レシピの再実験で、融合ゲームに掛かる倍率

export const RESEARCH = [
  { id: 'insight', base: 2, r: 2, max: 20 },
  { id: 'offline', base: 3, r: 2, max: 6 },
  { id: 'thrift', base: 4, r: 2, max: 5 },
];

export function labUnlocked(save) {
  const lab = save.lab;
  if (!lab.unlocked && save.games.mining && save.games.mining.life.gte(150)) lab.unlocked = true;
  return lab.unlocked;
}

export function expCost(save, a, b) {
  const n = save.lab.pairs[pairKey(a, b)] || 0;
  const disc = (1 - 0.1 * (save.lab.research.thrift || 0)) * 0.5 ** (save.meta.up.catalyst || 0) * (trait(save).lab || 1);
  const one = (id) => N(EXP_BASE[id]).mul(Num.pow(6, n)).mul(disc);
  return { [a]: one(a), [b]: one(b) };
}

// 星を集めないと試せない組み合わせなら、要る星の累計を返す（試せるなら 0）
export function starLock(save, a, b) {
  const child = RECIPES[pairKey(a, b)];
  const need = child && !save.games[child] ? GAMES[child].stars || 0 : 0;
  return save.world.got.gte(need) ? 0 : need;
}

export function canExperiment(save, a, b) {
  if (!a || !b || a === b || save.meta.rules.nolab || starLock(save, a, b)) return false;
  const cost = expCost(save, a, b);
  return [a, b].every((id) => save.games[id] && save.games[id].amt.gte(cost[id]));
}

// 結果: { type: 'born' | 'boost' | 'link', key, game?, n, rp }
export function experiment(save, a, b) {
  if (!canExperiment(save, a, b)) return null;
  const lab = save.lab;
  const cost = expCost(save, a, b);
  for (const id of [a, b]) save.games[id].amt = save.games[id].amt.sub(cost[id]);
  const key = pairKey(a, b);
  const n = (lab.pairs[key] = (lab.pairs[key] || 0) + 1);
  const child = RECIPES[key];
  let res;
  if (child && !save.games[child]) {
    const g = GAMES[child];
    const s = g.newState();
    s.boost = birthBoost(save, g);
    save.games[child] = s;
    res = { type: 'born', game: child, rp: 3 };
  } else if (child) {
    // 同名のゲームは増やさず、既存の融合ゲームそのものを強化する
    save.games[child].boost = save.games[child].boost.mul(REBOOST);
    res = { type: 'boost', game: child, rp: 1 };
  } else {
    res = { type: 'link', rp: 2 };
  }
  lab.rp += res.rp;
  res.key = key;
  res.n = n;
  lab.log.unshift({ key, type: res.type, n });
  lab.log.length = Math.min(lab.log.length, 8);
  return res;
}

export const hintCost = () => HINT_COST;

export function buyHint(save, a, b) {
  const key = pairKey(a, b);
  if (save.lab.hints[key] || save.lab.pairs[key] || save.lab.rp < HINT_COST) return false;
  save.lab.rp -= HINT_COST;
  save.lab.hints[key] = true;
  return true;
}

export const researchCost = (save, r) => Math.round(r.base * r.r ** (save.lab.research[r.id] || 0));

export function buyResearch(save, r) {
  const lv = save.lab.research[r.id] || 0;
  const cost = researchCost(save, r);
  if (lv >= r.max || save.lab.rp < cost) return false;
  save.lab.rp -= cost;
  save.lab.research[r.id] = lv + 1;
  return true;
}

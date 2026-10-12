// 各ゲームが共通で使う枠：資源、強化の購入、個別転生、転生ツリー、実績
import { Num, N, ZERO, ONE } from './num.js';

// 所持数がこの数に届くたびに、その設備の生産が 2 倍になる
export const MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500];

export function milestoneMult(count) {
  let m = 1;
  for (const th of MILESTONES) if (count >= th) m *= 2;
  return m;
}

export function baseState() {
  return {
    amt: ZERO, // 主資源の所持量
    run: ZERO, // 今回の転生周での累計獲得
    life: ZERO, // 全期間の累計獲得
    up: {},
    pp: ZERO, // 個別転生で得た永続ポイントのうち、まだ使っていないぶん
    ppGot: ZERO, // これまでに受け取った永続ポイントの合計（生産の倍率はこちらで決まる）
    prestiges: 0,
    boost: ONE, // 融合ゲームが実験から受け取る恒久倍率
    clicks: 0,
    copies: [], // 複製が写し取った生産量（本部で解放）
    avg: ZERO, // ここ 1 分ほどの実際の稼ぎ（毎秒）
    tree: {}, // 転生ツリーの段階（総転生でも残る）
    ach: {}, // 達成した実績（総転生でも残る）
    stats: {}, // ゲームごとの通算記録（総転生でも残る）
  };
}

export function earn(s, x) {
  s.amt = s.amt.add(x);
  s.run = s.run.add(x);
  s.life = s.life.add(x);
}

export const lvl = (s, id) => s.up[id] || 0;

// 転生ポイントの倍率は「受け取った合計」で決まる。ツリーに使っても生産は減らない
export const ppMult = (s, per) => ONE.add(s.ppGot.mul(per));

// ゲーム全体に掛かる条件。world.js が刻みごとにセーブデータから写す
export const env = { cost: 1, pp: 1, seed: ZERO };

// lv から k 段階ぶんの合計費用。cm はゲームごとの費用の倍率（ツリーの割引など）
export function upCost(u, lv, k = 1, cm = 1) {
  const first = N(u.base).mul(Num.pow(u.r, lv)).mul(env.cost * cm);
  if (k === 1) return first;
  if (u.r === 1) return first.mul(k);
  return first.mul(Num.pow(u.r, k).sub(1)).div(u.r - 1);
}

export function maxAfford(u, lv, money, cm = 1) {
  const room = u.max != null ? u.max - lv : Infinity;
  const one = upCost(u, lv, 1, cm);
  if (room <= 0 || money.lt(one)) return 0;
  let k;
  if (u.r === 1) {
    k = Math.floor(money.div(one).toNumber());
  } else {
    const x = money.mul(u.r - 1).div(one).add(1);
    k = Math.floor(x.log10() / Math.log10(u.r) + 1e-9);
  }
  k = Math.max(1, Math.min(k, room));
  while (k > 1 && upCost(u, lv, k, cm).gt(money)) k--;
  return k;
}

// amt は数値か 'max'。買えた段階数を返す
export function buyUpgrade(s, u, amt = 1, cm = 1) {
  const lv = lvl(s, u.id);
  const can = maxAfford(u, lv, s.amt, cm);
  const k = amt === 'max' ? can : Math.min(amt, can);
  if (k <= 0) return 0;
  s.amt = s.amt.sub(upCost(u, lv, k, cm)).max(ZERO);
  s.up[u.id] = lv + k;
  return k;
}

// ---- ゲームを通した強化の扱い（ゲームごとの費用倍率と、購入後の処理を含む）----
const cmOf = (game, s, u) => (game.costMult ? game.costMult(s, u) : 1);
export const upShown = (s, u) => lvl(s, u.id) > 0 || !u.show || !!u.show(s);
export const gameCost = (game, s, u, k = 1) => upCost(u, lvl(s, u.id), k, cmOf(game, s, u));
export const gameAfford = (game, s, u) => maxAfford(u, lvl(s, u.id), s.amt, cmOf(game, s, u));

export function gameBuy(game, s, u, amt = 1) {
  const k = buyUpgrade(s, u, amt, cmOf(game, s, u));
  if (k > 0) game.onBuy?.(s, u, k);
  return k;
}

// ---- 個別転生 ----
// 引き継ぐもの以外を初期状態へ戻す
const KEEP = ['pp', 'ppGot', 'life', 'prestiges', 'boost', 'clicks', 'copies', 'tree', 'ach', 'stats'];
// 総転生でも残るもの
export const FOREVER = ['boost', 'tree', 'ach', 'stats'];

// 永続ポイントは「これまでの最高記録」から決まる。同じ所まで進み直すだけでは増えない。
export function prestigeGain(game, s) {
  return game.prestigeTotal(s).mul(env.pp).floor().sub(s.ppGot).max(ZERO);
}

export function prestige(game, s) {
  const gain = prestigeGain(game, s);
  if (gain.lt(1)) return false;
  const fresh = game.newState();
  const keep = new Set([...KEEP, ...(game.keep || [])]);
  for (const k of Object.keys(fresh)) if (!keep.has(k)) s[k] = fresh[k];
  s.pp = s.pp.add(gain);
  s.ppGot = s.ppGot.add(gain);
  s.prestiges++;
  game.onReset?.(s);
  s.amt = s.amt.add(env.seed); // 元手（本部の強化）
  return true;
}

// ---- 転生ツリー ----
// 転生ポイントを使って買う、消えない強化。req は { ほかの枝の id: 必要な段階 }
export const treeLvl = (s, id) => s.tree[id] || 0;
export const treeCost = (node, lv) => N(node.base).mul(Num.pow(node.r || 1, lv)).floor();

// 'max' | 'locked' | 'cost' | 'ok'
export function treeState(s, node) {
  const lv = treeLvl(s, node.id);
  if (lv >= (node.max || 1)) return 'max';
  for (const [id, need] of Object.entries(node.req || {})) if (treeLvl(s, id) < need) return 'locked';
  return s.pp.gte(treeCost(node, lv)) ? 'ok' : 'cost';
}

export function buyTree(game, s, node) {
  if (treeState(s, node) !== 'ok') return false;
  const lv = treeLvl(s, node.id);
  s.pp = s.pp.sub(treeCost(node, lv)).max(ZERO);
  s.tree[node.id] = lv + 1;
  game.onTree?.(s, node);
  return true;
}

// ---- 実績 ----
// 1 つにつき、そのゲームの生産 +3%
export const ACH_BONUS = 0.03;
export const achCount = (s) => Object.keys(s.ach).length;

// 新しく達成した実績を記録して返す
export function checkAch(game, s) {
  if (!game.achievements) return [];
  const fresh = [];
  for (const a of game.achievements) {
    if (!s.ach[a.id] && a.done(s)) {
      s.ach[a.id] = 1;
      fresh.push(a);
    }
  }
  return fresh;
}

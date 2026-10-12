// ゲーム群全体の進行：ゲーム間の倍率、全ゲームの時間経過、解放、オフライン進行
import { Num, N, ZERO, ONE } from './num.js';
import { gameCost, gameBuy, gameAfford, upShown, earn, prestige, prestigeGain, env, achCount, checkAch, ACH_BONUS } from './engine.js';
import { ORDER, GAMES, BASES, FUSIONS, RECIPES } from './registry.js';
import { seedMoney, autoOn, trait } from './meta.js';
import { canExperiment, expCost, experiment } from './lab.js';
import { TUNE } from './tune.js';

// ゲーム間の倍率。必ず「刻みの開始時点の状態」だけから求め、刻みの途中では変えない。
// 親→子→親の循環があっても、参照するのは前の刻みの値で、効果は対数なので発散しない。
export function extMult(save, id) {
  const lab = save.lab;
  const rules = save.meta.rules;
  const tr = trait(save);
  let m = N((1 + 0.1 * (lab.research.insight || 0)) * (tr.prod || 1)).mul(Num.pow(tr.boost || TUNE.boost, save.meta.up.boost || 0)).mul(Num.pow(10, save.world.up.might || 0))
    .mul(1 + (save.world.up.starlight ? 0.05 * save.world.got.toNumber() : 0));
  if (rules.slow) m = m.mul(0.1);
  m = m.mul(1 + ACH_BONUS * achCount(save.games[id]));
  const g = GAMES[id];
  if (!rules.nolab) {
    for (const [key, n] of Object.entries(lab.pairs)) {
      if (!n || RECIPES[key]) continue;
      if (key.split('+').includes(id)) m = m.mul(linkMult(n, tr.link));
    }
    if (g.kind === 'fusion') m = m.mul(save.games[id].boost);
  }
  if (g.kind === 'fusion') m = m.mul(parentMult(save, g));
  for (const c of FUSIONS) {
    const cs = save.games[c.id];
    if (cs && c.parents.includes(id)) m = m.mul(givebackMult(cs));
  }
  return m;
}

const lg = (x) => Math.max(0, x.add(1).log10());
export const linkMult = (n, k = 1) => 1 + 0.15 * n * k;
export const parentMult = (save, g) => 1 + 0.05 * g.parents.reduce((a, p) => a + lg(save.games[p].life), 0);
export const givebackMult = (cs) => 1 + 0.02 * (cs.up.giveback || 0) * lg(cs.life);
// 誕生時に親の成長度から受け取る初期ボーナス
export const birthBoost = (save, g) => N(1 + 0.1 * g.parents.reduce((a, p) => a + lg(save.games[p].life), 0));

// 直近の刻みで求めた倍率を使い回す（別のセーブデータのぶんは使わない）
let cache = {};
let cacheOf = null;
export const getMult = (save, id) => (cacheOf === save && cache[id]) || extMult(save, id);

// セーブデータのルールを、費用計算などゲーム全体の条件へ写す
export function applyRules(save) {
  env.cost = (save.meta.rules.pricey ? 10 : 1) * (trait(save).cost || 1);
  env.pp = 2 ** (save.world.up.wisdom || 0) * (trait(save).pp || 1);
  env.seed = seedMoney(save);
}

export function tickAll(save, dt, visibleId) {
  applyRules(save);
  const manual = !!save.meta.rules.manual;
  const mults = {};
  const speed = 1.2 ** (save.world.up.speed || 0) * (trait(save).time || 1); // 時の流れ（星の強化）と、世界の性質
  for (const g of ORDER) if (save.games[g.id]) mults[g.id] = extMult(save, g.id);
  cache = mults;
  cacheOf = save;
  for (const g of ORDER) {
    const s = save.games[g.id];
    if (!s) continue;
    const before = s.life;
    g.tick(s, dt * speed, { mult: mults[g.id], visible: g.id === visibleId });
    // ここ 1 分ほどの実際の稼ぎ（他ゲームからの倍率を除く）。複製が写し取るのはこの値
    if (dt > 0) {
      const a = 1 - Math.exp(-dt / 60);
      s.avg = s.avg.mul(1 - a).add(s.life.sub(before).div(mults[g.id]).mul(a / dt));
    }
    // 複製は描画も個別の計算もせず、写し取った生産量を数値で足すだけ
    if (s.copies.length && !manual) earn(s, copySum(s).mul(mults[g.id]).mul(dt));
  }
  save.stats.play += dt;
  // 実績は 1 秒おきに確かめ、画面が知らせを出せるようにためておく
  achAcc += dt;
  if (achAcc >= 1) {
    achAcc = 0;
    for (const g of ORDER) {
      const s = save.games[g.id];
      if (s) for (const a of checkAch(g, s)) achNews.push({ game: g.id, ach: a });
    }
    if (achNews.length > 50) achNews.splice(0, achNews.length - 50);
  }
  if (save.meta.up.auto && !manual && !trait(save).noAuto) {
    autoAcc += dt;
    if (autoAcc >= 0.5) {
      autoAcc = 0;
      for (const g of autoGames(save)) buyCheapest(save, g, 5000);
    }
  }
  runAutomations(save, dt, manual);
}

// 係（星の強化）。転生係・複製係は「手仕事」のルールで止まり、実験係は「実験停止」で止まる
let jobAcc = 0;
const bornNews = [];
// 実験係が生んだ融合ゲームを取り出す（取り出すと空になる）
export const drainBorn = () => bornNews.splice(0);
function runAutomations(save, dt, manual) {
  jobAcc += dt;
  if (jobAcc < 2) return;
  jobAcc = 0;
  if (!manual && autoOn(save, 'autoprestige')) {
    for (const g of ORDER) {
      const s = save.games[g.id];
      // 転生ポイントの累計が倍になるなら転生する
      if (s && prestigeGain(g, s).gte(s.ppGot.max(3))) prestige(g, s);
    }
  }
  if (!manual && autoOn(save, 'autocopy')) bulkCopy(save);
  if (autoOn(save, 'autolab') && !save.meta.rules.nolab) {
    const ids = BASES.filter((g) => save.games[g.id]).map((g) => g.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]];
        if (!canExperiment(save, a, b)) continue;
        const c = expCost(save, a, b);
        if (c[a].mul(20).lte(save.games[a].amt) && c[b].mul(20).lte(save.games[b].amt)) {
          const r = experiment(save, a, b);
          // 融合ゲームが生まれたら、画面へ知らせる
          if (r && r.type === 'born') bornNews.push(r.game);
        }
      }
    }
  }
}

let achAcc = 0;
const achNews = [];
// 新しく達成された実績を取り出す（取り出すと空になる）
export const drainAch = () => achNews.splice(0);

// 自動購入が働くゲーム。本部の強化 1 段につき 1 本で、どのゲームに割り当てるかは自分で選ぶ
export const autoSlots = (save) => save.meta.up.auto || 0;
export const autoGames = (save) => ORDER.filter((g) => save.games[g.id] && save.meta.auto[g.id] === true).slice(0, autoSlots(save));
// 割り当てを切り替える。枠が埋まっていれば入れられない
export function toggleAuto(save, id) {
  if (save.meta.auto[id] === true) save.meta.auto[id] = false;
  else if (autoGames(save).length < autoSlots(save)) save.meta.auto[id] = true;
}

// 買える強化を安い順に、最大 limit 回買う。買った回数を返す
let autoAcc = 0;
function buyCheapest(save, g, limit) {
  const s = save.games[g.id];
  if (!s) return 0;
  let bought = 0;
  // 1 回の呼び出しで見直すのは 60 回まで（半分ずつまとめて買うので、これで十分に買い切れる）
  for (let pass = 0; pass < 60 && bought < limit; pass++) {
    let best = null;
    let bestCost = null;
    for (const u of g.upgrades) {
      const lv = s.up[u.id] || 0;
      if (u.max != null && lv >= u.max) continue;
      if (!upShown(s, u) || u.autoSkip?.(s)) continue;
      const cost = gameCost(g, s, u);
      if (!best || cost.lt(bestCost)) {
        best = u;
        bestCost = cost;
      }
    }
    if (!best || bestCost.gt(s.amt)) break;
    // いちばん安いものを、買える数の半分ずつまとめて買う（1 段ずつだと、段数が増えた後半に買い物が追いつかない）
    const k = best.autoSkip ? 1 : Math.max(1, Math.min(limit - bought, Math.floor(gameAfford(g, s, best) / 2)));
    bought += gameBuy(g, s, best, k) || 1;
  }
  return bought;
}

// ---- 複製（本部の第 2 段階）----
// 育てたゲームの「今の生産量」を写し取った複製を置く。複製は写し取った時点の生産量を出し続ける。
// 個別転生では残り、総転生で消える。
const copySum = (s) => s.copies.reduce((a, c) => a.add(c), ZERO);
export const copySlots = (save) => save.meta.up.copies || 0;
export const copyRate = (save, id) => (save.meta.rules.manual ? ZERO : copySum(save.games[id]).mul(getMult(save, id)));
export const totalRate = (save, id) => GAMES[id].rate(save.games[id], { mult: getMult(save, id) }).add(copyRate(save, id));

const weakest = (s) => s.copies.reduce((a, c) => (c.lt(a) ? c : a));
// 瞬間の生産量ではなく、ここ 1 分ほどの実際の稼ぎを写す（一時的に跳ね上がった瞬間を写しても得をしない）
const snapshot = (save, id) => save.games[id].avg;

// 費用は今の生産量の 2 分ぶんから始まり、複製が増えるごとに 3 倍
export function copyCost(save, id) {
  const s = save.games[id];
  const n = Math.min(s.copies.length, Math.max(0, copySlots(save) - 1));
  return s.avg.mul(getMult(save, id)).mul(120).mul(Num.pow(3, n));
}

// 'ok' のとき複製できる。それ以外は理由
export function copyState(save, id) {
  const s = save.games[id];
  if (save.meta.rules.manual) return 'rule';
  const snap = snapshot(save, id);
  if (snap.lte(0)) return 'idle';
  if (s.copies.length >= copySlots(save) && !snap.gt(weakest(s))) return 'weaker';
  return s.amt.gte(copyCost(save, id)) ? 'ok' : 'cost';
}

// 枠が埋まっていれば、いちばん弱い複製と置き換える
export function makeCopy(save, id) {
  if (copySlots(save) < 1 || copyState(save, id) !== 'ok') return false;
  const s = save.games[id];
  const snap = snapshot(save, id);
  s.amt = s.amt.sub(copyCost(save, id)).max(ZERO);
  if (s.copies.length >= copySlots(save)) s.copies.splice(s.copies.indexOf(weakest(s)), 1);
  s.copies.push(snap);
  return true;
}

// ---- 一括管理 ----
export function bulkBuy(save) {
  let n = 0;
  for (const g of ORDER) n += buyCheapest(save, g, 100000);
  return n;
}

export function bulkPrestige(save) {
  let n = 0;
  for (const g of ORDER) if (save.games[g.id] && prestige(g, save.games[g.id])) n++;
  return n;
}

export function bulkCopy(save) {
  let n = 0;
  for (const g of ORDER) if (save.games[g.id] && makeCopy(save, g.id)) n++;
  return n;
}

// 長い経過をまとめて進める（オフライン復帰、スリープ明け）。各ゲームの tick は長い dt を集計で処理できる。
export function simulate(save, seconds) {
  const steps = Math.min(200, Math.max(1, Math.ceil(seconds / 0.5)));
  for (let i = 0; i < steps; i++) tickAll(save, seconds / steps, null);
}

export const offlineCap = (save) => 3600 * (4 + 2 * (save.lab.research.offline || 0) + 4 * (save.world.up.offline || 0));

// 終了中の経過ぶんを進め、ゲームごとの増加量を返す
export function runOffline(save, now = Date.now()) {
  const elapsed = (now - save.lastTime) / 1000;
  save.lastTime = now;
  if (!(elapsed > 30) || trait(save).noOffline) return null;
  const used = Math.min(elapsed, offlineCap(save));
  const before = {};
  for (const g of ORDER) if (save.games[g.id]) before[g.id] = save.games[g.id].life;
  simulate(save, used);
  const gains = [];
  for (const id of Object.keys(before)) {
    const d = save.games[id].life.sub(before[id]);
    if (d.gt(0)) gains.push({ id, amount: d });
  }
  return { elapsed, used, gains };
}

// ---- 解放 ----
// 序盤（採掘、ブロック崩し）は順番が決まっている。そのあとは残りの基本ゲームから自分で選ぶ。
const CHOICE_NEED = 1500; // 直前に解放したゲームで、これだけ累計を稼ぐと次を選べる

// いま解放の候補になっている基本ゲーム
export function lockedOptions(save) {
  const fixed = BASES.find((g) => !save.games[g.id] && g.unlock && !g.unlock.choice);
  if (fixed) return [fixed];
  return BASES.filter((g) => !save.games[g.id] && g.unlock && g.unlock.choice);
}
export const nextLocked = (save) => lockedOptions(save)[0] || null;

// 解放の条件と費用。選べるゲームは、どれを選んでも同じ（選んだ数が増えるほど高くなる）
export function unlockInfo(save, g) {
  if (!g.unlock.choice) return g.unlock;
  const bases = Object.keys(save.games).filter((id) => GAMES[id].kind === 'base');
  const k = bases.filter((id) => GAMES[id].unlock && GAMES[id].unlock.choice).length;
  return { life: { [bases[bases.length - 1]]: CHOICE_NEED }, cost: { clicker: TUNE.unlockCost[k] }, stars: TUNE.unlockStars[k], coins: TUNE.unlockCoins[k] };
}

export function unlockReady(save, g) {
  const u = unlockInfo(save, g);
  for (const [id, need] of Object.entries(u.life || {})) {
    if (!save.games[id] || save.games[id].life.lt(need)) return false;
  }
  if (u.stars && save.world.got.lt(u.stars)) return false;
  if (u.coins && save.meta.life.lt(u.coins)) return false;
  return (u.games || []).every((id) => save.games[id]);
}

export function canUnlock(save, g) {
  if (!unlockReady(save, g)) return false;
  return Object.entries(unlockInfo(save, g).cost).every(([id, c]) => save.games[id] && save.games[id].amt.gte(c));
}

export function unlockGame(save, g) {
  if (save.games[g.id] || !canUnlock(save, g)) return false;
  for (const [id, c] of Object.entries(unlockInfo(save, g).cost)) save.games[id].amt = save.games[id].amt.sub(c);
  save.games[g.id] = g.newState();
  return true;
}

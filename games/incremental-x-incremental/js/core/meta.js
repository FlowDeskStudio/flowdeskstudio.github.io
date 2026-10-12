// 上位階層「本部」。ゲーム群をまとめて転生させ（総転生）、コインでゲーム全体を強化する。
import { Num, N, ZERO } from './num.js';
import { ORDER, GAMES } from './registry.js';
import { FOREVER } from './engine.js';
import { TUNE } from './tune.js';

export const META_UP = [
  { id: 'boost', base: 1, pow: TUNE.boostPow }, // すべてのゲームの生産 ×2（費用はべき乗で伸びる）
  { id: 'auto', base: 3, r: 1.8, max: 16 }, // 強化を自動購入できるゲーム +1
  { id: 'catalyst', base: 2, r: 3, max: 5 }, // 実験の費用を半分に
  { id: 'copies', base: 4, r: 4, max: 5 }, // ゲームごとの複製枠 +1
  { id: 'rules', base: 150, r: 1, max: 1 }, // ルール変更（本部に慣れたころに開く）
  { id: 'seed', base: 6, r: 5, max: 8 }, // 総転生のあと、どのゲームも元手を持って始まる
];

// ルール変更（本部の第 3 段階）。あらかじめ用意した縛りを選ぶと、その周のコインが増える。
// 選んだルールは次の総転生から効き、その周のあいだは変えられない。組み合わせると倍率は掛け算になる。
export const RULES = [
  { id: 'slow', bonus: 2 }, // すべての生産が 10 分の 1
  { id: 'pricey', bonus: 1.6 }, // 強化の費用が 10 倍
  { id: 'nolab', bonus: 2 }, // 実験できず、実験の成果（相互強化・融合ゲームの倍率）も効かない
  { id: 'manual', bonus: 1.3 }, // 自動購入と複製が止まる
];
// 元手：転生・総転生・新世界のあと、各ゲームが持って始まる資源（自動購入が、手を出さなくても動き出せるように）
export const seedMoney = (save) => (save.meta.up.seed ? N(1000).mul(Num.pow(100, save.meta.up.seed)) : ZERO);
export const ruleBonus = (rules) => RULES.reduce((m, r) => (rules[r.id] ? m * r.bonus : m), 1);

const OPEN_AT = TUNE.openAt; // 本部が開く合計桁数
const FIRST_AT = TUNE.firstAt; // 最初のコインが得られる合計桁数
// 成長度がこれを超えたぶんは、コインが倍々で増える（成長度は桁数の合計なので、伸びは時間に対してゆるやかになる。
// べき乗だけだと、周を重ねるほど次の強化が遠のいて行き詰まる）
export const coinBase = (sc) => (sc < FIRST_AT ? 0 : (sc / FIRST_AT) ** TUNE.coinPow);

// ゲームの成長度＝今回の総転生周で稼いだ累計の桁数
export const digits = (s) => Math.max(0, s.life.add(1).log10());

export function score(save) {
  let sum = 0;
  for (const g of ORDER) if (save.games[g.id]) sum += digits(save.games[g.id]);
  return sum;
}

export function metaUnlocked(save) {
  const m = save.meta;
  if (!m.unlocked && Object.keys(save.games).length >= 4 && score(save) >= OPEN_AT) m.unlocked = true;
  return m.unlocked;
}

export const openAt = () => OPEN_AT;
export const firstAt = () => FIRST_AT;

export function coinGain(save) {
  const sc = score(save);
  return sc < FIRST_AT ? ZERO : N(coinBase(sc) * ruleBonus(save.meta.rules)).mul(1 + MINT * worldLvl(save, 'mint')).mul(trait(save).coin || 1).floor();
}

// 通常資源・強化・個別転生を戻す。解放済みのゲーム、実験の成果、研究、本部の強化は残る。
export function grandReset(save) {
  const gain = coinGain(save);
  if (gain.lt(1)) return null;
  for (const id of Object.keys(save.games)) {
    const old = save.games[id];
    const fresh = GAMES[id].newState();
    for (const k of FOREVER) fresh[k] = old[k];
    if ('hpu' in old) fresh.hpu = old.hpu;
    GAMES[id].onReset?.(fresh);
    fresh.amt = fresh.amt.add(seedMoney(save));
    save.games[id] = fresh;
  }
  const m = save.meta;
  m.coins = m.coins.add(gain);
  m.got = m.got.add(gain);
  m.life = m.life.add(gain); // これまでの累計（新世界へ行っても残る）
  m.resets++;
  if (RULES.every((r) => m.rules[r.id])) m.fullRuleRuns++; // すべての縛りを掛けた周をやり遂げた
  m.rules = { ...m.rulesNext };
  return gain;
}

export const metaLvl = (save, id) => save.meta.up[id] || 0;
// ゲーム内の物価（ルール変更）に左右されないよう、ここで直接求める
// 費用：r があれば倍々、pow があれば（段数 + 1）のべき乗
const costAt = (u, lv) => (u.pow ? N(Math.ceil(u.base * (lv + 1) ** u.pow)) : N(u.base).mul(Num.pow(u.r, lv)).floor());
export const metaCost = (save, u) => costAt(u, metaLvl(save, u.id));

export function buyMeta(save, u) {
  const lv = metaLvl(save, u.id);
  const cost = metaCost(save, u);
  if ((u.max != null && lv >= u.max) || save.meta.coins.lt(cost)) return false;
  save.meta.coins = save.meta.coins.sub(cost).max(ZERO);
  save.meta.up[u.id] = lv + 1;
  return true;
}

// ---- 新世界（本部の第 4 段階）----
// 本部ごとたたんで、新しい世界でやり直す。この世界で稼いだコインの桁数に応じて「星」が手に入り、
// 星の強化は世界をまたいで残る。コインは成長度（桁数の合計）から決まるので、周を重ねるほど伸びが鈍る。
// 星はその上にもう一段、桁の違う伸びを足す。
export const WORLD_UP = [
  { id: 'might', base: 1, pow: 3 }, // すべてのゲームの生産 ×10
  { id: 'mint', base: 1, pow: 3 }, // コイン +100%
  { id: 'wisdom', base: 2, pow: 3 }, // 個別転生で得る量 ×2
  { id: 'footing', base: 2, r: 1.6, max: 10 }, // 新しい世界を、全体増産 +2 段から始める
  { id: 'legacy', base: 3, r: 1, max: 1 }, // 新世界へ行っても、自動購入の枠・触媒・元手が残る
  // 係：周回が速くなるほど増える手間を、順に任せていく
  { id: 'autoprestige', base: 4, r: 1, max: 1 }, // 転生係：転生ポイントが倍になるたびに、自動で転生する
  { id: 'autocopy', base: 4, r: 1, max: 1 }, // 複製係：置ける複製を自動で置く
  { id: 'autolab', base: 6, r: 1, max: 1 }, // 実験係：手持ちの 5% 以下で済む実験を自動で行う
  // 先の長い強化
  { id: 'offline', base: 3, r: 2, max: 5 }, // 閉じているあいだに進む時間 +4 時間
  { id: 'speed', base: 10, r: 3, max: 5 }, // すべてのゲームの時間が 1.2 倍の速さで流れる
  { id: 'starlight', base: 15, r: 1, max: 1 }, // これまでに集めた星 1 つにつき、全ゲーム +5%
];
export const MIGHT = 10;
export const MINT = 1; // 造幣 1 段につきコイン +100%（倍々にすると、星 → コイン → 星の循環が走りすぎる）
export const WISDOM = 2;
export const FOOTING = 2;
const WORLD_AT = TUNE.worldAt; // この世界で稼いだコインがここに届くと、新世界が見えてくる

export const worldLvl = (save, id) => save.world.up[id] || 0;
export const worldCost = (save, u) => costAt(u, worldLvl(save, u.id));
export const worldOpenAt = () => WORLD_AT;

export function worldUnlocked(save) {
  const w = save.world;
  if (!w.unlocked && save.meta.got.gte(WORLD_AT)) w.unlocked = true;
  return w.unlocked;
}

// 星の合計＝starBase ×（ひとつの世界で稼いだコイン ÷ 見えてくるコイン）の starPow 乗。これまでの最高を超えたぶんだけ、新しく手に入る
// （同じ深さを繰り返しても増えない。個別の転生と同じ考え方）
export const starTotal = (got) => (got.lt(WORLD_AT) ? 0 : Math.floor(TUNE.starBase * 10 ** ((got.log10() - Math.log10(WORLD_AT)) * TUNE.starPow)));
export function starGain(save) {
  return N(Math.max(0, starTotal(save.meta.got) - save.world.got.toNumber()));
}

// ゲームの進み、コイン、本部の強化とルールを戻す。解放済みのゲーム、実験の成果、ツリー、実績、星の強化は残る。
export function worldReset(save, traitId = 'plain') {
  const gain = starGain(save);
  if (gain.lt(1)) return null;
  const m = save.meta;
  // 総転生と同じ手順でゲームを戻す（コインは受け取らない）
  for (const id of Object.keys(save.games)) {
    const old = save.games[id];
    const fresh = GAMES[id].newState();
    for (const k of FOREVER) fresh[k] = old[k];
    if ('hpu' in old) fresh.hpu = old.hpu;
    GAMES[id].onReset?.(fresh);
    save.games[id] = fresh;
  }
  const keep = worldLvl(save, 'legacy') > 0 ? { auto: m.up.auto || 0, catalyst: m.up.catalyst || 0, seed: m.up.seed || 0 } : {};
  m.up = { ...keep, rules: m.up.rules || 0 };
  if (worldLvl(save, 'footing')) m.up.boost = FOOTING * worldLvl(save, 'footing');
  for (const id of Object.keys(save.games)) save.games[id].amt = save.games[id].amt.add(seedMoney(save));
  m.coins = ZERO;
  m.got = ZERO;
  m.rules = {};
  m.rulesNext = {};
  const w = save.world;
  w.stars = w.stars.add(gain);
  w.got = w.got.add(gain);
  w.resets++;
  // 次の世界の性質（まだ選べないものを指定されたら、ふつうの世界）
  w.trait = TRAIT_OF[traitId] && traitOpen(save, TRAIT_OF[traitId]) ? traitId : 'plain';
  return gain;
}

export function buyWorld(save, u) {
  const lv = worldLvl(save, u.id);
  const cost = worldCost(save, u);
  if ((u.max != null && lv >= u.max) || save.world.stars.lt(cost)) return false;
  save.world.stars = save.world.stars.sub(cost).max(ZERO);
  save.world.up[u.id] = lv + 1;
  return true;
}

// 係（自動化）は、持っていても止めておける
export const AUTOMATIONS = ['autoprestige', 'autocopy', 'autolab'];
export const autoOn = (save, id) => worldLvl(save, id) > 0 && save.world.off[id] !== true;
export function toggleAutomation(save, id) {
  if (worldLvl(save, id) > 0) save.world.off[id] = !save.world.off[id];
}

// ---- 世界の性質 ----
// 新世界へ行くときに、次の世界の性質を選ぶ。良い面と悪い面があり、同じゲーム群でも進め方が変わる。
// stars は選べるようになる星の累計。数値は倍率（書いていないものは 1）。
// このゲームの伸びは桁数で決まるので、ただの倍率は効きが小さい。効くのは全体増産の底・連携の強さ・コインの倍率。
// 星はコインに比例するので、コインの倍率はそのまま星の倍率になる（大きくすると、その性質だけが飛び抜ける）。
// どの性質も「ふつうの世界」の ±3 割くらいに収まるよう、自動プレイで比べて決めた。
export const TRAITS = [
  { id: 'plain', stars: 0 },
  { id: 'fertile', stars: 8, prod: 10, cost: 3 }, // 実りは多いが、物価も高い
  { id: 'bonds', stars: 15, link: 2, boost: 1.9 }, // 連携が強く、全体増産は弱い
  { id: 'swift', stars: 30, time: 2, noOffline: true }, // 時間が速く流れるが、閉じているあいだは進まない
  { id: 'craft', stars: 45, pp: 5, noAuto: true }, // 転生の実入りが多いが、自動購入が使えない
  { id: 'gold', stars: 120, coin: 1.5, prod: 0.001 }, // コインは多いが、生産はとても少ない
  { id: 'tide', stars: 450, boost: 2.1, link: 0.5 }, // 全体増産が強く、連携は弱い（絆の世界の逆）
  { id: 'scholar', stars: 550, lab: 0.01, coin: 0.9 }, // 実験がとても安いが、コインは少ない
];
const TRAIT_OF = Object.fromEntries(TRAITS.map((x) => [x.id, x]));
export const trait = (save) => TRAIT_OF[save.world.trait] || TRAITS[0];
export const traitOpen = (save, tr) => save.world.got.gte(tr.stars);

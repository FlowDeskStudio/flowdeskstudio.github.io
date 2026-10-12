// 「次の目標」。画面上部に 1 つずつ出して、遊びながら基本の流れを覚えてもらう。
// prog は [現在値, 目標値] を返すと進み具合の棒が出る。
import { GAMES, BASES, FUSIONS, FUSIONS1 } from './registry.js';
import { score, openAt, worldOpenAt } from './meta.js';
import { nextLocked, unlockInfo } from './world.js';
import { STAR_GOALS } from './milestones.js';

const life = (save, id) => (save.games[id] ? save.games[id].life : null);
const up = (save, id, u) => (save.games[id] ? save.games[id].up[u] || 0 : 0);
const num = (x, cap) => (x ? Math.min(cap, x.toNumber()) : 0);
const have = (save, list) => list.filter((g) => save.games[g.id]).length;
const experiments = (save) => Object.values(save.lab.pairs).reduce((a, n) => a + n, 0);

export const STEPS = [
  { id: 'click', done: (s) => life(s, 'clicker').gte(15), prog: (s) => [num(life(s, 'clicker'), 15), 15] },
  { id: 'picker', done: (s) => up(s, 'clicker', 'picker') >= 1 },
  { id: 'grow', done: (s) => life(s, 'clicker').gte(3000), prog: (s) => [num(life(s, 'clicker'), 3000), 3000] },
  { id: 'mining', done: (s) => !!s.games.mining },
  { id: 'dig', done: (s) => s.games.mining.best >= 5, prog: (s) => [s.games.mining.best, 5] },
  { id: 'drill', done: (s) => up(s, 'mining', 'drill') >= 1 },
  { id: 'lab', done: (s) => s.lab.unlocked, prog: (s) => [num(life(s, 'mining'), 150), 150] },
  { id: 'fuse', done: (s) => experiments(s) >= 1 },
  { id: 'heat', done: (s) => life(s, 'smeltery') && life(s, 'smeltery').gte(50), prog: (s) => [num(life(s, 'smeltery'), 50), 50] },
  { id: 'breakout', done: (s) => !!s.games.breakout },
  { id: 'link', done: (s) => Object.keys(s.lab.pairs).length >= 2 },
  { id: 'prestige', done: (s) => s.meta.resets > 0 || Object.keys(GAMES).some((id) => s.games[id] && s.games[id].prestiges > 0) },
  { id: 'meta', done: (s) => s.meta.unlocked, prog: (s) => [Math.min(openAt(), score(s)), openAt()] },
  { id: 'coin', done: (s) => s.meta.resets > 0 },
  { id: 'metaup', done: (s) => Object.keys(s.meta.up).length > 0 },
  // ここから先は、ゲーム群全体を育てる目標
  { id: 'auto', done: (s) => Object.values(s.meta.auto).some((v) => v === true) },
  // near: true の目標は達成までが長いので、帯には「いちばん近い具体的な目当て」（nearGoal）を出す
  { id: 'bases', near: true, done: (s) => have(s, BASES) >= BASES.length, prog: (s) => [have(s, BASES), BASES.length] },
  { id: 'fusions', near: true, done: (s) => have(s, FUSIONS1) >= FUSIONS1.length, prog: (s) => [have(s, FUSIONS1), FUSIONS1.length] },
  { id: 'world', done: (s) => s.world.resets > 0 || s.meta.got.gte(worldOpenAt()), prog: (s) => [num(s.meta.got, worldOpenAt()), worldOpenAt()] },
  { id: 'star', done: (s) => s.world.resets > 0 },
];

export function currentStep(save) {
  return STEPS[save.guide.step] || null;
}

// 達成していたら次へ進める。進んだら true
export function advance(save) {
  const st = currentStep(save);
  if (!st || !st.done(save)) return false;
  save.guide.step++;
  return true;
}

// いちばん近い、具体的な目当て。長い目標のあいだと、目標をすべて終えたあとに帯へ出す。
// 「次に何が開くか、あとどれだけか」がいつも見えるようにして、待つだけの時間を減らす。
// 戻り値：{ kind, cur, need, game?, res? }（数は Num か数値）。無ければ null
export function nearGoal(save) {
  const g = nextLocked(save);
  if (g) {
    const u = unlockInfo(save, g);
    if (u.coins && save.meta.life.lt(u.coins)) return { kind: 'coins', cur: save.meta.life, need: u.coins };
    if (u.stars && save.world.got.lt(u.stars)) return { kind: 'stars', cur: save.world.got, need: u.stars };
    for (const [id, need] of Object.entries(u.life || {})) {
      if (save.games[id] && save.games[id].life.lt(need)) return { kind: 'life', cur: save.games[id].life, need, game: id };
    }
    for (const [id, need] of Object.entries(u.cost || {})) {
      if (save.games[id] && save.games[id].amt.lt(need)) return { kind: 'cost', cur: save.games[id].amt, need, res: id };
    }
    return { kind: 'ready' };
  }
  // 星で開く融合ゲーム（親がそろっているもの）
  const f = FUSIONS.filter((x) => !save.games[x.id] && x.stars && x.parents.every((p) => save.games[p])).sort((a, b) => a.stars - b.stars)[0];
  if (f) return save.world.got.lt(f.stars) ? { kind: 'fusion', cur: save.world.got, need: f.stars, game: f.id } : { kind: 'lab', game: f.id };
  const goal = STAR_GOALS.find((v) => save.world.got.lt(v));
  if (goal) return { kind: 'goal', cur: save.world.got, need: goal };
  return null;
}

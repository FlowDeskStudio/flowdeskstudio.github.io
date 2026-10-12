// 節目。区切りとして一度だけ知らせる。すべての節目を迎えるとエンディング。達成後もそのまま続く。
import { BASES, FUSIONS, FUSIONS1 } from './registry.js';

// 星の節目（集めた星の累計）
export const STAR_GOALS = [150, 300, 900];

export const MILESTONES = [
  { id: 'bases', done: (s) => BASES.every((g) => s.games[g.id]) },
  { id: 'fusions', done: (s) => FUSIONS1.every((g) => s.games[g.id]) },
  { id: 'fusions2', done: (s) => FUSIONS.every((g) => s.games[g.id]) },
  { id: 'rules', done: (s) => s.meta.fullRuleRuns > 0 },
  { id: 'world', done: (s) => s.world.resets > 0 },
  { id: 'stars1', done: (s) => s.world.got.gte(STAR_GOALS[0]) },
  { id: 'stars2', done: (s) => s.world.got.gte(STAR_GOALS[1]) },
  { id: 'stars3', done: (s) => s.world.got.gte(STAR_GOALS[2]) },
];
// エンディング：ほかの節目をすべて迎えたとき。達成後もそのまま続けられる
MILESTONES.push({ id: 'ending', done: (s) => MILESTONES.every((m) => m.id === 'ending' || s.milestones[m.id]) });

// 新しく達成した節目を記録して返す
export function checkMilestones(save) {
  const fresh = [];
  for (const m of MILESTONES) {
    if (!save.milestones[m.id] && m.done(save)) {
      save.milestones[m.id] = Math.round(save.stats.play);
      fresh.push(m);
    }
  }
  return fresh;
}

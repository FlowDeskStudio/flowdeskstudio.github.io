// 基本ゲーム6：迷路探索。未踏の迷路は手探りで時間がかかるが、初踏破の宝がある。
// 踏破済みの迷路は地図があるので速く回れる。「先へ進むか、回り慣れた迷路を周回するか」を選ぶ遊び。
// 迷路には種類があり（宝物庫、霧の迷路、主の間）、初踏破で遺物が見つかる。駆け足、改良、地図で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, alpha, lin, rr, disc, line, tag, glow, gem, coin, sparkle, pawpaw, tier, artOn } from '../ui/draw.js';
import { mazeArtReady, drawMaze } from './maze_art.js';

const FIRST = 5; // 初踏破の宝の倍率
const PUSH_WITHIN = 20; // 自動判断：次の迷路がこの秒数で踏破できるなら進む

// 迷路の種類。主の間は 10 個ごと、宝物庫は 5 個ごと、霧の迷路は 7 個ごと
const kindOf = (L) => (L % 10 === 9 ? 'lord' : L % 5 === 4 ? 'vault' : L % 7 === 6 ? 'fog' : 'plain');
const stepsAt = (L) => N(30).mul(Num.pow(1.16, L)).mul(kindOf(L) === 'lord' ? 8 : 1);
// 宝の伸びは、60 個目の迷路から先でゆるやかになる
const BEND = 60;
const rewardAt = (s, L) => {
  const k = kindOf(L);
  return N(5).mul(Num.pow(1.13, Math.min(L, BEND))).mul(Num.pow(1.085, Math.max(0, L - BEND))).mul(k === 'lord' ? 25 : k === 'vault' ? 5 * 1.5 ** treeLvl(s, 'vault') : 1);
};

// 改良（1 回きり）
const WALKER_TIERS = [{ own: 10, cost: 300 }, { own: 50, cost: 45000 }, { own: 150, cost: 4.5e7 }];
const CLEAR_TIERS = [{ n: 100, cost: 3000 }, { n: 1000, cost: 3e5 }, { n: 10000, cost: 3e7 }];
const RELIC_UPS = [3, 8, 15, 25, 40]; // 今回の周で見つけた遺物の数
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

// 駆け足：しばらくのあいだ歩く速さ 3 倍
const DASH = { mult: 3, sec: 15, cd: 60 };
const dashCd = (s) => DASH.cd * 0.9 ** treeLvl(s, 'dashcool');
const dashSec = (s) => DASH.sec * (1 + 0.2 * treeLvl(s, 'dashpower'));
const hasAutoDash = (s) => treeLvl(s, 'autodash') > 0;

const ppPer = (s) => 0.15 + 0.03 * treeLvl(s, 'mappower');
// 駆け足の効果を除いた歩く速さ
function speed(s) {
  const n = lvl(s, 'walker');
  return N(2 * n * milestoneMult(n) * 2 ** count(s, 'walker_t', WALKER_TIERS.length) * 1.3 ** count(s, 'relic', RELIC_UPS.length))
    .mul(Num.pow(1.25, lvl(s, 'boots'))).mul(Num.pow(1.15, treeLvl(s, 'cartography')));
}
// 未踏の迷路で余計に歩く倍率（2 倍 → コンパスで 1 倍に近づく）。霧の迷路ではさらに 1.5 倍
const explore = (s, L = s.level) => (1 + 1 / (1 + 0.25 * lvl(s, 'compass'))) * (kindOf(L) === 'fog' ? 1.5 : 1);
// 主の間を初めて踏破するたびに、宝の量が永続で +10%
const lords = (s) => Math.floor((Math.max(s.stats.deepest ?? -1, s.deep) + 1) / 10);
const valMult = (s, ctx) => Num.pow(1.15, lvl(s, 'treasure')).mul(2 ** count(s, 'clear_t', CLEAR_TIERS.length))
  .mul((1 + 0.02 * s.relics) * (1 + 0.1 * lords(s))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const isNew = (s) => s.level > s.best;
const need = (s) => stepsAt(s.level).mul(isNew(s) ? explore(s) : 1);
const hasAuto = (s) => lvl(s, 'autopush') > 0;
const pushWorth = (s) => stepsAt(s.best + 1).mul(explore(s, s.best + 1)).div(speed(s)).toNumber() <= PUSH_WITHIN;
const wantPush = (s) => (hasAuto(s) ? pushWorth(s) : s.mode === 'push');

// 次に入る迷路を決める
function enter(s) {
  const level = wantPush(s) ? s.best + 1 : Math.max(0, s.best);
  if (level !== s.level) {
    s.level = level;
    s.prog = ZERO;
  }
}

function clear(s, ctx) {
  const first = isNew(s);
  const got = rewardAt(s, s.level).mul(valMult(s, ctx)).mul(first ? FIRST : 1);
  earn(s, got);
  if (first) {
    // 初踏破：遺物が見つかる（主の間は 3 つ）
    const found = kindOf(s.level) === 'lord' ? 3 : 1;
    s.relics += found;
    s.stats.relics = (s.stats.relics || 0) + found;
    s.best = s.level;
    if (s.best > s.deep) s.deep = s.best;
    if (s.best > (s.stats.deepest ?? -1)) s.stats.deepest = s.best;
  }
  s.clears++;
  s.stats.clears = (s.stats.clears || 0) + 1;
  s.prog = ZERO;
  enter(s);
  return got;
}

function dash(s) {
  if (s.dash > 0) return false;
  s.dash = dashCd(s);
  s.buffs.dash = dashSec(s);
  s.stats.dashes = (s.stats.dashes || 0) + 1;
  return true;
}

const tierUp = (base, prefix, tiers, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr('c.tier.n', { g: tr(`maze.up.${base}.n`), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'maze',
  kind: 'base',
  icon: '🧭',
  ppPer,
  keep: ['deep', 'mode'],
  unlock: { choice: true },

  // 探索者 1 人から始まる。best は踏破済みのいちばん深い迷路（-1 は未踏破）、relics は今回の周で見つけた遺物
  newState: () => ({
    ...baseState(), up: { walker: 1 }, level: 0, best: -1, deep: -1, prog: ZERO, mode: 'push', clears: 0,
    relics: 0, dash: 0, buffs: { dash: 0 },
  }),

  upgrades: [
    { id: 'walker', base: 15, r: 1.15, gen: true, val: (s) => fmt(speed(s), 1) },
    { id: 'boots', base: 80, r: 1.6 },
    { id: 'compass', base: 120, r: 2, max: 12, val: (s) => explore(s, 0).toFixed(2) },
    { id: 'treasure', base: 200, r: 1.8 },
    { id: 'autopush', base: 3000, r: 1, max: 1, show: (s) => s.clears >= 5 },
    ...tierUp('walker', 'walker_t', WALKER_TIERS, 'maze.tier.walker', (s, tier) => lvl(s, 'walker') >= tier.own),
    ...tierUp('treasure', 'clear_t', CLEAR_TIERS, 'maze.tier.clear', (s, tier) => (s.stats.clears || 0) >= tier.n),
    ...RELIC_UPS.map((n, i) => ({
      id: `relic${i}`,
      base: 600 * 30 ** i,
      r: 1,
      max: 1,
      once: true,
      show: (s) => s.relics >= n,
      name: (tr) => tr('maze.relicup.n', { k: ROMAN[i] }),
      desc: (tr) => tr('maze.relicup.d'),
    })),
  ],

  // 地図で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 2, max: 5 },
    { id: 'dashpower', base: 1, r: 2, max: 5 },
    { id: 'dashcool', base: 2, r: 2, max: 5 },
    { id: 'autodash', base: 15, max: 1, req: { dashcool: 2 } },
    { id: 'vault', base: 3, r: 2, max: 5 },
    { id: 'mappower', base: 5, r: 2.5, max: 5 },
    // 先の長い枝
    { id: 'cartography', base: 10, r: 1.6, max: 20, req: { mappower: 1 } },
  ],

  achievements: [
    ...[5, 10, 25, 50, 100, 150, 200].map((v) => ({ id: `maze${v}`, type: 'maze', v, done: (s) => Math.max(s.stats.deepest ?? -1, s.deep) + 1 >= v })),
    ...[10, 100, 1000, 10000].map((v) => ({ id: `clears${v}`, type: 'clears', v, done: (s) => (s.stats.clears || 0) >= v })),
    ...[10, 50, 200].map((v) => ({ id: `relics${v}`, type: 'relics', v, done: (s) => (s.stats.relics || 0) >= v })),
    ...[1, 5, 20].map((v) => ({ id: `lords${v}`, type: 'lords', v, done: (s) => lords(s) >= v })),
    ...[1e3, 1e6, 1e9, 1e12].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「古い地図」のぶんの迷路を、踏破済みとして始める
  onReset(s) {
    const mapped = 5 * treeLvl(s, 'start') - 1;
    if (mapped > s.best) {
      // 飛ばした迷路で拾えたはずの宝を持って始める（探索者を雇えないと、深い迷路では足が進まない）
      let loot = ZERO;
      for (let L = s.best + 1; L <= mapped; L++) loot = loot.add(rewardAt(s, L));
      earn(s, loot.mul(FIRST).mul(ppMult(s, ppPer(s))));
      s.best = mapped;
      enter(s);
    }
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    // 駆け足は、この刻みのうち効いていた割合でならす
    let boost = 1 + ((DASH.mult - 1) * Math.min(dt, s.buffs.dash)) / dt;
    if (hasAutoDash(s)) {
      if (dt > 5) boost = 1 + ((DASH.mult - 1) * dashSec(s)) / dashCd(s);
      else if (s.dash <= 0) dash(s);
    }
    s.buffs.dash = Math.max(0, s.buffs.dash - dt);
    s.dash = Math.max(0, s.dash - dt);
    const v = speed(s).mul(boost);
    if (hasAuto(s)) enter(s);
    for (let i = 0; i < 3000 && dt > 0; i++) {
      const left = need(s).sub(s.prog).div(v).toNumber();
      if (left <= dt) {
        dt -= left;
        clear(s, ctx);
      } else {
        s.prog = s.prog.add(v.mul(dt));
        dt = 0;
      }
    }
    // 周回が速すぎて回しきれなかった残りは、1 周あたりの実入りで集計する
    if (dt > 0 && !isNew(s)) earn(s, rewardAt(s, s.level).mul(valMult(s, ctx)).mul(v).div(stepsAt(s.level)).mul(dt));
  },

  rate(s, ctx) {
    return rewardAt(s, s.level).mul(valMult(s, ctx)).mul(isNew(s) ? FIRST : 1).mul(speed(s)).mul(s.buffs.dash > 0 ? DASH.mult : 1).div(need(s));
  },

  // 自分で走る：0.2 秒ぶん（最低 1 歩）進む
  click(s, ctx) {
    s.clicks++;
    s.prog = s.prog.add(speed(s).mul(0.2).max(1));
    return s.prog.gte(need(s)) ? clear(s, ctx) : null;
  },

  dash,

  setMode(s, mode) {
    s.mode = mode;
    enter(s);
  },

  prestigeTotal(s) {
    if (s.deep < 14) return ZERO;
    return N(Math.floor(((s.deep + 1) / 15) ** 2));
  },

  mount(el, api) {
    const SIZE = 300;
    const cv = h('canvas', { class: 'field maze', width: SIZE * 2, height: SIZE * 2 });
    const g = cv.getContext('2d');
    g.scale(2, 2);
    const title = h('div', { class: 'depth' });
    const bar = h('div', { class: 'bar' }, h('i'));
    const pushBtn = h('button', { class: 'mini', onclick: () => game.setMode(api.s(), 'push') }, t('maze.push'));
    const farmBtn = h('button', { class: 'mini', onclick: () => game.setMode(api.s(), 'farm') }, t('maze.farm'));
    const modes = h('div', { class: 'row' }, pushBtn, farmBtn);
    const auto = h('div', { class: 'sub' }, t('maze.auto'));
    const kind = h('div', { class: 'zone' });
    const info = h('div', { class: 'sub' });
    const dashBtn = h('button', { class: 'bigbtn fire' });
    dashBtn.addEventListener('pointerdown', () => {
      if (dash(api.s())) se('dash');
    });
    const wrap = h('div', { class: 'playbox' }, h('div', { class: 'row center' }, kind, title), cv, bar, modes, auto, dashBtn, info);
    cv.addEventListener('pointerdown', (ev) => {
      const got = game.click(api.s(), api.ctx());
      if (got) floatText(wrap, ev, '+' + fmt(got, 1));
      se('step');
    });
    el.append(wrap);

    let sig = '';
    let maze = null;

    // 迷路は階層から決まる（同じ階層なら同じ形）
    const build = (level, fresh) => {
      let seed = (level + 1) * 2654435761;
      const rnd = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
      };
      const n = Math.min(13, 7 + Math.floor(level / 4));
      const DX = [0, 1, 0, -1];
      const DY = [-1, 0, 1, 0];
      const open = Array.from({ length: n * n }, () => [false, false, false, false]);
      const seen = new Uint8Array(n * n);
      const stack = [0];
      seen[0] = 1;
      while (stack.length) {
        const c = stack[stack.length - 1];
        const dirs = [0, 1, 2, 3].filter((d) => {
          const x = (c % n) + DX[d];
          const y = Math.floor(c / n) + DY[d];
          return x >= 0 && y >= 0 && x < n && y < n && !seen[y * n + x];
        });
        if (!dirs.length) {
          stack.pop();
          continue;
        }
        const d = dirs[Math.floor(rnd() * dirs.length)];
        const nx = c + DX[d] + DY[d] * n;
        open[c][d] = true;
        open[nx][(d + 2) % 4] = true;
        seen[nx] = 1;
        stack.push(nx);
      }
      // 歩く道筋。未踏なら行き止まりも含めた手探り、踏破済みなら最短
      const goal = n * n - 1;
      const path = [0];
      const been = new Uint8Array(n * n);
      been[0] = 1;
      const trail = [0];
      while (trail[trail.length - 1] !== goal) {
        const c = trail[trail.length - 1];
        const d = [0, 1, 2, 3].find((k) => open[c][k] && !been[c + DX[k] + DY[k] * n]);
        if (d === undefined) {
          trail.pop();
          if (fresh) path.push(trail[trail.length - 1]);
        } else {
          const nx = c + DX[d] + DY[d] * n;
          been[nx] = 1;
          trail.push(nx);
          if (fresh) path.push(nx);
        }
      }
      return { n, open, path: fresh ? path : trail };
    };

    let clock = 0;
    const draw = (frac, s) => {
      // 絵は 2 通り：素材を使う描き方（maze_art.js）と、図形だけの旧い描き方（この下）
      if (artOn('maze') && mazeArtReady()) {
        drawMaze(g, {
          SIZE, maze, frac, kind: kindOf(s.level), clock,
          treasure: tier(lvl(s, 'treasure'), 5) + count(s, 'clear_t', CLEAR_TIERS.length),
          crew: tier(lvl(s, 'walker'), 6) - 1, heroGold: count(s, 'walker_t', WALKER_TIERS.length) >= 2,
          boots: Math.min(8, lvl(s, 'boots')), dashing: s.buffs.dash > 0, compass: lvl(s, 'compass'), relics: count(s, 'relic', RELIC_UPS.length),
        });
        return;
      }
      const { n, open, path } = maze;
      const c = SIZE / n;
      const k0 = kindOf(s.level);
      const wall = k0 === 'lord' ? C.rose : k0 === 'vault' ? C.gold : C.sky;
      g.fillStyle = lin(g, 0, 0, SIZE, SIZE, '#16267a', C.ink);
      g.fillRect(0, 0, SIZE, SIZE);
      const at = Math.min(path.length - 1, Math.floor(frac * (path.length - 1)));
      // 歩いた道は、金の明かりが残る
      for (let i = 0; i <= at; i++) rr(g, (path[i] % n) * c + 1.5, Math.floor(path[i] / n) * c + 1.5, c - 3, c - 3, 3, alpha(C.gold, 0.1 + 0.14 * (i / (at + 1))));
      g.strokeStyle = alpha(wall, 0.85);
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.beginPath();
      for (let i = 0; i < n * n; i++) {
        const x = (i % n) * c;
        const y = Math.floor(i / n) * c;
        if (!open[i][1]) { g.moveTo(x + c, y); g.lineTo(x + c, y + c); }
        if (!open[i][2]) { g.moveTo(x, y + c); g.lineTo(x + c, y + c); }
      }
      g.stroke();
      // ゴールの宝：宝の強化で山が大きくなり、大部屋は宝石、主の間は冠の色になる
      const gx = (n - 0.5) * c;
      const gy = (n - 0.5) * c;
      const tr = tier(lvl(s, 'treasure'), 5) + count(s, 'clear_t', CLEAR_TIERS.length);
      glow(g, gx, gy, c * (1 + tr * 0.12), k0 === 'lord' ? C.rose : C.gold, 0.55 + 0.15 * Math.sin(clock * 3));
      if (k0 === 'plain' || k0 === 'fog') {
        for (let i = 0; i < Math.min(5, 1 + tr); i++) coin(g, gx + ((i * 7) % 11 - 5) * c * 0.05, gy + c * 0.14 - i * c * 0.07, c * 0.2);
      } else gem(g, gx, gy, c * 0.36, k0 === 'lord' ? C.rose : C.azure);
      sparkle(g, gx + c * 0.28, gy - c * 0.3, c * 0.13 + Math.sin(clock * 5) * 1, '#ffffff');
      // 探検者（マスからマスへ、なめらかに進む）。仲間は後ろに連なる
      const f = Math.min(path.length - 1, frac * (path.length - 1));
      const posAt = (v) => {
        const i = Math.max(0, Math.min(path.length - 1, Math.floor(v)));
        const k = Math.max(0, v - i);
        const nx = path[Math.min(path.length - 1, i + 1)];
        return [((path[i] % n) * (1 - k) + (nx % n) * k) * c + c / 2, (Math.floor(path[i] / n) * (1 - k) + Math.floor(nx / n) * k) * c + c / 2];
      };
      const dashing = s.buffs.dash > 0;
      const wt = count(s, 'walker_t', WALKER_TIERS.length);
      const crew = tier(lvl(s, 'walker'), 6) - 1;
      for (let i = crew; i >= 1; i--) {
        const [fx, fy] = posAt(f - i * 0.7);
        disc(g, fx, fy, c * 0.14, [C.ice, C.sky, C.teal, C.gold][Math.min(3, wt)]);
      }
      const [px, py] = posAt(f);
      // 靴：足あとの光が長くなる
      const boots = Math.min(8, lvl(s, 'boots'));
      for (let i = 1; i <= boots; i++) {
        const [bx, by] = posAt(f - i * 0.25);
        disc(g, bx, by, c * 0.07, alpha(dashing ? C.amber : C.goldLight, 0.6 * (1 - i / (boots + 1))));
      }
      glow(g, px, py, c * 1.3, dashing ? C.amber : C.goldLight, 0.55);
      pawpaw(g, px, py + Math.sin(clock * 10) * c * 0.03, c * 0.74, { tone: wt >= 3 ? 'gold' : 'green' });
      // 霧の迷路：探検者のまわりしか見えない
      if (k0 === 'fog') {
        const fog = g.createRadialGradient(px, py, c * 1.6, px, py, c * 4.2);
        fog.addColorStop(0, alpha(C.ink, 0));
        fog.addColorStop(1, alpha(C.ink, 0.9));
        g.fillStyle = fog;
        g.fillRect(0, 0, SIZE, SIZE);
        glow(g, gx, gy, c, C.gold, 0.5);
      }
      // 羅針盤：段が上がるほど、針がゴールをはっきり指す
      const cp = lvl(s, 'compass');
      if (cp > 0) {
        const cx = SIZE - 22;
        const cy = 22;
        disc(g, cx, cy, 14, alpha(C.ink, 0.8), C.gold, 1.2);
        const a = Math.atan2(gy - py, gx - px) + Math.sin(clock * 2) * Math.max(0, 0.5 - cp * 0.04);
        line(g, [cx - Math.cos(a) * 6, cy - Math.sin(a) * 6, cx + Math.cos(a) * 10, cy + Math.sin(a) * 10], C.goldLight, 2);
        disc(g, cx, cy, 2, C.gold);
        tag(g, `Lv ${cp}`, cx, cy + 24, { size: 8 });
      }
      // 遺物の力（改良）：左上に並ぶ宝石
      const rl = count(s, 'relic', RELIC_UPS.length);
      for (let i = 0; i < rl; i++) gem(g, 12 + i * 12, 12, 5, C.violet);
      g.strokeStyle = alpha(wall, 0.9);
      g.lineWidth = 2;
      g.strokeRect(1, 1, SIZE - 2, SIZE - 2);
    };

    return {
      update() {
        const s = api.s();
        const fresh = isNew(s);
        setText(title, t(fresh ? 'maze.levelNew' : 'maze.levelKnown', { v: s.level + 1 }));
        title.dataset.st = fresh ? '' : 'good';
        bar.firstChild.style.width = `${Math.min(100, s.prog.div(need(s)).toNumber() * 100)}%`;
        const a = hasAuto(s);
        modes.hidden = a;
        auto.hidden = !a;
        pushBtn.classList.toggle('on', s.mode === 'push');
        farmBtn.classList.toggle('on', s.mode === 'farm');
        farmBtn.disabled = s.best < 0;
        const k = kindOf(s.level);
        kind.hidden = k === 'plain';
        setText(kind, k === 'plain' ? '' : t(`maze.kind.${k}`));
        const running = s.buffs.dash > 0;
        dashBtn.disabled = s.dash > 0;
        setText(dashBtn, running ? t('maze.dashOn', { t: fmtTime(Math.ceil(s.buffs.dash)) }) : s.dash > 0 ? t('maze.dashWait', { t: fmtTime(Math.ceil(s.dash)) }) : t('maze.dash'));
        setText(info, t('maze.info', { v: s.relics, z: lords(s) * 10 }));
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const next = `${s.level}/${isNew(s)}`;
        if (next !== sig) {
          sig = next;
          maze = build(s.level, isNew(s));
        }
        draw(Math.min(1, s.prog.div(need(s)).toNumber()), s);
      },
    };
  },
};

export default game;

// 基本ゲーム3：ブロック崩し。ボールが勝手に跳ね回り、ブロックを壊す。
// ステージごとに変わる並び、10 ステージごとの大ブロック、落ちてくるパワーアップ、改良、コアで伸ばす転生ツリー、実績を持つ。
// 表示中は実際にボールを動かし、非表示中は「1px 進むごとの命中数」の実測値から集計で進める。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, alpha, mix, lin, rr, disc, line, glow, gem, sparkle, meter, stage as backdrop, Bits, artOn } from '../ui/draw.js';
import { breakoutArtReady, drawBreakout, drawCapsule } from './breakout_art.js';

const COLS = 8;
const ROWS = 5;
const W = 480;
const H = 340;
const TOP = 28;
const BW = W / COLS;
const BH = 22;
const R = 5;

// ステージごとのブロックの並び（6 種類が順に巡る）
const PATTERNS = [
  () => true,
  (c, r) => (c + r) % 2 === 0,
  (c, r) => Math.abs(c - 3.5) <= r + 0.5,
  (c) => c % 3 !== 2,
  (c, r) => r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1,
  (c, r) => Math.abs(c - 3.5) + Math.abs(r - 2) * 1.5 <= 3.6,
];
const cellsAt = (st) => {
  const f = PATTERNS[st % PATTERNS.length];
  const out = [];
  for (let i = 0; i < COLS * ROWS; i++) if (f(i % COLS, Math.floor(i / COLS))) out.push(i);
  return out;
};
// 10 ステージごとに、盤いっぱいの大ブロックが 1 つだけ出る
const isBoss = (st) => st % 10 === 9;
const countAt = (st) => (isBoss(st) ? 1 : cellsAt(st).length);
const hpAt = (st) => N(4).mul(Num.pow(1.32, st)).mul(isBoss(st) ? 120 : 1);
// 実入りの伸びは、ステージ 60 から先でゆるやかになる
const BEND = 60;
const rewardAt = (s, st) => N(1.5).mul(Num.pow(1.22, Math.min(st, BEND))).mul(Num.pow(1.13, Math.max(0, st - BEND))).mul(isBoss(st) ? 100 * 1.5 ** treeLvl(s, 'bounty') : 1);

// 改良（1 回きり）
const POWER_TIERS = [{ best: 10, cost: 2000 }, { best: 25, cost: 1e5 }, { best: 50, cost: 5e6 }, { best: 100, cost: 2.5e8 }];
const VALUE_TIERS = [{ bricks: 500, cost: 1000 }, { bricks: 5000, cost: 1e5 }, { bricks: 50000, cost: 1e7 }];
const ROMAN = ['I', 'II', 'III', 'IV'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

// パワーアップ：ブロックを一定数壊すたびに落ちてくる。受け取るたびに 3 種類が順に巡る
const DROP_KINDS = ['shower', 'multi', 'fire'];
const DROP_STAY = 10;
const SHOWER_SEC = 120; // かけらの雨：稼ぎこの秒数ぶん
const MULTI = { mult: 2, sec: 20 }; // 分身：ボール 2 倍
const FIRE = { mult: 3, sec: 15 }; // 火の玉：威力 3 倍
const dropEvery = (s) => Math.round(60 * 0.85 ** treeLvl(s, 'dropfreq'));
const dropDur = (s) => 1 + 0.25 * treeLvl(s, 'dropdur');
const hasCatcher = (s) => treeLvl(s, 'catcher') > 0;

const ppPer = (s) => 0.15 + 0.03 * treeLvl(s, 'corepower');
const balls = (s) => 1 + lvl(s, 'ball');
const speed = (s) => 140 * (1 + 0.08 * lvl(s, 'speed'));
// パワーアップの効果を除いた威力
const baseDmg = (s) => Num.pow(1.3, lvl(s, 'power')).mul(2 ** count(s, 'power_t', POWER_TIERS.length))
  .mul(Num.pow(1.15, treeLvl(s, 'forge'))).mul(ppMult(s, ppPer(s)));
const dmg = (s) => baseDmg(s).mul(s.buffs.fire > 0 ? FIRE.mult : 1);
const valMult = (s, ctx) => Num.pow(1.15, lvl(s, 'value')).mul(2 ** count(s, 'value_t', VALUE_TIERS.length)).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const baseDps = (s) => baseDmg(s).mul(balls(s) * speed(s) * s.hpu);
const baseRate = (s, ctx) => rewardAt(s, s.stage).mul(valMult(s, ctx)).mul(baseDps(s)).div(hpAt(s.stage));

// 画面が実際に物理演算を回しているあいだは集計を止める。
// ウィンドウが隠れて描画が止まった場合に備え、直近に描画があったかで判断する。
let lastFrame = -1e9;
const live = () => performance.now() - lastFrame < 500;

function applyDrop(s, ctx, scale) {
  const kind = DROP_KINDS[(s.stats.drops || 0) % DROP_KINDS.length];
  s.stats.drops = (s.stats.drops || 0) + 1;
  let got = null;
  if (kind === 'shower') {
    got = baseRate(s, ctx).mul(SHOWER_SEC * scale).max(rewardAt(s, s.stage).mul(valMult(s, ctx)).mul(5 * scale));
    earn(s, got);
  } else if (kind === 'multi') {
    s.buffs.multi = MULTI.sec * dropDur(s) * scale;
  } else {
    s.buffs.fire = FIRE.sec * dropDur(s) * scale;
  }
  return { kind, got };
}

function killBrick(s, ctx) {
  const got = rewardAt(s, s.stage).mul(valMult(s, ctx));
  earn(s, got);
  s.stats.bricks = (s.stats.bricks || 0) + 1;
  if (isBoss(s.stage)) s.stats.boss = (s.stats.boss || 0) + 1;
  s.left--;
  if (s.left <= 0) {
    s.stage++;
    if (s.stage > s.best) s.best = s.stage;
    if (s.stage > (s.stats.top || 0)) s.stats.top = s.stage;
    s.left = countAt(s.stage);
  }
  s.cur = hpAt(s.stage);
  // パワーアップ
  if (--s.dropIn <= 0) {
    s.dropIn = dropEvery(s);
    if (hasCatcher(s)) applyDrop(s, ctx, 0.5);
    else if (ctx.visible) s.drop = { on: DROP_STAY, x: 0.15 + Math.random() * 0.7 };
  }
  return got;
}

const tierUp = (base, prefix, tiers, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr('c.tier.n', { g: tr(`breakout.up.${base}.n`), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'breakout',
  kind: 'base',
  icon: '🧱',
  ppPer,
  keep: ['best', 'hpu'],
  unlock: { games: ['smeltery'], cost: { clicker: 15000, mining: 200 } },

  newState: () => ({
    ...baseState(), stage: 0, left: countAt(0), cur: hpAt(0), hpu: 0.0025, best: 0,
    dropIn: 60, drop: { on: 0, x: 0.5 }, buffs: { multi: 0, fire: 0 },
  }),

  upgrades: [
    { id: 'ball', base: 8, r: 1.55, max: 39, val: (s) => String(balls(s)) },
    { id: 'power', base: 15, r: 1.5, val: (s) => fmt(dmg(s), 1) },
    { id: 'speed', base: 60, r: 1.7, max: 20 },
    { id: 'value', base: 120, r: 1.9 },
    ...tierUp('power', 'power_t', POWER_TIERS, 'breakout.tier.power', (s, tier) => s.best >= tier.best),
    ...tierUp('value', 'value_t', VALUE_TIERS, 'breakout.tier.value', (s, tier) => (s.stats.bricks || 0) >= tier.bricks),
  ],

  // コアで買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 2, max: 5 },
    { id: 'dropfreq', base: 1, r: 2, max: 5 },
    { id: 'dropdur', base: 2, r: 2, max: 4, req: { dropfreq: 1 } },
    { id: 'catcher', base: 15, max: 1, req: { dropfreq: 2 } },
    { id: 'bounty', base: 3, r: 2, max: 5 },
    { id: 'corepower', base: 5, r: 2.5, max: 5 },
    // 先の長い枝
    { id: 'forge', base: 10, r: 1.6, max: 20, req: { corepower: 1 } },
  ],

  achievements: [
    ...[5, 10, 25, 50, 100, 150, 200, 300].map((v) => ({ id: `stage${v}`, type: 'stage', v, done: (s) => Math.max(s.stats.top || 0, s.best) >= v })),
    ...[1e3, 1e4, 1e5, 1e6].map((v) => ({ id: `bricks${v}`, type: 'bricks', v, done: (s) => (s.stats.bricks || 0) >= v })),
    ...[1, 10, 50].map((v) => ({ id: `boss${v}`, type: 'boss', v, done: (s) => (s.stats.boss || 0) >= v })),
    ...[1, 10, 50].map((v) => ({ id: `drops${v}`, type: 'drops', v, done: (s) => (s.stats.drops || 0) >= v })),
    ...[1e3, 1e6, 1e9].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「飛び級」のぶんだけ先のステージから始める
  onReset(s) {
    const st = 5 * treeLvl(s, 'start');
    if (st > s.stage) {
      // 飛ばしたステージで稼げたはずのかけらを持って始める
      let shards = ZERO;
      for (let i = s.stage; i < st; i++) shards = shards.add(rewardAt(s, i).mul(countAt(i)));
      earn(s, shards.mul(ppMult(s, ppPer(s))));
      s.stage = st;
      s.left = countAt(st);
      s.cur = hpAt(st);
    }
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    // 並びが変わる前のデータでは、残り数がそのステージのブロック数を超えていることがある
    if (s.left > countAt(s.stage)) s.left = countAt(s.stage);
    const span = dt;
    // パワーアップの効果は、この刻みのうち効いていた割合でならす
    const boost = (1 + ((MULTI.mult - 1) * Math.min(dt, s.buffs.multi)) / dt) * (1 + ((FIRE.mult - 1) * Math.min(dt, s.buffs.fire)) / dt);
    s.buffs.multi = Math.max(0, s.buffs.multi - span);
    s.buffs.fire = Math.max(0, s.buffs.fire - span);
    if (s.drop.on > 0) s.drop.on = Math.max(0, s.drop.on - span);
    if (ctx.visible && live()) return;
    const d = baseDps(s).mul(boost);
    if (d.m === 0) return;
    for (let i = 0; i < 5000 && dt > 0; i++) {
      const need = s.cur.div(d).toNumber();
      if (need <= dt) {
        dt -= need;
        killBrick(s, ctx);
      } else {
        s.cur = s.cur.sub(d.mul(dt));
        dt = 0;
      }
    }
  },

  rate(s, ctx) {
    return baseRate(s, ctx).mul((s.buffs.multi > 0 ? MULTI.mult : 1) * (s.buffs.fire > 0 ? FIRE.mult : 1));
  },

  // 落ちてきたパワーアップを受け取る
  catchDrop(s, ctx) {
    if (s.drop.on <= 0) return null;
    s.drop.on = 0;
    return applyDrop(s, ctx, 1);
  },

  prestigeTotal(s) {
    if (s.best < 8) return ZERO;
    return N(Math.floor((s.best / 8) ** 2));
  },

  mount(el, api) {
    const cv = h('canvas', { class: 'field', width: W * 2, height: H * 2 });
    const g = cv.getContext('2d');
    g.scale(2, 2);
    const stage = h('div', { class: 'depth' });
    const multi = h('span', { class: 'buff' });
    const fire = h('span', { class: 'buff' });
    const buffs = h('div', { class: 'row wrap center buffs' }, multi, fire);
    const wrap = h('div', { class: 'playbox' }, stage, buffs, cv);
    const bits = new Bits();
    let clock = 0;
    // 落ちてくるカプセルの位置
    const capAt = (st) => [st.drop.x * W, H * (0.3 + (1 - st.drop.on / DROP_STAY) * 0.55)];
    el.append(wrap);

    let bricks = []; // 各マスの残り体力（null は破壊済み）。大ブロックのステージでは 0 番だけを使う
    let pts = [];
    let sig = '';
    let hits = 0;
    let dist = 0;
    let timer = 0;

    const rebuild = () => {
      const s = api.s();
      s.left = Math.min(s.left, countAt(s.stage));
      const full = hpAt(s.stage);
      bricks = Array.from({ length: COLS * ROWS }, () => null);
      if (isBoss(s.stage)) bricks[0] = s.left > 0 ? full : null;
      else cellsAt(s.stage).slice(0, s.left).forEach((i) => { bricks[i] = full; });
      sig = `${s.stage}/${s.prestiges}`;
      // 新しいブロックに埋まらないよう、ボールをブロック帯の下へ出す
      const floor = TOP + ROWS * BH + R + 1;
      for (const p of pts) {
        if (p.y < floor) {
          p.y = floor;
          p.vy = Math.abs(p.vy);
        }
      }
    };

    const hit = (i, amount, ev) => {
      const s = api.s();
      bricks[i] = bricks[i].sub(amount);
      if (bricks[i].lte(0)) {
        bricks[i] = null;
        const before = s.stage;
        const boss = isBoss(s.stage);
        bits.add(boss ? W / 2 : (i % COLS) * BW + BW / 2, boss ? TOP + (ROWS * BH) / 2 : TOP + Math.floor(i / COLS) * BH + BH / 2, boss ? 40 : 6, { color: [tint(s.stage), C.ice, C.gold], speed: boss ? 220 : 110, size: boss ? 4 : 2.6, life: 0.5, glow: boss });
        if (artOn('breakout')) bits.add(boss ? W / 2 : (i % COLS) * BW + BW / 2, boss ? TOP + (ROWS * BH) / 2 : TOP + Math.floor(i / COLS) * BH + BH / 2, boss ? 10 : 2, { color: [tint(s.stage), C.ice], speed: boss ? 160 : 70, size: boss ? 14 : 7, life: 0.55, fx: 'debris' });
        const got = killBrick(s, api.ctx());
        if (ev) floatText(wrap, ev, '+' + fmt(got, 1));
        if (s.stage !== before) rebuild();
      }
    };

    const cellAt = (x, y) => {
      if (y < TOP || y >= TOP + ROWS * BH || x < 0 || x >= W) return -1;
      if (isBoss(api.s().stage)) return bricks[0] ? 0 : -1;
      const i = Math.floor((y - TOP) / BH) * COLS + Math.floor(x / BW);
      return bricks[i] ? i : -1;
    };

    cv.addEventListener('pointerdown', (ev) => {
      const r = cv.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const py = ((ev.clientY - r.top) / r.height) * H;
      if (api.s().drop.on > 0) {
        const [cx, cy] = capAt(api.s());
        if (Math.hypot(px - cx, py - cy) < 30) {
          const res = game.catchDrop(api.s(), api.ctx());
          if (res) {
            bits.add(cx, cy, 24, { color: [C.gold, C.goldLight, '#ffffff'], speed: 160, size: 3, glow: true });
            floatText(wrap, ev, res.got ? `${t('breakout.drop.shower')} +${fmt(res.got, 1)}` : t(`breakout.drop.${res.kind}`), 'big');
            se('bonus');
          }
          return;
        }
      }
      const i = cellAt(px, py);
      api.s().clicks++;
      if (i >= 0) {
        hit(i, dmg(api.s()).mul(3), ev);
        se('brick');
      }
    });
    const step = (p, d) => {
      p.x += p.vx * d;
      if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx); }
      if (p.x > W - R) { p.x = W - R; p.vx = -Math.abs(p.vx); }
      let i = cellAt(p.x, p.y);
      if (i >= 0) {
        p.x -= p.vx * d;
        p.vx = -p.vx;
        hits++;
        hit(i, dmg(api.s()));
      }
      p.y += p.vy * d;
      if (p.y < R) { p.y = R; p.vy = Math.abs(p.vy); }
      if (p.y > H - R) { p.y = H - R; p.vy = -Math.abs(p.vy); }
      i = cellAt(p.x, p.y);
      if (i >= 0) {
        p.y -= p.vy * d;
        p.vy = -p.vy;
        hits++;
        hit(i, dmg(api.s()));
      }
    };

    // ステージごとに色が巡る
    const TINTS = [C.azure, C.violet, C.teal, C.rose, C.amber, C.sky];
    const tint = (st) => (isBoss(st) ? C.gold : TINTS[st % TINTS.length]);
    const draw = (dt) => {
      const s = api.s();
      clock += dt;
      // 絵は 2 通り：素材を使う描き方（breakout_art.js）と、図形だけの旧い描き方（この下）
      if (artOn('breakout') && breakoutArtReady()) {
        const whole = hpAt(s.stage);
        const hot = s.buffs.fire > 0;
        drawBreakout(g, {
          W, H, TOP, BW, BH, COLS, ROWS, R, clock, tintIdx: s.stage % TINTS.length, boss: isBoss(s.stage),
          bricks: bricks.map((b) => (b ? Math.max(0, Math.min(1, b.div(whole).toNumber())) : null)),
          gems: lvl(s, 'value') > 0, gemTier: count(s, 'value_t', VALUE_TIERS.length), pts,
          ballTier: count(s, 'power_t', POWER_TIERS.length), fire: hot,
          tail: 5 + lvl(s, 'speed') * 1.1 + (hot ? 8 : 0), aura: Math.min(14, 6 + lvl(s, 'power') * 0.25),
        });
        bits.draw(g, dt);
        if (s.drop.on > 0) drawCapsule(g, ...capAt(s), clock, s.drop.on < 3);
        return;
      }
      backdrop(g, W, H, { top: '#16267a', bottom: C.ink });
      for (let x = BW; x < W; x += BW) rr(g, x - 0.5, 0, 1, H, 0, alpha(C.ice, 0.04));
      const full = hpAt(s.stage);
      const col = tint(s.stage);
      const frac = (hp) => Math.max(0, Math.min(1, hp.div(full).toNumber()));
      const val = lvl(s, 'value');
      const vt = count(s, 'value_t', VALUE_TIERS.length);
      if (isBoss(s.stage)) {
        if (bricks[0]) {
          const k = frac(bricks[0]);
          glow(g, W / 2, TOP + (ROWS * BH) / 2, 200, C.gold, 0.25 + 0.1 * Math.sin(clock * 3));
          rr(g, 4, TOP + 4, W - 8, ROWS * BH - 8, 8, lin(g, 0, TOP, W, TOP + ROWS * BH, C.goldLight, C.gold, C.goldDark), C.goldLight, 1.5);
          rr(g, 12, TOP + 12, W - 24, ROWS * BH - 24, 5, null, alpha(C.goldDark, 0.8), 1);
          gem(g, W / 2, TOP + (ROWS * BH) / 2 - 6, 18, C.azure);
          meter(g, W / 2 - 90, TOP + ROWS * BH - 26, 180, k, C.ink, 5);
        }
      } else {
        for (let i = 0; i < bricks.length; i++) {
          if (!bricks[i]) continue;
          const x = (i % COLS) * BW + 2;
          const y = TOP + Math.floor(i / COLS) * BH + 2;
          const k = frac(bricks[i]);
          g.globalAlpha = 0.35 + 0.65 * k;
          rr(g, x, y, BW - 4, BH - 4, 4, lin(g, 0, y, 0, y + BH, mix(col, '#ffffff', 0.3), mix(col, C.ink, 0.35)));
          rr(g, x + 2, y + 1.5, BW - 8, 1.5, 1, alpha('#ffffff', 0.45));
          g.globalAlpha = 1;
          // 価値の強化：ブロックに金の石がはまる
          if (val > 0) gem(g, x + (BW - 4) / 2, y + (BH - 4) / 2, 3.5 + Math.min(3, vt) * 1.2, C.gold);
          if (k < 0.6) line(g, [x + BW * 0.3, y + 2, x + BW * 0.42, y + BH * 0.45, x + BW * 0.34, y + BH - 6], alpha(C.ink, 0.5), 1);
        }
      }
      // ボール：威力の改良で色が変わり、速さの強化で尾が伸びる
      const pt = count(s, 'power_t', POWER_TIERS.length);
      const fire = s.buffs.fire > 0;
      const ballCol = fire ? C.amber : [C.ivory, C.sky, C.teal, C.gold, '#ffffff'][Math.min(4, pt)];
      const tail = 5 + lvl(s, 'speed') * 1.1 + (fire ? 8 : 0);
      const aura = Math.min(14, 6 + lvl(s, 'power') * 0.25);
      for (const p of pts) {
        line(g, [p.x, p.y, p.x - p.vx * tail, p.y - p.vy * tail], alpha(ballCol, 0.4), R * 1.2);
        glow(g, p.x, p.y, aura, ballCol, 0.5);
        disc(g, p.x, p.y, R, ballCol);
        disc(g, p.x - 1.4, p.y - 1.4, 1.5, alpha('#ffffff', 0.8));
      }
      bits.draw(g, dt);
      // 落ちてくるカプセル
      if (s.drop.on > 0) {
        const [cx, cy] = capAt(s);
        g.globalAlpha = s.drop.on < 3 ? 0.4 + 0.5 * Math.abs(Math.sin(clock * 8)) : 1;
        glow(g, cx, cy, 34, C.gold, 0.6);
        rr(g, cx - 13, cy - 8, 26, 16, 8, lin(g, cx - 13, cy - 8, cx + 13, cy + 8, C.goldLight, C.gold, C.goldDark));
        rr(g, cx - 1, cy - 8, 2, 16, 0, alpha(C.goldDark, 0.7));
        sparkle(g, cx + 12, cy - 10, 5 + Math.sin(clock * 6) * 1.5, '#ffffff');
        g.globalAlpha = 1;
      }
    };

    rebuild();

    return {
      update() {
        const s = api.s();
        setText(stage, t(isBoss(s.stage) ? 'breakout.stageBoss' : 'breakout.stage', { v: s.stage + 1, left: s.left }));
        multi.hidden = s.buffs.multi <= 0;
        setText(multi, t('breakout.buff.multi', { t: fmtTime(s.buffs.multi) }));
        fire.hidden = s.buffs.fire <= 0;
        setText(fire, t('breakout.buff.fire', { t: fmtTime(s.buffs.fire) }));
      },
      frame(dt) {
        lastFrame = performance.now();
        const s = api.s();
        // 転生や集計進行で状態が変わっていたら盤面を作り直す
        if (sig !== `${s.stage}/${s.prestiges}` || bricks.filter(Boolean).length !== s.left) rebuild();
        const n = Math.min(balls(s) * (s.buffs.multi > 0 ? MULTI.mult : 1), 80);
        while (pts.length < n) {
          const a = Math.PI * (0.2 + Math.random() * 0.6);
          pts.push({ x: W / 2, y: H - 30, vx: Math.cos(a), vy: -Math.sin(a) });
        }
        pts.length = n;
        const sp = speed(s);
        let rest = Math.min(dt, 0.05);
        dist += sp * rest * n;
        while (rest > 0) {
          const d = Math.min(rest, 4 / sp);
          for (const p of pts) step(p, d * sp);
          rest -= d;
        }
        // 実測の命中率をなだらかに反映する
        timer += dt;
        if (timer > 4 && dist > 0) {
          s.hpu = s.hpu * 0.7 + (hits / dist) * 0.3;
          hits = 0;
          dist = 0;
          timer = 0;
        }
        draw(dt);
      },
      destroy() {
        lastFrame = -1e9;
      },
    };
  },
};

export default game;

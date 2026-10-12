// 基本ゲーム8：ボール落とし。釘に当たりながら落ちたボールが、入った受け皿の倍率ぶん稼ぐ。
// 落とす位置と、どの受け皿を強化するかを選ぶ遊び。端の受け皿は倍率が高いが、端を狙うと盤の外へこぼれる。
// 1 分ごとに移る「当たりの受け皿」、ときどき混じる金の玉、釘の並びの切り替え、改良、金の玉で伸ばす転生ツリー、実績を持つ。
// 表示中は 1 球ずつ実際に落とし、非表示中は期待値で集計する。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText } from '../ui/dom.js';
import { C, alpha, mix, lin, rr, disc, poly, text, tag, glow, tier, artOn } from '../ui/draw.js';
import { dropArtReady, drawDrop } from './drop_art.js';

const SLOTS = 5;
const ROWS = 4;
const BASE = [3, 1.5, 0.5, 1.5, 3]; // 受け皿の元の倍率
// 釘の並び。左右へのずれ（-2〜+2）の確率が変わる
const PEGS = [
  { id: 'even', p: [1, 4, 6, 4, 1].map((v) => v / 16) }, // ふつう
  { id: 'tight', p: [0, 4, 8, 4, 0].map((v) => v / 16) }, // 寄せ：狙った所に集まる
  { id: 'wide', p: [3, 3, 4, 3, 3].map((v) => v / 16) }, // 散らし：広くばらける
];
const HOT_SEC = 60; // 当たりの受け皿が移る間隔
const GOLD_MULT = 10; // 金の玉の倍率

// 改良（1 回きり）
const DROPPER_TIERS = [{ own: 10, cost: 250 }, { own: 50, cost: 37500 }, { own: 150, cost: 3.75e7 }];
const BALL_TIERS = [{ n: 1000, cost: 3000 }, { n: 1e5, cost: 3e6 }, { n: 1e7, cost: 3e9 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'ballpower');
const hotMult = (s) => 3 + 0.5 * treeLvl(s, 'hotpower');
const goldEvery = (s) => 20 - 2 * treeLvl(s, 'goldfreq'); // 何球に 1 球が金の玉か
const goldFactor = (s) => 1 + (GOLD_MULT - 1) / goldEvery(s);
const pegsOf = (s) => PEGS[s.pegs] || PEGS[0];
const pegOpen = (s, i) => i === 0 || lvl(s, `peg${i}`) > 0;
const slotMult = (s, i) => BASE[i] * 1.2 ** lvl(s, `slot${i}`) * (i === s.hot ? hotMult(s) : 1);
const perSec = (s) => {
  const n = lvl(s, 'dropper');
  return 0.5 * n * milestoneMult(n) * 2 ** count(s, 'dropper_t', DROPPER_TIERS.length);
};
const valMult = (s, ctx) => Num.pow(1.15, lvl(s, 'polish')).mul(2 ** count(s, 'ball_t', BALL_TIERS.length))
  .mul(Num.pow(1.15, treeLvl(s, 'mint'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);

// 位置 aim から落とした 1 球の期待倍率（盤の外へ出たぶんは 0。金の玉のぶんは含まない）
function expect(s, aim = s.aim, pegs = pegsOf(s)) {
  let ev = 0;
  for (let d = -2; d <= 2; d++) {
    const slot = aim + d;
    if (slot >= 0 && slot < SLOTS) ev += pegs.p[d + 2] * slotMult(s, slot);
  }
  return ev;
}
// ある受け皿（複数可）に入る確率
const chance = (s, test) => {
  let p = 0;
  for (let d = -2; d <= 2; d++) if (test(s.aim + d)) p += pegsOf(s).p[d + 2];
  return p;
};
// いちばん期待の高い落とし位置（追尾の枝が使う）
const bestAim = (s) => [0, 1, 2, 3, 4].reduce((a, b) => (expect(s, b) > expect(s, a) + 1e-12 ? b : a), 0);

// 1 球を実際に落とす。入った受け皿（外なら -1）と、段ごとの左右を返す
function roll(s) {
  let r = Math.random();
  let d = 2;
  for (let k = -2; k <= 2; k++) {
    r -= pegsOf(s).p[k + 2];
    if (r < 0) { d = k; break; }
  }
  // 最後のずれが d になるように、右へ行く段を無作為に決める
  const steps = Array.from({ length: ROWS }, (_, i) => (i < 2 + d ? 0.5 : -0.5));
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }
  const slot = s.aim + d;
  return { slot: slot >= 0 && slot < SLOTS ? slot : -1, steps };
}

// n 球ぶんが受け皿 slot に入ったときの記録
function tally(s, slot, n) {
  s.stats.balls = (s.stats.balls || 0) + n;
  if (slot === 0 || slot === SLOTS - 1) s.stats.edge = (s.stats.edge || 0) + n;
  if (slot === s.hot) s.stats.hot = (s.stats.hot || 0) + n;
}

// 当たりの受け皿を進める
function turnHot(s, dt) {
  s.hotIn -= dt;
  while (s.hotIn <= 0) {
    s.hotIn += HOT_SEC;
    s.hot = (s.hot + 2) % SLOTS;
  }
  if (treeLvl(s, 'tracker') > 0) s.aim = bestAim(s);
}

// 画面が実際にボールを落としているあいだは集計を止める
let lastFrame = -1e9;
const live = () => performance.now() - lastFrame < 500;

const tierUp = (base, prefix, tiers, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr('c.tier.n', { g: tr(`drop.up.${base}.n`), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'drop',
  kind: 'base',
  icon: '🎯',
  ppPer,
  keep: ['aim', 'pegs'],
  unlock: { choice: true },

  // 投入機 1 台から始まる。aim は落とす位置（0〜4）、hot は当たりの受け皿、pegs は釘の並び
  newState: () => ({ ...baseState(), up: { dropper: 1 }, aim: 2, hot: 2, hotIn: HOT_SEC, pegs: 0, gold: 0 }),

  upgrades: [
    { id: 'dropper', base: 12, r: 1.15, gen: true, val: (s) => fmt(perSec(s), 1) },
    { id: 'polish', base: 150, r: 2.2 },
    ...BASE.map((_, i) => ({ id: `slot${i}`, base: 60, r: 2, slot: i, val: (s) => fmt(BASE[i] * 1.2 ** lvl(s, `slot${i}`), 2) })),
    ...tierUp('dropper', 'dropper_t', DROPPER_TIERS, 'drop.tier.dropper', (s, tier) => lvl(s, 'dropper') >= tier.own),
    ...tierUp('polish', 'ball_t', BALL_TIERS, 'drop.tier.ball', (s, tier) => (s.stats.balls || 0) >= tier.n),
    // 釘の並び（買うと切り替えられるようになる）
    ...[1, 2].map((i) => ({
      id: `peg${i}`,
      base: 5000 * 40 ** (i - 1),
      r: 1,
      max: 1,
      once: true,
      show: (s) => s.life.gte(1000 * 40 ** (i - 1)),
      name: (tr) => tr(`drop.pegs.${PEGS[i].id}`),
      desc: (tr) => tr(`drop.pegs.${PEGS[i].id}.d`),
    })),
  ],

  // 金の玉（転生ポイント）で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'goldfreq', base: 2, r: 2.5, max: 5 },
    { id: 'hotpower', base: 3, r: 3, max: 4 },
    { id: 'tracker', base: 15, max: 1, req: { hotpower: 1 } },
    { id: 'ballpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'mint', base: 20, r: 1.7, max: 20, req: { ballpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[1e3, 1e5, 1e7].map((v) => ({ id: `balls${v}`, type: 'balls', v, done: (s) => (s.stats.balls || 0) >= v })),
    ...[100, 10000].map((v) => ({ id: `edge${v}`, type: 'edge', v, done: (s) => (s.stats.edge || 0) >= v })),
    ...[100, 10000].map((v) => ({ id: `hot${v}`, type: 'hot', v, done: (s) => (s.stats.hot || 0) >= v })),
    ...[50, 200].map((v) => ({ id: `trays${v}`, type: 'trays', v, done: (s) => count(s, 'slot', SLOTS) >= v })),
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'droppers', v, done: (s) => lvl(s, 'dropper') >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「据え付け」のぶんの投入機を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.dropper = Math.max(lvl(s, 'dropper'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    turnHot(s, dt);
    if (ctx.visible && live()) return;
    const n = perSec(s) * dt;
    earn(s, valMult(s, ctx).mul(n * expect(s) * goldFactor(s)));
    s.stats.balls = (s.stats.balls || 0) + n;
    s.stats.edge = (s.stats.edge || 0) + n * chance(s, (x) => x === 0 || x === SLOTS - 1);
    s.stats.hot = (s.stats.hot || 0) + n * chance(s, (x) => x === s.hot);
  },

  rate: (s, ctx) => valMult(s, ctx).mul(perSec(s) * expect(s) * goldFactor(s)),

  // 手で 1 球落とす（結果はその場で決まる）。金の玉は決まった球数ごとに混じる
  click(s, ctx) {
    s.clicks++;
    const r = roll(s);
    const gold = ++s.gold >= goldEvery(s);
    if (gold) s.gold = 0;
    const got = r.slot < 0 ? ZERO : valMult(s, ctx).mul(slotMult(s, r.slot) * (gold ? GOLD_MULT : 1));
    earn(s, got);
    if (r.slot >= 0) tally(s, r.slot, 1);
    else s.stats.balls = (s.stats.balls || 0) + 1;
    return { ...r, got, gold };
  },

  expect,
  setAim(s, i) {
    s.aim = Math.max(0, Math.min(SLOTS - 1, i));
  },
  setPegs(s, i) {
    if (PEGS[i] && pegOpen(s, i)) s.pegs = i;
  },

  prestigeTotal(s) {
    if (s.life.lt(1e6)) return ZERO;
    return s.life.div(1e6).pow(0.2).floor();
  },

  mount(el, api) {
    const W = 400;
    const H = 320;
    const COL = W / (SLOTS + 2); // 両端 1 列ぶんは盤の外
    const TOP = 46;
    const ROWH = 44;
    const cv = h('canvas', { class: 'field drop', width: W * 2, height: H * 2 });
    const g = cv.getContext('2d');
    g.scale(2, 2);
    const info = h('div', { class: 'depth' });
    const hotTxt = h('div', { class: 'zone' });
    const pegChips = PEGS.map((p, i) => ({ i, chip: h('button', { class: 'mini', onclick: () => game.setPegs(api.s(), i) }, t(`drop.pegs.${p.id}`)) }));
    const auto = h('div', { class: 'sub' }, t('drop.tracker'));
    const wrap = h('div', { class: 'playbox' }, h('div', { class: 'row center' }, hotTxt, info), cv, h('div', { class: 'row wrap center' }, pegChips.map((x) => x.chip)), auto);
    el.append(wrap);

    const xOf = (pos) => COL * (pos + 1.5);
    let balls = []; // { aim, steps, slot, age, worth, gold }
    let acc = 0;
    const flash = []; // 受け皿ごとの光り具合

    const spawn = (r, worth, gold) => balls.push({ aim: api.s().aim, steps: r.steps, slot: r.slot, age: 0, worth, gold });

    cv.addEventListener('pointerdown', (ev) => {
      const rect = cv.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * W;
      const y = ((ev.clientY - rect.top) / rect.height) * H;
      const s = api.s();
      // 上の段をクリックすると落とす位置を変え、盤面をクリックすると 1 球落とす
      if (y < TOP) {
        game.setAim(s, Math.round(x / COL - 1.5));
      } else {
        const r = game.click(s, api.ctx());
        spawn(r, null, r.gold);
      }
      se('peg');
    });

    // 球の動き：投入口から最初の釘へ落ち、釘に当たるたびに小さく跳ねて左右どちらかの釘へ移り、最後に受け皿へ落ちる
    const T_IN = 0.3; // 最初の釘まで
    const T_HOP = 0.26; // 釘から釘へ
    const T_OUT = 0.3; // 最後の釘から受け皿へ
    const FALL = T_IN + T_HOP * (ROWS - 1) + T_OUT; // 1 球が落ちきるまでの秒数
    const PEG_R = 4;
    const BALL_R = 6.5;
    const pegY = (r) => TOP + (r + 0.5) * ROWH + 6;
    const TRAY_Y = TOP + ROWS * ROWH + 16;
    const pings = []; // 当たった釘の光
    const posOf = (b) => {
      const age = b.age;
      const top = (r) => pegY(r) - PEG_R - BALL_R; // 釘の上に乗る高さ
      if (age < T_IN) {
        // 投入口から最初の釘へ：重力で加速する
        const k = (age / T_IN) ** 2;
        return [xOf(b.aim), 22 + (top(0) - 22) * k];
      }
      let pos = b.aim;
      let rest = age - T_IN;
      for (let r = 0; r < ROWS - 1; r++) {
        if (rest < T_HOP) {
          // 跳ねて次の釘へ：横は等速、縦は小さく上がってから落ちる
          const k = rest / T_HOP;
          return [xOf(pos + b.steps[r] * k), top(r) + (top(r + 1) - top(r)) * k * k - 11 * 4 * k * (1 - k)];
        }
        rest -= T_HOP;
        pos += b.steps[r];
      }
      // 最後の釘から受け皿へ
      const k = Math.min(1, rest / T_OUT);
      const last = ROWS - 1;
      return [xOf(pos + b.steps[last] * k), top(last) + (TRAY_Y + 30 - top(last)) * k * k - 9 * 4 * k * (1 - k)];
    };
    // 何番目の釘に当たったところか（光らせるため）
    const hitIndex = (age) => (age < T_IN ? -1 : Math.min(ROWS - 1, Math.floor((age - T_IN) / T_HOP)));

    return {
      update() {
        const s = api.s();
        setText(info, t('drop.info', { v: fmt(perSec(s), 1), e: fmt(expect(s) * goldFactor(s), 2) }));
        setText(hotTxt, t('drop.hot', { v: s.hot + 1, m: hotMult(s), t: fmtTime(Math.ceil(s.hotIn)) }));
        auto.hidden = treeLvl(s, 'tracker') < 1;
        for (const x of pegChips) {
          x.chip.hidden = !pegOpen(s, x.i) || !(pegOpen(s, 1) || pegOpen(s, 2));
          x.chip.classList.toggle('on', s.pegs === x.i);
        }
      },
      frame(dt) {
        lastFrame = performance.now();
        const s = api.s();
        const ctx = api.ctx();
        // 自動の投入。球が多いときは 1 球に複数ぶんをまとめる
        const rate = perSec(s);
        const batch = Math.max(1, rate / 12);
        acc += (rate / batch) * dt;
        while (acc >= 1) {
          acc -= 1;
          s.gold += batch;
          const gold = s.gold >= goldEvery(s);
          if (gold) s.gold -= goldEvery(s);
          // まとめた球は、金の玉のぶんをならして数える。1 球ずつのときは本当に金の玉として落とす
          spawn(roll(s), batch, batch === 1 && gold);
        }
        for (const b of balls) {
          const before = hitIndex(b.age);
          b.age += dt;
          const now = hitIndex(b.age);
          if (now > before && b.age < FALL) {
            // 釘に当たった：その釘を少し光らせる
            let pos = b.aim;
            for (let r = 0; r < now; r++) pos += b.steps[r];
            pings.push({ x: xOf(pos), y: pegY(now), age: 0 });
          }
          if (b.age >= FALL && !b.done) {
            b.done = true;
            if (b.slot >= 0) flash[b.slot] = 1;
            // 手で落とした球（worth なし）は click の時点で受け取り済み
            if (b.worth) {
              if (b.slot >= 0) {
                const gm = b.worth === 1 ? (b.gold ? GOLD_MULT : 1) : goldFactor(s);
                earn(s, valMult(s, ctx).mul(slotMult(s, b.slot) * b.worth * gm));
                tally(s, b.slot, b.worth);
              } else {
                s.stats.balls = (s.stats.balls || 0) + b.worth;
              }
            }
          }
        }
        balls = balls.filter((b) => b.age < FALL + 0.15);
        if (balls.length > 300) balls.splice(0, balls.length - 300);

        // 絵は 2 通り：素材を使う描き方（drop_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('drop') && dropArtReady()) {
          drawDrop(g, {
            W, H, COL, TOP, SLOTS, ROWS, TRAY_Y, PEG_R, BALL_R, FALL, xOf, pegY, posOf, aim: s.aim, hot: s.hot, pegs: s.pegs, balls, pings, flash, dt,
            slotLv: BASE.map((_, i) => lvl(s, `slot${i}`)), slotText: BASE.map((_, i) => `×${fmt(slotMult(s, i), 2)}`),
            droppers: tier(lvl(s, 'dropper'), 5), dropperLabel: fmt(lvl(s, 'dropper')), dropperGold: count(s, 'dropper_t', DROPPER_TIERS.length) > 0,
            ballTier: count(s, 'ball_t', BALL_TIERS.length), shine: lvl(s, 'polish') > 0,
          });
          return;
        }
        g.fillStyle = lin(g, 0, 0, 0, H, '#16267a', C.ink);
        g.fillRect(0, 0, W, H);
        // 投入口：狙っている列に、投入機が下りている。台数が増えるほど口が増え、改良で金になる
        const nd = lvl(s, 'dropper');
        const dt3 = count(s, 'dropper_t', DROPPER_TIERS.length);
        rr(g, COL * 0.6, 6, W - COL * 1.2, 5, 2.5, alpha(C.ice, 0.25));
        for (let i = 0; i < SLOTS; i++) {
          const on = i === s.aim;
          poly(g, [xOf(i) - 12, 11, xOf(i) + 12, 11, xOf(i) + 5, 30, xOf(i) - 5, 30], on ? lin(g, 0, 11, 0, 30, C.goldLight, dt3 > 0 ? C.gold : C.amber) : alpha(C.ice, 0.12));
          if (on) {
            glow(g, xOf(i), 30, 20, C.gold, 0.5);
            const mouths = tier(nd, 5);
            for (let k = 0; k < mouths; k++) disc(g, xOf(i) + (k - (mouths - 1) / 2) * 4.4, 15, 1.5, C.ink);
          }
        }
        tag(g, `×${fmt(nd)}`, W - 22, 20, { size: 9 });
        // 釘：寄せは金、散らしは青
        const pegCol = [C.ice, C.gold, C.sky][s.pegs] || C.ice;
        for (let r = 0; r < ROWS; r++) {
          for (let c = -1; c <= SLOTS; c++) {
            const px = xOf(c + (r % 2 ? 0.5 : 0));
            disc(g, px, pegY(r), PEG_R, lin(g, px - PEG_R, pegY(r) - PEG_R, px + PEG_R, pegY(r) + PEG_R, '#ffffff', pegCol, mix(pegCol, C.ink, 0.5)));
          }
        }
        for (let i = pings.length - 1; i >= 0; i--) {
          const pg = pings[i];
          pg.age += dt;
          if (pg.age > 0.25) { pings.splice(i, 1); continue; }
          disc(g, pg.x, pg.y, PEG_R + 2 + pg.age * 36, null, alpha(C.goldLight, 1 - pg.age / 0.25), 1.6);
        }
        // 受け皿：強化の段数だけ、縁に金の線が重なる。当たりの皿は金に光る
        const y = TRAY_Y;
        const tray = (x, top, bottom, edge) => {
          g.beginPath();
          g.roundRect(x - COL / 2 + 3, y, COL - 6, H - y - 6, [3, 3, 10, 10]);
          g.fillStyle = lin(g, 0, y, 0, H, top, bottom);
          g.fill();
          g.strokeStyle = edge;
          g.lineWidth = 1;
          g.stroke();
        };
        tray(xOf(-1), alpha(C.rose, 0.4), alpha(C.rose, 0.1), alpha(C.rose, 0.6));
        tray(xOf(SLOTS), alpha(C.rose, 0.4), alpha(C.rose, 0.1), alpha(C.rose, 0.6));
        for (let i = 0; i < SLOTS; i++) {
          flash[i] = Math.max(0, (flash[i] || 0) - dt * 3);
          const hot = i === s.hot;
          if (hot) glow(g, xOf(i), y + 30, 46, C.gold, 0.35 + 0.3 * flash[i]);
          tray(xOf(i), hot ? alpha(C.gold, 0.75 + 0.25 * flash[i]) : alpha(C.azure, 0.35 + 0.5 * flash[i]), hot ? alpha(C.goldDark, 0.5) : alpha(C.royal, 0.2), hot ? C.goldLight : alpha(C.sky, 0.6));
          const sl = lvl(s, `slot${i}`);
          for (let k = 0; k < Math.min(5, sl); k++) rr(g, xOf(i) - COL / 2 + 8, H - 12 - k * 4, COL - 16, 1.6, 1, hot ? alpha(C.ink, 0.6) : alpha(C.gold, 0.85));
          text(g, `×${fmt(slotMult(s, i), 2)}`, xOf(i), y + 24 - flash[i] * 4, 12.5, hot ? C.ink : C.ivory);
        }
        // 玉：磨きと改良で色が変わる。金の玉は大きく光る
        const bt = count(s, 'ball_t', BALL_TIERS.length);
        const ballCol = [C.ivory, C.sky, C.teal, C.violet][Math.min(3, bt)];
        const shine = lvl(s, 'polish') > 0;
        for (const b of balls) {
          const [bx, by] = posOf(b);
          const rad = b.gold ? BALL_R + 2 : BALL_R;
          g.globalAlpha = b.age > FALL ? Math.max(0, 1 - (b.age - FALL) / 0.15) : 1;
          if (b.gold) glow(g, bx, by, rad * 3, C.gold, 0.6);
          const col = b.gold ? C.gold : ballCol;
          disc(g, bx, by, rad, lin(g, bx - rad, by - rad, bx + rad, by + rad, '#ffffff', col, mix(col, C.ink, 0.45)));
          if (shine || b.gold) disc(g, bx - rad * 0.3, by - rad * 0.3, rad * 0.28, alpha('#ffffff', 0.9));
        }
        g.globalAlpha = 1;
      },
      destroy() {
        lastFrame = -1e9;
      },
    };
  },
};

export default game;

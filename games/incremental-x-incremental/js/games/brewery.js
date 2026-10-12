// 融合ゲーム（農業 × 工場）：醸造所。樽に仕込んだ酒は、寝かせるほど値打ちが上がる。
// 若いうちに瓶詰めすれば回転が速く、古酒まで待てば 1 本の値打ちが跳ね上がる。ただし寝かせすぎると酢になる。
// 樽ごとに熟成が進むので、「どの樽を、いつ開けるか」を決める遊び。
// 蔵人（自動）、樽の改良、古樽で伸ばす転生ツリー、実績を持つ。星を集めると実験できるようになる。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, pointIn, alpha, mix, lin, rr, disc, line, text, tag, glow, sparkle, stage, Bits, tier, artOn } from '../ui/draw.js';
import { breweryArtReady, drawBrewery } from './brewery_art.js';

// 熟成の段階。at は届く秒数（熟成の速さ 1 のとき）、mult は値打ち
const STAGES = [
  { id: 'raw', at: 0, mult: 0 }, // まだ酒になっていない
  { id: 'young', at: 8, mult: 1 },
  { id: 'aged', at: 25, mult: 4 },
  { id: 'old', at: 80, mult: 16 },
  { id: 'sour', at: 160, mult: 0.5 }, // 寝かせすぎ
];
const OLD = 3;

// 改良（1 回きり）
const VAT_TIERS = [{ own: 10, cost: 300 }, { own: 50, cost: 45000 }, { own: 150, cost: 4.5e7 }];
const BOTTLE_TIERS = [{ n: 50, cost: 5000 }, { n: 500, cost: 5e5 }, { n: 5000, cost: 5e7 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'caskpower');
const barrels = (s) => 3 + lvl(s, 'barrel');
const speed = (s) => 1.1 ** lvl(s, 'yeast') * (1 + 0.1 * treeLvl(s, 'quickage')); // 熟成の速さ
const stageOf = (age) => STAGES.reduce((a, st, i) => (age >= st.at ? i : a), 0);
const stageMult = (s, i) => STAGES[i].mult * (i === OLD ? 1 + 0.2 * treeLvl(s, 'cellar') : 1);
// 樽 1 つを「若い酒」で瓶詰めしたときの実入り
const base = (s, ctx) => {
  const n = lvl(s, 'vat');
  return N(n * milestoneMult(n) * 2 ** count(s, 'vat_t', VAT_TIERS.length) * 2 ** count(s, 'bottle_t', BOTTLE_TIERS.length) * 10)
    .mul(Num.pow(1.2, lvl(s, 'blend'))).mul(Num.pow(1.15, treeLvl(s, 'vintage'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
};
const hasAuto = (s) => lvl(s, 'master') > 0;
// 1 秒あたりがいちばん多くなる段階
function bestStage(s) {
  let best = 1;
  for (let i = 2; i <= OLD; i++) if (stageMult(s, i) / STAGES[i].at > stageMult(s, best) / STAGES[best].at) best = i;
  return best;
}
const target = (s) => (treeLvl(s, 'nose') > 0 ? bestStage(s) : Math.max(1, Math.min(OLD, s.at)));

// i 番目の樽を瓶詰めする（i を省くと、いちばん値打ちのある樽）
function bottle(s, ctx, i) {
  if (i === undefined) {
    i = -1;
    for (let k = 0; k < barrels(s); k++) if (stageOf(s.age[k]) > 0 && (i < 0 || stageMult(s, stageOf(s.age[k])) > stageMult(s, stageOf(s.age[i])))) i = k;
  }
  if (i < 0 || i >= barrels(s)) return null;
  const st = stageOf(s.age[i]);
  if (st < 1) return null;
  const got = base(s, ctx).mul(stageMult(s, st));
  earn(s, got);
  s.age[i] = 0;
  s.bottles++;
  s.stats.bottles = (s.stats.bottles || 0) + 1;
  if (st === OLD) s.stats.old = (s.stats.old || 0) + 1;
  if (st > OLD) s.stats.sour = (s.stats.sour || 0) + 1;
  return got;
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('brewery.up.vat.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'brewery',
  kind: 'fusion',
  parents: ['farm', 'factory'],
  stars: 12, // 実験できるようになる星の累計
  icon: '🍶',
  ppPer,
  keep: ['at'],

  // 仕込み桶 1 つ、樽 3 つから始まる。age は樽ごとの熟成（秒）、at は蔵人が瓶詰めする段階
  newState: () => ({ ...baseState(), up: { vat: 1 }, age: [0, 0, 0, 0, 0, 0, 0, 0], at: 2, bottles: 0 }),

  upgrades: [
    { id: 'vat', base: 15, r: 1.15, gen: true, val: (s, ctx) => fmt(base(s, ctx), 1) },
    { id: 'barrel', base: 200, r: 6, max: 5, val: (s) => String(barrels(s)) },
    { id: 'yeast', base: 150, r: 1.9, max: 15, val: (s) => speed(s).toFixed(2) },
    { id: 'blend', base: 250, r: 1.5 },
    { id: 'master', base: 2500, r: 1, max: 1, show: (s) => s.bottles >= 5 || s.amt.gte(2500) },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('vat_t', VAT_TIERS, 'c.tier.n', 'brewery.tier.vat', (s, tier) => lvl(s, 'vat') >= tier.own),
    ...tierUp('bottle_t', BOTTLE_TIERS, 'brewery.bottletier.n', 'brewery.tier.bottle', (s, tier) => (s.stats.bottles || 0) >= tier.n),
  ],

  // 古樽で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'quickage', base: 2, r: 2.5, max: 5 },
    { id: 'cellar', base: 3, r: 2.5, max: 5 },
    { id: 'nose', base: 15, max: 1, req: { cellar: 2 } },
    { id: 'caskpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'vintage', base: 20, r: 1.7, max: 20, req: { caskpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[10, 100, 1000, 10000].map((v) => ({ id: `bottles${v}`, type: 'bottles', v, done: (s) => (s.stats.bottles || 0) >= v })),
    ...[1, 100, 1000].map((v) => ({ id: `old${v}`, type: 'oldwine', v, done: (s) => (s.stats.old || 0) >= v })),
    { id: 'sour', type: 'sour', v: 1, done: (s) => (s.stats.sour || 0) >= 1 },
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'vats', v, done: (s) => lvl(s, 'vat') >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「種麹」のぶんの仕込み桶を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.vat = Math.max(lvl(s, 'vat'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    const grow = dt * speed(s);
    const n = barrels(s);
    if (!hasAuto(s)) {
      // 手動のあいだは、熟成が進むだけ（瓶詰めしないと実入りはない）
      for (let i = 0; i < n; i++) s.age[i] = Math.min(1e6, s.age[i] + grow);
      return;
    }
    // 蔵人：決めた段階に届いた樽から瓶詰めし、すぐ仕込み直す。長い経過は、こなした回数でまとめて受け取る
    const st = target(s);
    const need = STAGES[st].at;
    const each = base(s, ctx).mul(stageMult(s, st));
    let done = 0;
    for (let i = 0; i < n; i++) {
      s.age[i] += grow;
      if (s.age[i] >= need) {
        const k = Math.floor(s.age[i] / need);
        done += k;
        s.age[i] -= k * need;
      }
    }
    if (done > 0) {
      earn(s, each.mul(done));
      s.bottles += done;
      s.stats.bottles = (s.stats.bottles || 0) + done;
      if (st === OLD) s.stats.old = (s.stats.old || 0) + done;
    }
  },

  // 司令室に出す「手を入れてほしい状態」。自動にしていれば出さない
  attention(s) {
    if (hasAuto(s)) return null;
    const st = s.age.slice(0, barrels(s)).map(stageOf);
    return st.some((x) => x > OLD) ? 'sour' : st.every((x) => x > 0) ? 'ready' : null;
  },
  rate(s, ctx) {
    if (!hasAuto(s)) return ZERO;
    const st = target(s);
    return base(s, ctx).mul((stageMult(s, st) * barrels(s) * speed(s)) / STAGES[st].at);
  },

  // 樽を開ける
  click(s, ctx, i) {
    s.clicks++;
    return bottle(s, ctx, i);
  },

  bottle,
  bestStage,
  stageOf,
  setAt(s, i) {
    s.at = Math.max(1, Math.min(OLD, i));
  },

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(1e5).pow(0.2).floor();
  },

  // 絵：地下の酒蔵。樽ごとに熟成が進み、色が深まる。仕込み桶、樽、酵母、調合、蔵人が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 256;
    const GY = 222;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const status = h('div', { class: 'depth' });
    // 熟成の段階ごとの酒の色：仕込み中、若い、熟成、古酒、寝かせすぎ
    const COLOR = ['#3a4a8a', '#f6e3a8', '#e3a84a', '#b8621f', '#6f8a5a'];
    // 段は字で書かず、酒の色のしずくで示す（名前は、マウスを乗せたときと読み上げ用に残す）
    const drop = (i) => h('span', { class: 'winedrop', style: `--c:${COLOR[i]}` });
    const pdrop = drop(1);
    const pval = h('span', null);
    const preview = h('div', { class: 'sub dropline' }, pdrop, pval);
    const btn = h('button', { class: 'bigbtn' }, t('brewery.bottle'));
    const chips = [1, 2, 3].map((i) => {
      const name = t(`brewery.stage.${STAGES[i].id}`);
      return { i, chip: h('button', { class: 'mini', title: name, 'aria-label': name, onclick: () => game.setAt(api.s(), i) }, drop(i)) };
    });
    const autoRow = h('div', { class: 'row wrap center' }, h('span', { class: 'sub' }, t('brewery.auto')), chips.map((x) => x.chip));
    const wrap = h('div', { class: 'playbox' }, status, cv, preview, btn, autoRow);
    const bits = new Bits();
    let clock = 0;
    let seen = -1;
    const slot = (s, i) => {
      const n = barrels(s);
      const per = Math.min(4, n);
      const row = Math.floor(i / per);
      const cols = row === 0 ? per : n - per;
      const x = W / 2 + (i % per - (cols - 1) / 2) * 96;
      return [x, n > 4 ? (row ? GY - 34 : GY - 112) : GY - 62];
    };
    const open = (ev, i) => {
      const s = api.s();
      const got = game.click(s, api.ctx(), i);
      if (got) {
        floatText(wrap, ev, '+' + fmt(got, 1));
        se('glass');
      }
    };
    btn.addEventListener('pointerdown', (ev) => open(ev));
    cv.addEventListener('pointerdown', (ev) => {
      const s = api.s();
      const [x, y] = pointIn(cv, ev, W, H);
      let hit;
      for (let i = 0; i < barrels(s); i++) {
        const [bx, by] = slot(s, i);
        if (Math.abs(x - bx) < 42 && Math.abs(y - by) < 38) hit = i;
      }
      open(ev, hit);
    });
    el.append(wrap);

    return {
      update() {
        const s = api.s();
        const n = barrels(s);
        const ready = s.age.slice(0, n).filter((a) => stageOf(a) > 0).length;
        setText(status, t('brewery.ready', { v: ready, n }));
        let bestI = -1;
        for (let k = 0; k < n; k++) if (stageOf(s.age[k]) > 0 && (bestI < 0 || stageMult(s, stageOf(s.age[k])) > stageMult(s, stageOf(s.age[bestI])))) bestI = k;
        preview.style.visibility = bestI < 0 ? 'hidden' : '';
        if (bestI >= 0) {
          const bs = stageOf(s.age[bestI]);
          pdrop.style.setProperty('--c', COLOR[bs]);
          pdrop.title = t(`brewery.stage.${STAGES[bs].id}`);
          setText(pval, '+' + fmt(base(s, api.ctx()).mul(stageMult(s, bs)), 1));
        }
        btn.disabled = bestI < 0;
        const auto = hasAuto(s);
        const tuned = treeLvl(s, 'nose') > 0;
        autoRow.hidden = !auto;
        for (const x of chips) {
          x.chip.classList.toggle('on', x.i === target(s));
          x.chip.disabled = tuned;
        }
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const n = barrels(s);
        // 絵は 2 通り：素材を使う描き方（brewery_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('brewery') && breweryArtReady()) {
          const casks = [];
          for (let i = 0; i < n; i++) {
            const [x, y] = slot(s, i);
            const st = stageOf(s.age[i]);
            const next = STAGES[Math.min(STAGES.length - 1, st + 1)].at;
            casks.push({ x, y, st, age: s.age[i], row: n > 4 && i >= 4 ? 1 : 0, k: st >= STAGES.length - 1 ? 1 : (s.age[i] - STAGES[st].at) / (next - STAGES[st].at) });
            if (st === OLD && Math.random() < dt * 3) bits.add(x + (Math.random() - 0.5) * 40, y - 20, 1, { color: C.goldLight, size: 1.6, speed: 20, gravity: -30, life: 0.6, glow: true });
          }
          const bottled = s.stats.bottles || 0;
          if (seen >= 0 && bottled > seen) bits.add(W - 60, GY - 10, Math.min(12, (bottled - seen) * 3), { color: [C.gold, C.goldLight, C.amber], speed: 90, up: 60, size: 2.6, glow: true });
          seen = bottled;
          drawBrewery(g, { W, H, GY, clock, dt, casks, colors: COLOR, two: n > 4, vats: tier(lvl(s, 'vat'), 7), vt: count(s, 'vat_t', VAT_TIERS.length), yeast: lvl(s, 'yeast'), vatLabel: fmt(lvl(s, 'vat')),
            auto: hasAuto(s), lamp: COLOR[target(s)], blend: Math.min(1, lvl(s, 'blend') / 20),
            shelf: Math.min(18, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0)), bt: count(s, 'bottle_t', BOTTLE_TIERS.length) });
          bits.draw(g, dt);
          return;
        }
        // 蔵の壁（石のアーチ）と床
        stage(g, W, H, { top: '#16226a', bottom: '#0b1438', horizon: GY, floor: '#141c40', floorEnd: C.ink });
        g.strokeStyle = alpha(C.ice, 0.1);
        g.lineWidth = 1;
        for (let x = 0; x < W; x += 120) {
          g.beginPath();
          g.moveTo(x + 8, GY);
          g.lineTo(x + 8, 70);
          g.quadraticCurveTo(x + 60, 26, x + 112, 70);
          g.lineTo(x + 112, GY);
          g.stroke();
        }
        // 上の棚：仕込み桶。数で桶が増え、改良で金の帯。酵母の段が上がるほど、よく泡立つ
        const vats = tier(lvl(s, 'vat'), 7);
        const vt = count(s, 'vat_t', VAT_TIERS.length);
        const yeast = lvl(s, 'yeast');
        rr(g, 16, 46, W - 32, 2.5, 1, alpha(C.gold, 0.6));
        for (let i = 0; i < vats; i++) {
          const vx = 44 + i * 30;
          rr(g, vx - 10, 24, 20, 22, 3, lin(g, vx - 10, 0, vx + 10, 0, '#d9964e', '#7a4a1c'));
          for (let k = 0; k < vt; k++) rr(g, vx - 10, 29 + k * 5, 20, 1.6, 0, C.gold);
          rr(g, vx - 12, 22, 24, 3, 1.5, C.goldLight);
          for (let b = 0; b < Math.min(3, 1 + Math.floor(yeast / 5)); b++) {
            const up = (clock * (0.5 + yeast * 0.05) + b / 3 + i * 0.2) % 1;
            disc(g, vx - 5 + b * 5, 20 - up * 12, 1.4 + up, null, alpha(C.ice, 0.55 * (1 - up)), 0.8);
          }
        }
        tag(g, `×${fmt(lvl(s, 'vat'))}`, 44 + vats * 30 + 6, 34, { size: 9.5, align: 'left' });
        // 蔵人：棚の端のランタン。狙う熟成の段の色で灯る
        if (hasAuto(s)) {
          const lx = W - 34;
          line(g, [lx, 8, lx, 18], C.gold, 1);
          glow(g, lx, 28, 26, COLOR[target(s)], 0.6 + 0.1 * Math.sin(clock * 3));
          rr(g, lx - 6, 18, 12, 18, 3, alpha(COLOR[target(s)], 0.9), C.gold, 1.2);
        }
        if (n > 4) rr(g, 20, GY - 74, W - 40, 3, 1, alpha(C.gold, 0.45));
        // 樽：正面から見た鏡板。中の色が熟成、金の弧が次の段階までの進み。調合の段で酒につやが出る
        const blend = Math.min(1, lvl(s, 'blend') / 20);
        for (let i = 0; i < n; i++) {
          const [x, y] = slot(s, i);
          const st = stageOf(s.age[i]);
          const next = STAGES[Math.min(STAGES.length - 1, st + 1)].at;
          const k = st >= STAGES.length - 1 ? 1 : (s.age[i] - STAGES[st].at) / (next - STAGES[st].at);
          if (st === OLD) glow(g, x, y, 54, C.gold, 0.3 + 0.1 * Math.sin(clock * 3 + i));
          g.fillStyle = lin(g, x - 38, y - 30, x + 38, y + 30, '#b98a4a', '#4a2f14');
          g.beginPath();
          g.ellipse(x, y, 38, 30, 0, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = alpha(C.gold, 0.8);
          g.lineWidth = 1.4;
          g.beginPath();
          g.ellipse(x, y, 38, 30, 0, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = lin(g, x - 26, y - 20, x + 26, y + 20, mix(COLOR[st], '#ffffff', 0.15 + blend * 0.35), mix(COLOR[st], C.ink, 0.35));
          g.beginPath();
          g.ellipse(x, y, 26, 20, 0, 0, Math.PI * 2);
          g.fill();
          if (blend > 0) {
            g.strokeStyle = alpha('#ffffff', 0.35 + blend * 0.3);
            g.lineWidth = 1.6;
            g.beginPath();
            g.ellipse(x, y, 21, 15, 0, Math.PI * 1.1, Math.PI * 1.5);
            g.stroke();
          }
          g.strokeStyle = st > OLD ? C.rose : C.goldLight;
          g.lineWidth = 3;
          g.lineCap = 'round';
          g.beginPath();
          g.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, Math.min(1, k)));
          g.stroke();
          text(g, t(`brewery.stage.${STAGES[st].id}`), x, y + 4, 10.5, st === 0 ? C.ice : C.ink);
          if (st === OLD && Math.random() < dt * 3) bits.add(x + (Math.random() - 0.5) * 40, y - 20, 1, { color: C.goldLight, size: 1.6, speed: 20, gravity: -30, life: 0.6, glow: true });
          if (st > OLD && Math.floor(clock * 2) % 2 === 0) sparkle(g, x + 28, y - 22, 4, C.rose);
        }
        // びん詰めした瞬間と、床に並ぶびん（稼ぐほど増える。びん詰めの改良で金のふた）
        const bottled = s.stats.bottles || 0;
        if (seen >= 0 && bottled > seen) bits.add(W - 60, GY - 10, Math.min(12, (bottled - seen) * 3), { color: [C.gold, C.goldLight, C.amber], speed: 90, up: 60, size: 2.6, glow: true });
        seen = bottled;
        const shelf = Math.min(18, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0));
        const bt = count(s, 'bottle_t', BOTTLE_TIERS.length);
        for (let i = 0; i < shelf; i++) {
          const x = 14 + (i % 9) * 11 + (i >= 9 ? W - 126 : 0);
          rr(g, x, GY + 9, 7, 17, 2, lin(g, 0, GY + 9, 0, GY + 26, i % 3 ? '#3f8a6a' : C.amber, C.ink));
          rr(g, x + 2, GY + 4, 3, 6, 1, bt > 0 ? C.gold : C.steel);
        }
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

// 基本ゲーム5：農業。作物を選んで育て、実ったら収穫する。
// 早く実る作物ほど 1 秒あたりの実入りは多いが、こまめな収穫が要る。ゆっくり実る作物は放っておいても無駄が少ない。
// 「張りついて稼ぐか、任せて稼ぐか」を作物で選ぶ遊び。
// 季節が巡り、作物ごとに得意な季節がある。冬は育ちが遅い。水やり、畑の改良、種もみで伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { imgOr } from '../core/assets.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { miniIcon } from '../ui/icons.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, poly, tag, glow, sparkle, stage, pawpaw, Bits, artOn } from '../ui/draw.js';
import { farmArtReady, drawFarm } from './farm_art.js';

// 作物の絵（ポポーは素材の絵、ほかはポポー形のアイコン）
const cropArt = (c) => (c.img ? imgOr(c.img) : miniIcon(c.glyph, c.color));

// grow: 実るまでの秒数、value: 畑 1 枚あたりの収穫、need: 解放に要る累計、best: 得意な季節、hardy: 冬でも育ちが落ちない
const CROPS = [
  { id: 'leaf', grow: 10, value: 2, need: 0, glyph: 'leaf', color: '#8fd06a', best: 0 },
  { id: 'mushroom', grow: 30, value: 4.5, need: 150, glyph: 'mushroom', color: '#d9b0a0', best: 3, hardy: true },
  { id: 'root', grow: 60, value: 9, need: 300, glyph: 'carrot', color: '#f2a65a', best: -1, hardy: true },
  { id: 'berry', grow: 120, value: 15, need: 3000, glyph: 'berry', color: '#e8637f', best: 1 },
  { id: 'pawpaw', grow: 300, value: 30, need: 10000, img: 'pawpaw', best: 2 },
];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_SEC = 120;
const YEAR = SEASON_SEC * SEASONS.length;
const PLOT_TIERS = [{ own: 10, cost: 200 }, { own: 50, cost: 30000 }, { own: 150, cost: 3e7 }];
const HARVEST_TIERS = [{ n: 50, cost: 2000 }, { n: 500, cost: 2e5 }, { n: 5000, cost: 2e7 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'seedpower');
const crop = (s) => CROPS[s.crop] || CROPS[0];
const season = (s) => Math.floor((s.year % YEAR) / SEASON_SEC);
// 得意な季節の収穫倍率
const favour = (s) => 2 + 0.5 * treeLvl(s, 'seasonal');
const seasonMult = (s, c, sea) => (c.best === sea ? favour(s) : 1);
// 冬は育ちが半分（丈夫な作物と、温室を 10 段まで上げた畑は別）
const winterSlow = (s, c, sea) => (sea === 3 && !c.hardy && lvl(s, 'greenhouse') < 10 ? 0.5 : 1);
const growSpeed = (s) => (1 + 0.1 * lvl(s, 'greenhouse')) * (1 + 0.1 * treeLvl(s, 'sprinkler'));
const growTimeOf = (s, c, sea) => c.grow / (growSpeed(s) * winterSlow(s, c, sea));
const growTime = (s) => growTimeOf(s, crop(s), season(s));
const plots = (s) => {
  const n = lvl(s, 'plot');
  return n * milestoneMult(n) * 2 ** count(s, 'plot_t', PLOT_TIERS.length);
};
const valMult = (s, ctx) => Num.pow(1.25, lvl(s, 'fertilizer')).mul(2 ** count(s, 'harvest_t', HARVEST_TIERS.length))
  .mul(Num.pow(1.15, treeLvl(s, 'terrace'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const yieldOf = (s, ctx) => N(plots(s) * crop(s).value * seasonMult(s, crop(s), season(s))).mul(valMult(s, ctx));
const hasRobot = (s) => lvl(s, 'robot') > 0;
const interval = (s) => 30 * 0.8 ** lvl(s, 'tuning'); // 収穫ロボが見回る間隔（秒）
// ロボ任せのときの 1 周：実ったあと、次の見回りまで待つぶんが無駄になる
const cycleOf = (s, c, sea) => Math.ceil(growTimeOf(s, c, sea) / interval(s) - 1e-9) * interval(s);
const ripe = (s) => s.prog >= growTime(s) - 1e-9;
// その季節にロボ任せでいちばん稼げる作物（暦の枝が使う）
function bestCrop(s, sea) {
  let best = 0;
  let top = -1;
  CROPS.forEach((c, i) => {
    if (!s.life.gte(c.need)) return;
    const v = (c.value * seasonMult(s, c, sea)) / cycleOf(s, c, sea);
    if (v > top) { top = v; best = i; }
  });
  return best;
}

function harvest(s, ctx) {
  if (!ripe(s)) return null;
  const got = yieldOf(s, ctx);
  earn(s, got);
  s.prog = 0;
  s.stats.harvests = (s.stats.harvests || 0) + 1;
  s.stats[`crop_${crop(s).id}`] = 1;
  // 暦：収穫のたびに、その季節に合う作物へ植え替える
  if (treeLvl(s, 'almanac') > 0) s.crop = bestCrop(s, season(s));
  return got;
}

const tierUp = (base, prefix, tiers, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr('c.tier.n', { g: tr(`farm.up.${base}.n`), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'farm',
  kind: 'base',
  icon: '🌱',
  ppPer,
  keep: ['crop', 'year'],
  unlock: { choice: true },

  // 畑 1 枚から始まる。prog は植えてからの秒数、wait はロボの見回りまでの経過、year は季節の巡り
  newState: () => ({ ...baseState(), up: { plot: 1 }, crop: 0, prog: 0, wait: 0, year: 0 }),

  upgrades: [
    { id: 'plot', base: 10, r: 1.15, gen: true, val: (s) => fmt(plots(s)) },
    { id: 'fertilizer', base: 150, r: 1.7 },
    { id: 'greenhouse', base: 200, r: 1.7, max: 20, val: (s) => fmtTime(growTime(s)) },
    { id: 'robot', base: 600, r: 1, max: 1, show: (s) => s.life.gte(100) || s.amt.gte(600) },
    { id: 'tuning', base: 2000, r: 2.2, max: 8, show: (s) => hasRobot(s), val: (s) => fmtTime(interval(s)) },
    ...tierUp('plot', 'plot_t', PLOT_TIERS, 'farm.tier.plot', (s, tier) => lvl(s, 'plot') >= tier.own),
    ...tierUp('fertilizer', 'harvest_t', HARVEST_TIERS, 'farm.tier.harvest', (s, tier) => (s.stats.harvests || 0) >= tier.n),
  ],

  // 種もみで買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'sprinkler', base: 2, r: 2.5, max: 5 },
    { id: 'seasonal', base: 3, r: 3, max: 4 },
    { id: 'almanac', base: 15, max: 1, req: { seasonal: 1 } },
    { id: 'seedpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'terrace', base: 20, r: 1.7, max: 20, req: { seedpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[10, 100, 1000, 10000].map((v) => ({ id: `harvests${v}`, type: 'harvests', v, done: (s) => (s.stats.harvests || 0) >= v })),
    { id: 'crops', type: 'crops', v: CROPS.length, done: (s) => CROPS.every((c) => s.stats[`crop_${c.id}`]) },
    ...[1, 10].map((v) => ({ id: `years${v}`, type: 'years', v, done: (s) => (s.stats.years || 0) >= v })),
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'plots', v, done: (s) => lvl(s, 'plot') >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「地ならし」のぶんの畑を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.plot = Math.max(lvl(s, 'plot'), n);
  },

  tick(s, dt, ctx) {
    const before = Math.floor(s.year / YEAR);
    s.year += dt;
    s.stats.years = (s.stats.years || 0) + Math.floor(s.year / YEAR) - before;
    if (!hasRobot(s)) {
      // 手動のあいだは、実ったまま待つ（収穫しないと実入りはない）
      s.prog = Math.min(growTime(s), s.prog + dt);
      return;
    }
    const iv = interval(s);
    for (let i = 0; i < 2000 && dt > 0; i++) {
      const step = Math.min(dt, iv - s.wait);
      s.prog = Math.min(growTime(s), s.prog + step);
      s.wait += step;
      dt -= step;
      if (s.wait >= iv - 1e-9) {
        s.wait = 0;
        harvest(s, ctx);
      }
    }
    // 長い経過の残りは、1 周あたりの収穫でまとめて集計する
    if (dt > 0) {
      earn(s, yieldOf(s, ctx).mul(dt / cycleOf(s, crop(s), season(s))));
      s.stats.harvests = (s.stats.harvests || 0) + Math.floor(dt / cycleOf(s, crop(s), season(s)));
    }
  },

  rate: (s, ctx) => (hasRobot(s) ? yieldOf(s, ctx).div(cycleOf(s, crop(s), season(s))) : ZERO),

  // 手で収穫する（実っていなければ何も起きない）
  click(s, ctx) {
    s.clicks++;
    return harvest(s, ctx);
  },

  // 水をやる：育ちを 5% ぶん進める
  water(s) {
    s.clicks++;
    s.prog = Math.min(growTime(s), s.prog + growTime(s) * 0.05);
  },

  unlockedCrops: (s) => CROPS.filter((c) => s.life.gte(c.need)).length,
  cropOpen: (s, i) => s.life.gte(CROPS[i].need),
  cropCount: CROPS.length,

  setCrop(s, i) {
    if (i === s.crop || !CROPS[i] || !s.life.gte(CROPS[i].need)) return;
    s.crop = i;
    s.prog = 0;
  },

  prestigeTotal(s) {
    if (s.life.lt(1e6)) return ZERO;
    return s.life.div(1e6).pow(0.2).floor();
  },

  // 絵：季節の移る畑。畑の枚数で区画が増え、肥料で土が肥え、温室でガラスの屋根がかかる。
  mount(el, api) {
    const W = 480;
    const H = 280;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const bar = h('div', { class: 'bar' }, h('i'));
    const seasonEl = h('div', { class: 'zone' });
    const status = h('div', { class: 'depth' });
    const info = h('div', { class: 'sub' });
    const btn = h('button', { class: 'bigbtn' }, t('farm.harvest'));
    const waterBtn = h('button', { class: 'bigbtn water' }, t('farm.water'));
    const chips = CROPS.map((c, i) => {
      const label = h('span');
      const chip = h('button', { class: 'chip', onclick: () => game.setCrop(api.s(), i) },
        h('span', { class: 'gicon', html: cropArt(c) }), label);
      return { c, i, chip, label };
    });
    const auto = h('div', { class: 'sub' }, t('farm.almanac'));
    const wrap = h('div', { class: 'playbox' }, h('div', { class: 'row center' }, seasonEl, status), cv, bar, info, h('div', { class: 'row' }, btn, waterBtn),
      h('div', { class: 'row wrap center' }, chips.map((x) => x.chip)), auto);
    const bits = new Bits();
    const BARN = [W - 60, 52]; // 収穫が飛んでいく先
    const doHarvest = (ev) => {
      const got = game.click(api.s(), api.ctx());
      if (got) {
        floatText(wrap, ev, '+' + fmt(got, 1));
        se('harvest');
      }
    };
    const doWater = () => {
      game.water(api.s());
      bits.add(60 + Math.random() * (W - 160), 104, 14, { color: [C.sky, C.ice], speed: 60, spread: 1.2, angle: Math.PI / 2, gravity: 500, life: 0.5, size: 2.4 });
      se('water');
    };
    btn.addEventListener('pointerdown', doHarvest);
    waterBtn.addEventListener('pointerdown', doWater);
    // 畑を直接クリックしても、実っていれば収穫、まだなら水やり
    cv.addEventListener('pointerdown', (ev) => (ripe(api.s()) ? doHarvest(ev) : doWater()));
    el.append(wrap);

    // 季節ごとの空、丘、土
    const SKY = [['#2a4bd0', '#5a4fa8'], ['#1f3fae', '#2f6ad8'], ['#3a2f86', '#b0603a'], ['#22366e', '#5f7fb8']];
    const HILL = ['#2f7d58', '#236a4a', '#7a5a2c', '#7f93c4'];
    const SOIL = ['#4a3a55', '#4a3a55', '#54384a', '#56608a'];
    let clock = 0;
    let seen = -1; // 直前に見た収穫回数（増えたら、収穫が飛ぶ絵を出す）

    // 作物 1 株。k は育ち具合（0〜1）、sz は大きさ
    const plant = (x, y, sz, c, k) => {
      if (k < 0.12) {
        disc(g, x, y + sz * 0.1, Math.max(0.8, sz * 0.07), alpha(C.goldLight, 0.7));
        return;
      }
      if (k < 1) {
        // 芽から葉へ
        const hh = sz * (0.2 + 0.5 * k);
        line(g, [x, y + sz * 0.3, x, y + sz * 0.3 - hh], C.leafDark, Math.max(1, sz * 0.07));
        g.fillStyle = k > 0.55 ? C.leaf : C.leafLight;
        for (const dir of [-1, 1]) {
          g.beginPath();
          g.ellipse(x + dir * hh * 0.42, y + sz * 0.3 - hh, hh * 0.45, hh * 0.24, dir * -0.5, 0, Math.PI * 2);
          g.fill();
        }
        return;
      }
      // 実った姿（作物ごと）
      const r = sz * 0.34;
      const col = c.color || C.leaf;
      const body = lin(g, x - r, y - r, x + r, y + r, mix(col, '#ffffff', 0.35), mix(col, C.ink, 0.3));
      if (c.id === 'mushroom') {
        rr(g, x - r * 0.3, y, r * 0.6, r, r * 0.2, C.ivory);
        g.fillStyle = body;
        g.beginPath();
        g.arc(x, y, r, Math.PI, 0);
        g.closePath();
        g.fill();
      } else if (c.id === 'root') {
        poly(g, [x - r * 0.8, y - r * 0.5, x + r * 0.8, y - r * 0.5, x, y + r * 1.1], body);
      } else if (c.id === 'pawpaw') {
        pawpaw(g, x, y, r * 2.2, { leaf: false });
      } else if (c.id === 'leaf') {
        g.fillStyle = body;
        for (const dir of [-1, 0, 1]) {
          g.beginPath();
          g.ellipse(x + dir * r * 0.55, y - Math.abs(dir) * -r * 0.2, r * 0.5, r * 0.9, dir * 0.5, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        disc(g, x, y, r, body);
        disc(g, x - r * 0.3, y - r * 0.3, r * 0.22, alpha('#ffffff', 0.5));
      }
      if (c.id === 'root' || c.id === 'berry') {
        g.fillStyle = C.leaf;
        g.beginPath();
        g.ellipse(x, y - r * (c.id === 'root' ? 0.7 : 0.9), r * 0.5, r * 0.22, 0, 0, Math.PI * 2);
        g.fill();
      }
    };

    return {
      update() {
        const s = api.s();
        const sea = season(s);
        const frac = Math.min(1, s.prog / growTime(s));
        const done = ripe(s);
        setText(seasonEl, `${t(`farm.season.${SEASONS[sea]}`)}（${t('farm.seasonLeft', { t: fmtTime(Math.ceil(SEASON_SEC - (s.year % SEASON_SEC))) })}）`);
        bar.firstChild.style.width = `${frac * 100}%`;
        setText(status, done ? t('farm.ripe') : t('farm.growing', { t: fmtTime(Math.ceil(growTime(s) - s.prog)) }));
        status.dataset.st = done ? 'good' : '';
        setText(info, t('farm.yield', { v: fmt(yieldOf(s, api.ctx()), 1), n: fmt(plots(s)) }));
        btn.disabled = !done;
        waterBtn.disabled = done;
        auto.hidden = treeLvl(s, 'almanac') < 1;
        for (const x of chips) {
          const open = s.life.gte(x.c.need);
          x.chip.disabled = !open;
          x.chip.classList.toggle('on', x.i === s.crop);
          x.chip.classList.toggle('fav', open && x.c.best === sea);
          setText(x.label, open
            ? t('farm.crop', { n: t(`farm.crop.${x.c.id}`), t: fmtTime(growTimeOf(s, x.c, sea)) }) + (x.c.best === sea ? ` ×${favour(s)}` : '')
            : t('farm.cropLocked', { v: fmt(x.c.need) }));
        }
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const c = crop(s);
        const sea = season(s);
        const k = Math.min(1, s.prog / growTime(s));
        // 絵は 2 通り：素材を使う描き方（farm_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('farm') && farmArtReady()) {
          const n = lvl(s, 'plot');
          const shown = Math.min(n, 140);
          const f = drawFarm(g, {
            W, H, BARN, clock, sea, k, crop: c.id, n, shown,
            per: Math.max(1, Math.min(4, 1 + Math.round(Math.log2(Math.max(1, plots(s) / Math.max(1, n)))))),
            fert: lvl(s, 'fertilizer'), gh: lvl(s, 'greenhouse'), robot: hasRobot(s) ? s.wait / interval(s) : -1, tune: lvl(s, 'tuning'),
            pile: Math.min(24, Math.max(0, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0))),
            barnTier: count(s, 'harvest_t', HARVEST_TIERS.length),
          });
          const done = s.stats.harvests || 0;
          if (seen >= 0 && done > seen) {
            for (let i = 0; i < Math.min(shown, 14); i++) bits.add(f.ox + Math.random() * f.cell * f.cols, f.oy + Math.random() * f.cell * f.rows, 1, { color: c.color || C.leaf, size: 4, speed: 60, life: 0.7, to: BARN, glow: true });
          }
          seen = done;
          bits.draw(g, dt);
          return;
        }
        // 空と丘（季節で色が変わる）
        stage(g, W, H, { top: SKY[sea][0], bottom: SKY[sea][1], stars: sea === 3 ? 18 : 8, t: clock });
        glow(g, 54, 36, 60, sea === 2 ? C.amber : C.goldLight, 0.4);
        disc(g, 54, 36, sea === 1 ? 17 : 13, sea === 3 ? C.ice : C.goldLight);
        g.fillStyle = lin(g, 0, 50, 0, 100, HILL[sea], mix(HILL[sea], C.ink, 0.5));
        g.beginPath();
        g.ellipse(W * 0.3, 98, W * 0.5, 44, 0, Math.PI, 0);
        g.ellipse(W * 0.85, 100, W * 0.4, 36, 0, Math.PI, 0);
        g.fill();
        g.fillStyle = lin(g, 0, 96, 0, H, mix(HILL[sea], C.ink, 0.55), C.ink);
        g.fillRect(0, 96, W, H - 96);
        // 納屋と、収穫の山（稼ぐほど木箱が積み上がる）。収穫の改良で、屋根に金の縁が付く
        const ht = count(s, 'harvest_t', HARVEST_TIERS.length);
        rr(g, BARN[0] - 30, BARN[1] - 8, 60, 44, 3, lin(g, 0, BARN[1] - 8, 0, BARN[1] + 36, '#b8455a', '#5a1f3a'));
        poly(g, [BARN[0] - 38, BARN[1] - 6, BARN[0], BARN[1] - 34, BARN[0] + 38, BARN[1] - 6], lin(g, 0, BARN[1] - 34, 0, BARN[1] - 6, '#2a3566', C.ink));
        if (ht > 0) line(g, [BARN[0] - 38, BARN[1] - 6, BARN[0], BARN[1] - 34, BARN[0] + 38, BARN[1] - 6], C.gold, 1 + ht * 0.6);
        rr(g, BARN[0] - 9, BARN[1] + 10, 18, 26, 2, alpha(C.goldLight, 0.85));
        line(g, [BARN[0], BARN[1] + 10, BARN[0], BARN[1] + 36], alpha(C.ink, 0.4), 1);
        const pile = Math.min(24, Math.max(0, Math.floor((s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0))));
        for (let i = 0; i < pile; i++) rr(g, BARN[0] - 96 + (i % 4) * 14, BARN[1] + 26 - Math.floor(i / 4) * 11, 12, 10, 2, i % 2 ? C.gold : '#b98f33');
        // 畑：持っている畑の枚数だけ区画が並ぶ（増えるほど細かく、広くなる）
        const n = lvl(s, 'plot');
        const shown = Math.min(n, 140);
        const fx = 14;
        const fy = 104;
        const fw = W - 28;
        const fh = H - fy - 16;
        const cols = Math.max(2, Math.min(20, Math.ceil(Math.sqrt(shown * (fw / fh)))));
        const rows = Math.max(1, Math.ceil(shown / cols));
        const cell = Math.min(fw / cols, fh / rows, 64);
        const ox = fx + (fw - cell * cols) / 2;
        const oy = fy + (fh - cell * rows) / 2;
        // 肥料：段が上がるほど土が黒く肥え、金の粒が光る
        const fert = lvl(s, 'fertilizer');
        const rich = Math.min(1, fert / 20);
        const soil = mix(SOIL[sea], '#2a1f3a', rich * 0.7);
        rr(g, ox - 6, oy - 6, cell * cols + 12, cell * rows + 12, 10, alpha(C.ink, 0.55), alpha(C.gold, 0.35), 1);
        // 畑の広さの倍率（そろえた数や改良）は、1 区画あたりの株の数で見せる
        const per = Math.max(1, Math.min(4, 1 + Math.round(Math.log2(Math.max(1, plots(s) / Math.max(1, n))))));
        for (let i = 0; i < shown; i++) {
          const x = ox + (i % cols) * cell;
          const y = oy + Math.floor(i / cols) * cell;
          rr(g, x + 1.5, y + 1.5, cell - 3, cell - 3, Math.min(7, cell * 0.22), lin(g, 0, y, 0, y + cell, mix(soil, '#ffffff', 0.08), soil));
          if (fert > 0 && (i * 7 + Math.floor(clock * 1.5)) % Math.max(3, 14 - fert) === 0) disc(g, x + cell * (0.2 + ((i * 13) % 60) / 100), y + cell * 0.82, Math.max(0.8, cell * 0.035), alpha(C.gold, 0.9));
          const sz = per > 1 ? cell * 0.56 : cell * 0.9;
          for (let j = 0; j < per; j++) {
            const px = per === 1 ? 0.5 : 0.28 + 0.44 * (j % 2);
            const py = per <= 2 ? 0.5 : 0.28 + 0.44 * Math.floor(j / 2);
            // 実ったら、少し揺れる
            const sway = k >= 1 ? Math.sin(clock * 3 + i + j) * cell * 0.03 : 0;
            plant(x + cell * px + sway, y + cell * py, sz, c, k);
          }
        }
        if (n > shown) tag(g, `+${n - shown}`, ox + cell * cols - 4, oy + cell * rows - 10, { align: 'right', size: 9.5 });
        if (fert > 0) tag(g, `Lv ${fert}`, ox + 4, oy + cell * rows - 10, { align: 'left', size: 8.5 });
        // 温室：畑にガラスの屋根がかかる。段が上がるほど骨組みが増える
        const gh = lvl(s, 'greenhouse');
        if (gh > 0) {
          const gx = ox - 6;
          const gw = cell * cols + 12;
          const top = oy - 22;
          g.fillStyle = lin(g, 0, top, 0, oy + 20, alpha(C.ice, 0.16 + Math.min(0.14, gh * 0.007)), alpha(C.ice, 0));
          g.beginPath();
          g.moveTo(gx, oy - 6);
          g.quadraticCurveTo(gx + gw / 2, top - 14, gx + gw, oy - 6);
          g.lineTo(gx + gw, oy + 20);
          g.lineTo(gx, oy + 20);
          g.fill();
          g.strokeStyle = alpha(C.ice, 0.7);
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(gx, oy - 6);
          g.quadraticCurveTo(gx + gw / 2, top - 14, gx + gw, oy - 6);
          g.stroke();
          const ribs = Math.min(9, 2 + Math.floor(gh / 2));
          for (let i = 1; i < ribs; i++) {
            const u = i / ribs;
            const ry = oy - 6 - 2 * u * (1 - u) * 30;
            line(g, [gx + gw * u, ry, gx + gw * u, oy - 2], alpha(C.ice, 0.4), 1);
          }
          tag(g, `Lv ${gh}`, gx + gw / 2, top - 4, { size: 8.5, color: C.ice, line: alpha(C.ice, 0.3) });
        }
        // 収穫ロボ：見回りの進み具合に合わせて畑を横切る。調整を重ねるほどアンテナが伸びる
        if (hasRobot(s)) {
          const p = s.wait / interval(s);
          const rx = ox + p * cell * cols;
          const ry = oy + cell * rows + 6;
          const tune = lvl(s, 'tuning');
          glow(g, rx, ry - 9, 16, C.azure, 0.5);
          rr(g, rx - 9, ry - 16, 18, 14, 4, lin(g, 0, ry - 16, 0, ry - 2, C.ice, C.azure));
          rr(g, rx - 6, ry - 12, 12, 5, 2, C.ink);
          disc(g, rx - 3, ry - 9.5, 1.4, C.goldLight);
          disc(g, rx + 3, ry - 9.5, 1.4, C.goldLight);
          line(g, [rx, ry - 16, rx, ry - 20 - tune * 1.2], C.ice, 1);
          disc(g, rx, ry - 21 - tune * 1.2, 1.8, tune > 0 ? C.gold : C.ice);
          disc(g, rx - 5, ry - 1, 2.4, C.steelDark);
          disc(g, rx + 5, ry - 1, 2.4, C.steelDark);
        }
        // 収穫した瞬間：作物が納屋へ飛んでいく
        const harvests = s.stats.harvests || 0;
        if (seen >= 0 && harvests > seen) {
          for (let i = 0; i < Math.min(shown, 14); i++) {
            bits.add(ox + Math.random() * cell * cols, oy + Math.random() * cell * rows, 1, { color: c.color || C.leaf, size: 4, speed: 60, life: 0.7, to: BARN, glow: true });
          }
        }
        seen = harvests;
        // 春は花びら、秋は落ち葉、冬は雪
        if (sea !== 1) {
          const col = sea === 0 ? '#ffc4dc' : sea === 2 ? C.amber : '#ffffff';
          for (let i = 0; i < (sea === 3 ? 26 : 12); i++) {
            const x = (i * 73 + clock * (12 + (i % 5) * 4)) % W;
            const y = (i * 41 + clock * (22 + (i % 7) * 5)) % H;
            if (sea === 3) disc(g, x, y, 1.4 + (i % 3) * 0.5, alpha(col, 0.85));
            else {
              g.fillStyle = alpha(col, 0.8);
              g.beginPath();
              g.ellipse(x, y, 3, 1.6, clock * 2 + i, 0, Math.PI * 2);
              g.fill();
            }
          }
        }
        if (k >= 1 && Math.floor(clock * 2) % 2 === 0) sparkle(g, ox + cell * cols + 2, oy - 2, 6, C.goldLight, 0.9);
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

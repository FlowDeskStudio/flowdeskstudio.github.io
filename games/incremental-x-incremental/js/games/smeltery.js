// 融合ゲーム（クリッカー × 採掘）：精錬所。炉の温度を適温帯に保つほど多く精錬できる。
// 熱しすぎると歩留まりが落ちるので、「強化すれば良い」ではなく送風量の加減が要る。
// 精錬する金属を選ぶと適温帯が変わる（低い温度で楽な青銅、高い温度で値打ちの高い鋼）。
// 適温を保ち続けるとたまる鋳込み、炉の改良、合金で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, poly, tag, glow, sparkle, smoke, fx, stage, Bits, tier, artOn } from '../ui/draw.js';
import { smelteryArtReady, drawSmeltery } from './smeltery_art.js';

const K = 0.08; // 放熱の速さ（温度に比例して冷める）
const MAX = 130;
// 精錬する金属。lo〜hi が適温帯（れんがとツリーで上へ広がる）、value は値打ち、need は解放に要る累計
const METALS = [
  { id: 'iron', lo: 60, hi: 80, value: 1, need: 0 },
  { id: 'bronze', lo: 35, hi: 55, value: 0.6, need: 500 },
  { id: 'steel', lo: 90, hi: 104, value: 3, need: 1e6 },
];
const CAST = { need: 30, sec: 60 }; // 鋳込み：適温を 30 秒保つとたまり、精錬 60 秒ぶんをまとめて受け取る

// 改良（1 回きり）
const FURNACE_TIERS = [{ own: 10, cost: 200 }, { own: 50, cost: 30000 }, { own: 150, cost: 3e7 }];
const CAST_TIERS = [{ n: 5, cost: 5000 }, { n: 50, cost: 5e6 }, { n: 500, cost: 5e9 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'alloypower');
const metal = (s) => METALS[s.metal] || METALS[0];
const lo = (s) => metal(s).lo;
const hi = (s) => metal(s).hi + 2 * lvl(s, 'brick') + 2 * treeLvl(s, 'wideband');
const castNeed = (s) => CAST.need * 0.9 ** treeLvl(s, 'castfast');
const castSec = (s) => CAST.sec * (1 + 0.5 * treeLvl(s, 'castpower'));

// 温度ごとの精錬効率
function eff(s, heat) {
  const a = lo(s);
  if (heat < a - 30) return 0;
  if (heat < a) return (heat - (a - 30)) / 30;
  if (heat <= hi(s)) return 2;
  if (heat <= hi(s) + 15) return 0.5;
  return 0;
}

// 実際に働く送風量。温度調節器があれば適温帯の中央を狙う
function blow(s) {
  const max = lvl(s, 'blower');
  if (lvl(s, 'thermo')) return Math.min(max, (K * (lo(s) + hi(s))) / 2);
  return Math.min(s.blow, max);
}

function base(s, ctx) {
  const n = lvl(s, 'furnace');
  return N(n * milestoneMult(n) * 2 ** count(s, 'furnace_t', FURNACE_TIERS.length) * 2 ** count(s, 'cast_t', CAST_TIERS.length) * metal(s).value)
    .mul(Num.pow(1.2, lvl(s, 'purity'))).mul(Num.pow(1.15, treeLvl(s, 'foundry'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
}

// たまった鋳込みを受け取る
function cast(s, ctx) {
  if (s.cast < castNeed(s)) return null;
  s.cast = 0;
  s.stats.casts = (s.stats.casts || 0) + 1;
  const got = base(s, ctx).mul(2 * castSec(s));
  earn(s, got);
  return got;
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('smeltery.up.furnace.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'smeltery',
  kind: 'fusion',
  parents: ['clicker', 'mining'],
  icon: '🔥',
  ppPer,
  keep: ['metal'],

  // 炉 1 基を持って生まれる（転生後もここから）。cast は適温を保った秒数
  newState: () => ({ ...baseState(), up: { furnace: 1 }, heat: 0, blow: 0, metal: 0, cast: 0 }),

  upgrades: [
    { id: 'furnace', base: 10, r: 1.15, gen: true, val: (s, ctx) => fmt(base(s, ctx), 1) },
    {
      id: 'blower', base: 40, r: 1.9, max: 14, val: (s) => String(lvl(s, 'blower')),
      // 自動購入は、温度調節器がないうちは熱しすぎになる段階まで買わない
      autoSkip: (s) => lvl(s, 'blower') >= Math.floor((K * (lo(s) + hi(s))) / 2) && !lvl(s, 'thermo'),
    },
    { id: 'purity', base: 200, r: 1.55 },
    { id: 'brick', base: 300, r: 1.8, max: 10, val: (s) => String(hi(s) * 10) },
    { id: 'thermo', base: 5000, r: 1, max: 1, show: (s) => lvl(s, 'blower') >= 3 },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('furnace_t', FURNACE_TIERS, 'c.tier.n', 'smeltery.tier.furnace', (s, tier) => lvl(s, 'furnace') >= tier.own),
    ...tierUp('cast_t', CAST_TIERS, 'smeltery.casttier.n', 'smeltery.tier.cast', (s, tier) => (s.stats.casts || 0) >= tier.n),
  ],

  // 合金で買う、消えない強化
  tree: [
    { id: 'start', base: 2, r: 3, max: 4 },
    { id: 'castfast', base: 3, r: 2.5, max: 5 },
    { id: 'castpower', base: 5, r: 2.5, max: 5 },
    { id: 'autocast', base: 40, max: 1, req: { castfast: 2 } },
    { id: 'wideband', base: 5, r: 3, max: 5 },
    { id: 'alloypower', base: 20, r: 4, max: 5 },
    // 先の長い枝
    { id: 'foundry', base: 100, r: 2, max: 20, req: { alloypower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[1, 10, 100, 1000].map((v) => ({ id: `casts${v}`, type: 'casts', v, done: (s) => (s.stats.casts || 0) >= v })),
    ...[600, 3600, 36000].map((v) => ({ id: `perfect${v}`, type: 'perfect', v: v / 60, done: (s) => (s.stats.perfect || 0) >= v })),
    { id: 'metals', type: 'metals', v: METALS.length, done: (s) => METALS.every((m) => s.stats[`metal_${m.id}`]) },
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'furnaces', v, done: (s) => lvl(s, 'furnace') >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「火種」のぶんの炉を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.furnace = Math.max(lvl(s, 'furnace'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    const eq = blow(s) / K; // 送風と放熱が釣り合う温度
    // 直近は細かく追い、長い経過の残りは釣り合い温度での効率で集計する
    const fine = Math.min(dt, 20);
    const n = Math.max(1, Math.ceil(fine / 0.25));
    const step = fine / n;
    let sum = 0;
    let perfect = 0;
    for (let i = 0; i < n; i++) {
      s.heat = eq + (s.heat - eq) * Math.exp(-K * step);
      const e = eff(s, s.heat);
      sum += e * step;
      if (e === 2) perfect += step;
    }
    if (dt > fine) {
      s.heat = eq;
      const e = eff(s, eq);
      sum += e * (dt - fine);
      if (e === 2) perfect += dt - fine;
    }
    if (sum > 0) {
      earn(s, base(s, ctx).mul(sum));
      s.stats[`metal_${metal(s).id}`] = 1;
    }
    // 鋳込み：適温を保った時間がたまる。受け取るまでは満杯のまま待つ
    s.stats.perfect = (s.stats.perfect || 0) + perfect;
    s.cast += perfect;
    if (treeLvl(s, 'autocast') > 0) {
      // 鋳込み係：たまるたびに受け取る。長い経過のあいだは続けて何度も受け取る
      const times = Math.floor(s.cast / castNeed(s));
      if (times > 0) {
        s.cast -= times * castNeed(s);
        s.stats.casts = (s.stats.casts || 0) + times;
        earn(s, base(s, ctx).mul(2 * castSec(s) * times));
      }
    } else {
      s.cast = Math.min(s.cast, castNeed(s));
    }
  },

  rate: (s, ctx) => base(s, ctx).mul(eff(s, s.heat)),

  // 送風量を最大で使っていたなら、買い足したぶんも回す（熱しすぎは自分で絞る）
  onBuy(s, u, k) {
    if (u.id === 'blower' && s.blow === lvl(s, 'blower') - k) s.blow += k;
  },

  // ふいごを踏む
  click(s) {
    s.clicks++;
    s.heat = Math.min(MAX, s.heat + 7);
  },

  cast,
  setMetal(s, i) {
    if (METALS[i] && s.life.gte(METALS[i].need)) s.metal = i;
  },

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(2.5e4).pow(0.3).floor();
  },

  // 絵：夜の精錬所。炉の火は温度で色が変わる。炉の数は煙突、送風機はふいご、耐火れんがは炉の縁、純度は延べ棒のつやに出る。
  mount(el, api) {
    const W = 480;
    const H = 240;
    const GY = 204; // 地面
    const { cv, g } = makeCanvas(W, H, 'scene');
    const zone = (cls) => h('i', { class: cls });
    const cold = zone('z-cold');
    const warm = zone('z-warm');
    const good = zone('z-good');
    const hot = zone('z-hot');
    const slag = zone('z-slag');
    const needle = h('b', { class: 'needle' });
    const gauge = h('div', { class: 'gauge' }, cold, warm, good, hot, slag, needle);
    const status = h('div', { class: 'depth' });
    const temp = h('div', { class: 'sub' });
    const chips = METALS.map((m, i) => {
      const label = h('span');
      return { m, i, label, chip: h('button', { class: 'chip', onclick: () => game.setMetal(api.s(), i) }, label) };
    });
    const bits = new Bits();
    let clock = 0;
    let pump = 0; // ふいごを踏んだ直後の縮み
    let seenCasts = -1;
    const bellows = h('button', { class: 'bigbtn fire' }, t('smeltery.bellows'));
    const doPump = () => {
      game.click(api.s());
      pump = 0.2;
      bits.add(160, GY - 40, 7, { color: [C.gold, C.amber, C.rose], speed: 90, up: 60, size: 5, life: 0.5, fx: 'spark' });
      se('bellows');
    };
    bellows.addEventListener('pointerdown', doPump);
    cv.addEventListener('pointerdown', doPump);
    const blowTxt = h('span', { class: 'blowtxt' });
    const set = (d) => () => {
      const s = api.s();
      s.blow = Math.max(0, Math.min(lvl(s, 'blower'), s.blow + d));
    };
    const ctrl = h('div', { class: 'blowctl' },
      h('button', { class: 'mini', onclick: set(-1) }, '−'), blowTxt, h('button', { class: 'mini', onclick: set(1) }, '＋'));
    const auto = h('div', { class: 'sub' }, t('smeltery.auto'));
    // 鋳込み
    const castTxt = h('div');
    const castBar = h('div', { class: 'bar wide' }, h('i'));
    const castBtn = h('button', { class: 'btn primary' }, t('smeltery.cast'));
    const castBox = h('div', { class: 'orderbox' }, castTxt, castBar, castBtn);
    const wrap = h('div', { class: 'playbox' }, status, h('div', { class: 'row wrap center' }, chips.map((x) => x.chip)), cv, gauge, temp, bellows, ctrl, auto, castBox);
    castBtn.addEventListener('pointerdown', (ev) => {
      const got = cast(api.s(), api.ctx());
      if (got) {
        floatText(wrap, ev, `+${fmt(got, 1)}`, 'big');
        se('cast');
      }
    });
    el.append(wrap);

    const pct = (v) => `${(Math.max(0, v) / MAX) * 100}%`;
    const stateOf = (s) => {
      const a = lo(s);
      return s.heat < a - 30 ? 'cold' : s.heat < a ? 'warm' : s.heat <= hi(s) ? 'good' : eff(s, s.heat) > 0 ? 'hot' : 'slag';
    };
    const METAL_COLOR = { iron: '#9aa6cf', bronze: '#d9964e', steel: '#d6e2ff' };
    const FIRE = { cold: ['#4b5682', '#2a3566'], warm: ['#f2a65a', '#c4503a'], good: ['#fbeebe', '#f2a65a'], hot: ['#ffffff', '#ff6a3a'], slag: ['#e8637f', '#3a1f3a'] };

    return {
      update() {
        const s = api.s();
        const a = lo(s);
        const top = hi(s);
        cold.style.width = pct(a - 30);
        warm.style.width = pct(30);
        good.style.width = pct(top - a);
        hot.style.width = pct(Math.min(15, MAX - top));
        slag.style.width = pct(MAX - top - 15);
        needle.style.left = pct(Math.min(MAX, s.heat));
        const e = eff(s, s.heat);
        const key = stateOf(s);
        setText(status, t(`smeltery.st.${key}`));
        status.dataset.st = key;
        setText(temp, t('smeltery.temp', { v: Math.round(s.heat * 10), e: fmt(e, 2) }));
        const hasBlower = lvl(s, 'blower') > 0;
        const thermo = lvl(s, 'thermo') > 0;
        ctrl.hidden = !hasBlower || thermo;
        auto.hidden = !thermo;
        setText(blowTxt, t('smeltery.blow', { v: Math.min(s.blow, lvl(s, 'blower')), max: lvl(s, 'blower') }));
        for (const x of chips) {
          const open = s.life.gte(x.m.need);
          x.chip.disabled = !open;
          x.chip.classList.toggle('on', x.i === s.metal);
          setText(x.label, open ? t('smeltery.metal', { n: t(`smeltery.metal.${x.m.id}`), v: x.m.value, t: x.m.lo * 10 }) : t('farm.cropLocked', { v: fmt(x.m.need) }));
        }
        const full = s.cast >= castNeed(s);
        const autoCast = treeLvl(s, 'autocast') > 0;
        setText(castTxt, autoCast ? t('smeltery.castAuto') : full ? t('smeltery.castReady', { v: fmt(base(s, api.ctx()).mul(2 * castSec(s)), 1) }) : t('smeltery.castFill'));
        castBar.firstChild.style.width = `${Math.min(100, (s.cast / castNeed(s)) * 100)}%`;
        castBtn.hidden = autoCast || !full;
        castBox.classList.toggle('active', full && !autoCast);
      },
      frame(dt) {
        clock += dt;
        pump = Math.max(0, pump - dt);
        const s = api.s();
        const st = stateOf(s);
        const e = eff(s, s.heat);
        const k = Math.min(1, s.heat / MAX);
        const mcol = METAL_COLOR[metal(s).id];
        const [f1, f2] = FIRE[st];
        // 絵は 2 通り：素材を使う描き方（smeltery_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('smeltery') && smelteryArtReady()) {
          const nf = lvl(s, 'furnace');
          const at = drawSmeltery(g, {
            W, H, GY, clock, st, e, k, f1, f2, heat: s.heat, metal: metal(s).id, label: fmt(nf),
            stacks: tier(nf, 5), ftier: count(s, 'furnace_t', FURNACE_TIERS.length), brick: lvl(s, 'brick'), thermo: lvl(s, 'thermo') > 0,
            blowing: blow(s), blower: lvl(s, 'blower'), fans: Math.max(1, Math.min(3, Math.ceil(lvl(s, 'blower') / 5))), pump,
            give: lvl(s, 'giveback'), pure: Math.min(1, lvl(s, 'purity') / 25), cast: s.cast / castNeed(s),
            ctier: count(s, 'cast_t', CAST_TIERS.length), pile: Math.min(15, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0)),
          });
          const done = s.stats.casts || 0;
          if (seenCasts >= 0 && done > seenCasts) {
            bits.add(at.cruc[0], at.cruc[1], 26, { color: [C.amber, C.goldLight, mcol], speed: 170, up: 110, size: 3.4, glow: true });
            bits.add(at.cruc[0], at.cruc[1], 8, { color: mcol, size: 4, speed: 60, life: 0.7, to: at.rack });
          }
          seenCasts = done;
          bits.draw(g, dt);
          return;
        }
        stage(g, W, H, { top: '#1a2c7c', bottom: '#0d1640', horizon: GY, floor: '#0e1846', floorEnd: C.ink, stars: 16, t: clock });
        // 炉：基数が増えるほど煙突が並び、改良で金の帯が付く
        const n = lvl(s, 'furnace');
        const stacks = tier(n, 5);
        const ftier = count(s, 'furnace_t', FURNACE_TIERS.length);
        const FX = 150;
        const FW = 136;
        const FH = 124;
        for (let i = 0; i < stacks; i++) {
          const x = stacks === 1 ? FX + FW / 2 - 8 : FX + 14 + (i * (FW - 44)) / (stacks - 1);
          rr(g, x, GY - FH - 30, 16, 80, 2, lin(g, x, 0, x + 16, 0, '#4a557d', '#232c55'));
          for (let j = 0; j < ftier; j++) rr(g, x, GY - FH - 24 + j * 5, 16, 2, 0, C.gold);
          // 煙（熱しすぎは赤黒い）
          if (s.heat > 10) {
            for (let j = 0; j < 3; j++) smoke(g, x + 8, GY - FH - 34, (clock * 0.4 + j / 3 + i * 0.17) % 1, { color: st === 'slag' ? C.rose : st === 'hot' ? C.amber : C.ice, rise: 36, size: 9, a: 0.4 });
          }
        }
        glow(g, FX + FW / 2, GY - 30, 150, f2, 0.18 + k * 0.3);
        g.fillStyle = lin(g, FX, GY - FH, FX + FW, GY, '#4a4f8a', '#1a2050');
        g.beginPath();
        g.moveTo(FX, GY);
        g.lineTo(FX, GY - FH + 40);
        g.quadraticCurveTo(FX + FW / 2, GY - FH - 30, FX + FW, GY - FH + 40);
        g.lineTo(FX + FW, GY);
        g.closePath();
        g.fill();
        // 耐火れんが：段が上がるほど、炉の縁に金の目地が増える
        const brick = lvl(s, 'brick');
        g.save();
        g.clip();
        for (let y = GY - 12, row = 0; y > GY - FH - 10; y -= 12, row++) {
          rr(g, FX, y, FW, 1, 0, row < brick ? alpha(C.gold, 0.75) : alpha(C.ink, 0.35));
          for (let x = FX + (row % 2 ? 12 : 24); x < FX + FW; x += 24) rr(g, x, y, 1, 12, 0, alpha(C.ink, 0.3));
        }
        g.restore();
        // 焚き口と炎（温度で大きさと色が変わる）
        g.fillStyle = '#050a1c';
        g.beginPath();
        g.moveTo(FX + 34, GY - 8);
        g.lineTo(FX + 34, GY - 44);
        g.quadraticCurveTo(FX + FW / 2, GY - 78, FX + FW - 34, GY - 44);
        g.lineTo(FX + FW - 34, GY - 8);
        g.closePath();
        g.fill();
        g.strokeStyle = alpha(C.gold, 0.7);
        g.lineWidth = 1.5;
        g.stroke();
        if (s.heat > 3) {
          const fh = 14 + k * 42;
          glow(g, FX + FW / 2, GY - 24, 50 + k * 30, f2, 0.6);
          // 火の粉
          for (let i = 0; i < 3; i++) {
            const u = (clock * 0.9 + i / 3) % 1;
            fx(g, 'spark', FX + FW / 2 + Math.sin(i * 2.1 + clock) * 14, GY - 30 - u * (30 + k * 30), 5 + k * 5, f1, { a: (1 - u) * k, add: true, rot: u * 3 });
          }
          for (let i = 0; i < 3; i++) {
            const w = [24, 16, 9][i] * (0.6 + k * 0.5);
            const fl = fh * [1, 0.72, 0.45][i] * (1 + Math.sin(clock * (9 + i * 3) + i) * 0.1);
            if (i === 2 && (st === 'cold' || st === 'slag')) continue;
            g.fillStyle = [f2, f1, '#ffffff'][i];
            g.beginPath();
            g.moveTo(FX + FW / 2 - w, GY - 10);
            g.quadraticCurveTo(FX + FW / 2 - w * 0.9, GY - 10 - fl * 0.6, FX + FW / 2 + Math.sin(clock * 7 + i) * 3, GY - 10 - fl);
            g.quadraticCurveTo(FX + FW / 2 + w * 0.9, GY - 10 - fl * 0.6, FX + FW / 2 + w, GY - 10);
            g.closePath();
            g.fill();
          }
        }
        tag(g, `×${fmt(n)}`, FX + FW / 2, GY - FH + 34, { size: 10 });
        // 温度調節器：炉の肩の文字盤。針がいまの温度
        if (lvl(s, 'thermo') > 0) {
          const tx = FX + FW - 22;
          const ty = GY - FH + 46;
          disc(g, tx, ty, 9, C.ink, C.gold, 1.4);
          const a = Math.PI * (0.8 + k * 1.4);
          line(g, [tx, ty, tx + Math.cos(a) * 6.5, ty + Math.sin(a) * 6.5], st === 'good' ? C.goldLight : C.rose, 1.6);
        }
        // ふいご（送風機の段だけ並び、送風量が多いほど速く動く）
        const blowing = blow(s);
        const fans = Math.max(1, Math.min(3, Math.ceil(lvl(s, 'blower') / 5)));
        for (let i = 0; i < fans; i++) {
          const sq = pump > 0 ? 0.45 : 0.75 + Math.sin(clock * (2 + blowing * 1.5) + i) * (blowing > 0 ? 0.2 : 0);
          const by = GY - 12 - i * 30;
          poly(g, [FX - 4, by - 4, FX - 58, by - 4 - 22 * sq, FX - 58, by + 6], lin(g, FX - 58, by - 26, FX, by + 6, '#d9a85a', '#7a5226'));
          for (let j = 1; j < 4; j++) line(g, [FX - 4 - j * 13.5, by - 4 - j * 5.5 * sq, FX - 4 - j * 13.5, by + j * 2.5 - 1], alpha(C.ink, 0.35), 1);
          rr(g, FX - 62, by - 6 - 22 * sq, 5, 14 + 22 * sq, 2, C.gold);
          if (blowing > 0 && Math.random() < dt * blowing) bits.add(FX - 2, by - 4, 1, { color: C.ice, speed: 60, angle: 0, spread: 0.5, gravity: 0, life: 0.3, size: 1.4 });
        }
        if (lvl(s, 'blower') > 0) tag(g, `Lv ${lvl(s, 'blower')}`, FX - 34, GY + 16, { size: 8.5 });
        // 還元：親のゲームへ返す管が、左へ伸びる
        const give = lvl(s, 'giveback');
        if (give > 0) {
          rr(g, 8, GY - 84, 82, 6, 3, lin(g, 0, GY - 84, 0, GY - 78, C.steel, C.steelDark));
          for (let i = 0; i < 4; i++) disc(g, 84 - ((clock * 30 + i * 21) % 80), GY - 81, 1.8, C.goldLight);
          tag(g, `Lv ${give}`, 48, GY - 98, { size: 8.5 });
        }
        // 湯：精錬できているあいだ、炉から鋳型へ流れる。純度が上がるほど白く輝く
        const pure = Math.min(1, lvl(s, 'purity') / 25);
        const SXp = FX + FW;
        if (e > 0) {
          g.strokeStyle = mix(st === 'hot' ? '#ff6a3a' : C.amber, '#ffffff', pure * 0.6);
          g.lineWidth = 2 + e * 2.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(SXp, GY - 34);
          g.lineTo(SXp + 22, GY - 30);
          g.quadraticCurveTo(SXp + 30, GY - 28, SXp + 30, GY - 12);
          g.stroke();
          glow(g, SXp + 28, GY - 20, 22, C.amber, 0.5);
          if (Math.random() < dt * 14) bits.add(SXp + 30, GY - 12, 1, { color: [C.amber, C.goldLight], speed: 50, up: 40, size: 1.8, life: 0.35, glow: true });
        }
        rr(g, SXp + 12, GY - 12, 38, 14, 3, lin(g, 0, GY - 12, 0, GY + 2, C.steel, C.steelDark));
        // 鋳込みのたまり具合（るつぼが光っていく）。鋳込みの改良で、るつぼに金の縁が付く
        const c = Math.min(1, s.cast / castNeed(s));
        const ct = count(s, 'cast_t', CAST_TIERS.length);
        rr(g, SXp + 62, GY - 34, 34, 34, 7, '#141c40', ct > 0 ? C.gold : alpha(C.ice, 0.35), 1 + ct * 0.5);
        g.save();
        g.beginPath();
        g.roundRect(SXp + 65, GY - 31, 28, 28, 5);
        g.clip();
        g.fillStyle = c >= 1 ? '#fff6d6' : lin(g, 0, GY - 31, 0, GY - 3, C.goldLight, C.amber);
        g.fillRect(SXp + 65, GY - 3 - 28 * c, 28, 28 * c);
        g.restore();
        if (c >= 1) {
          glow(g, SXp + 79, GY - 17, 34, C.gold, 0.5 + 0.2 * Math.sin(clock * 5));
          sparkle(g, SXp + 92, GY - 34, 6, '#ffffff');
        }
        // 延べ棒の山：稼ぐほど積み上がる
        const pile = Math.min(21, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0));
        rr(g, W - 140, GY - 52, 128, 4, 2, alpha(C.gold, 0.7));
        rr(g, W - 130, GY - 48, 3, 48, 0, alpha(C.gold, 0.4));
        rr(g, W - 25, GY - 48, 3, 48, 0, alpha(C.gold, 0.4));
        let placed = 0;
        for (let row = 0; placed < pile; row++) {
          const cols = Math.max(1, 6 - row);
          for (let col = 0; col < cols && placed < pile; col++, placed++) {
            const x = W - 134 + col * 19 + row * 9.5;
            const y = GY - 62 - row * 10;
            poly(g, [x + 3, y, x + 15, y, x + 18, y + 9, x, y + 9], lin(g, x, y, x + 18, y + 9, mix(mcol, '#ffffff', 0.4 + pure * 0.4), mix(mcol, C.ink, 0.4)));
            if (pure > 0 && (placed + Math.floor(clock * 2)) % 7 === 0) sparkle(g, x + 13, y + 1, 3, '#ffffff', 0.9);
          }
        }
        // 鋳込みを受け取った瞬間
        const casts = s.stats.casts || 0;
        if (seenCasts >= 0 && casts > seenCasts) {
          bits.add(SXp + 79, GY - 30, 26, { color: [C.amber, C.goldLight, mcol], speed: 170, up: 110, size: 3.4, glow: true });
          bits.add(SXp + 79, GY - 30, 8, { color: mcol, size: 4, speed: 60, life: 0.7, to: [W - 75, GY - 70] });
        }
        seenCasts = casts;
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

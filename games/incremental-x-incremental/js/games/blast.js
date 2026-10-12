// 融合ゲーム（採掘 × ブロック崩し）：発破場。火薬をためて起爆する。
// 実入りは火薬量が多いほど大きく伸びるが、満杯に近づくほどたまりにくい。「どこで起爆するか」を決める遊び。
// 火薬の種類で伸び方とたまり方が変わり、いちばん稼げる起爆の頃合いも変わる。
// 満杯起爆のおまけ、導火線の改良、雷管で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, poly, tag, glow, gem, sparkle, fx, stage, Bits, tier, calm, artOn } from '../ui/draw.js';
import { blastArtReady, drawBlast, endBlast } from './blast_art.js';

const CAP = 100;
// 火薬の種類。p は実入りが火薬量の何乗で伸びるか、fill はたまる速さ、value は値打ち、need は解放に要る累計
const POWDERS = [
  { id: 'black', p: 2, fill: 1, value: 1, need: 0 },
  { id: 'quick', p: 1, fill: 2.5, value: 0.6, need: 2000 },
  { id: 'tnt', p: 3, fill: 0.7, value: 2.5, need: 1e6 },
];
const FULL_AT = 95; // これ以上ためて起爆すると「満杯起爆」

// 改良（1 回きり）
const FUSE_TIERS = [{ own: 10, cost: 300 }, { own: 50, cost: 45000 }, { own: 150, cost: 4.5e7 }];
const BLAST_TIERS = [{ n: 50, cost: 5000 }, { n: 500, cost: 5e5 }, { n: 5000, cost: 5e7 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'detpower');
const powder = (s) => POWDERS[s.powder] || POWDERS[0];
// 火薬量は数値のまま扱えるよう、容量の伸びは倍率（Num）に分けて実入りへ掛ける
const capMult = (s) => Num.pow(1.15, lvl(s, 'magazine'));
const fill = (s) => {
  const n = lvl(s, 'fuse');
  // 空のときに 1 秒でたまる量（容量 100 に対して）
  return 4 * n * milestoneMult(n) * 2 ** count(s, 'fuse_t', FUSE_TIERS.length) * powder(s).fill * (1 + 0.1 * treeLvl(s, 'quickfuse'));
};
const valMult = (s, ctx) => capMult(s).mul(Num.pow(1.15, lvl(s, 'yield'))).mul(2 ** count(s, 'blast_t', BLAST_TIERS.length))
  .mul(Num.pow(1.15, treeLvl(s, 'quarry'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
// 火薬量 c で起爆したときの実入り（倍率を掛ける前）
const power = (s, c) => powder(s).value * 100 * (c / CAP) ** powder(s).p * (c >= FULL_AT ? 1 + 0.25 * treeLvl(s, 'fullbonus') : 1);
const payout = (s, ctx, c) => valMult(s, ctx).mul(power(s, c));
const hasAuto = (s) => lvl(s, 'auto') > 0;
// c から目標量までたまる時間。たまり方は dc/dt = fill × (1 - c / 容量)
const timeTo = (s, c, target) => (CAP / fill(s)) * Math.log((CAP - c) / (CAP - target));
// 1 秒あたりがいちばん多くなる起爆の火薬量（%）
function bestAt(s) {
  let best = 10;
  let top = -1;
  for (let f = 10; f <= 99; f++) {
    const v = power(s, f) / timeTo(s, 0, f);
    if (v > top) { top = v; best = f; }
  }
  return best;
}
const target = (s) => (treeLvl(s, 'autotune') > 0 ? bestAt(s) : Math.min(99, Math.max(10, s.at)));

function blast(s, ctx) {
  if (s.charge < 1) return null;
  const got = payout(s, ctx, s.charge);
  earn(s, got);
  s.stats.blasts = (s.stats.blasts || 0) + 1;
  if (s.charge >= 99) s.stats.full = (s.stats.full || 0) + 1;
  s.stats[`powder_${powder(s).id}`] = 1;
  s.charge = 0;
  s.blasts++;
  return got;
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('blast.up.fuse.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'blast',
  kind: 'fusion',
  parents: ['mining', 'breakout'],
  icon: '🧨',
  ppPer,
  keep: ['at', 'powder'],

  // 導火線 1 本を持って生まれる。at は自動起爆する火薬量（%）
  newState: () => ({ ...baseState(), up: { fuse: 1 }, charge: 0, at: 70, blasts: 0, powder: 0 }),

  upgrades: [
    { id: 'fuse', base: 15, r: 1.15, gen: true, val: (s) => fmt(fill(s), 1) },
    { id: 'magazine', base: 60, r: 1.8, val: (s) => fmt(capMult(s).mul(CAP)) },
    { id: 'yield', base: 150, r: 1.9 },
    { id: 'auto', base: 1500, r: 1, max: 1, show: (s) => s.blasts >= 3 || s.amt.gte(1500) },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('fuse_t', FUSE_TIERS, 'c.tier.n', 'blast.tier.fuse', (s, tier) => lvl(s, 'fuse') >= tier.own),
    ...tierUp('blast_t', BLAST_TIERS, 'blast.blasttier.n', 'blast.tier.blast', (s, tier) => (s.stats.blasts || 0) >= tier.n),
  ],

  // 雷管で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'quickfuse', base: 2, r: 2.5, max: 5 },
    { id: 'fullbonus', base: 3, r: 2.5, max: 5 },
    { id: 'autotune', base: 15, max: 1, req: { quickfuse: 2 } },
    { id: 'detpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'quarry', base: 20, r: 1.7, max: 20, req: { detpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[10, 100, 1000, 10000].map((v) => ({ id: `blasts${v}`, type: 'blasts', v, done: (s) => (s.stats.blasts || 0) >= v })),
    ...[1, 100].map((v) => ({ id: `full${v}`, type: 'fullblast', v, done: (s) => (s.stats.full || 0) >= v })),
    { id: 'powders', type: 'powders', v: POWDERS.length, done: (s) => POWDERS.every((p) => s.stats[`powder_${p.id}`]) },
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'fuses', v, done: (s) => lvl(s, 'fuse') >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「仕込み」のぶんの導火線を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.fuse = Math.max(lvl(s, 'fuse'), n);
  },

  tick(s, dt, ctx) {
    const f = fill(s);
    if (!hasAuto(s)) {
      // 手動のあいだは、たまるだけ（起爆しないと実入りはない）
      s.charge = CAP - (CAP - s.charge) * Math.exp((-f * dt) / CAP);
      return;
    }
    const at = target(s);
    // 最初の 1 回は、いまたまっているぶんで起爆する
    const need = s.charge >= at ? 0 : timeTo(s, s.charge, at);
    if (need > dt) {
      s.charge = CAP - (CAP - s.charge) * Math.exp((-f * dt) / CAP);
      return;
    }
    dt -= need;
    s.charge = Math.max(s.charge, at);
    blast(s, ctx);
    // 残りは同じ周の繰り返しなので、回数を数えてまとめて受け取る（1 回ずつ回すと、たまるのが速い後半に重くなる）
    const cycle = timeTo(s, 0, at);
    const n = Math.floor(dt / cycle);
    if (n > 0) {
      earn(s, payout(s, ctx, at).mul(n));
      s.blasts += n;
      s.stats.blasts = (s.stats.blasts || 0) + n;
      if (at >= 99) s.stats.full = (s.stats.full || 0) + n;
      dt -= n * cycle;
    }
    s.charge = CAP - CAP * Math.exp((-f * dt) / CAP);
  },

  rate(s, ctx) {
    if (!hasAuto(s)) return ZERO;
    const at = target(s);
    return payout(s, ctx, at).div(timeTo(s, 0, at));
  },

  // 手で火薬を詰める
  click(s) {
    s.clicks++;
    s.charge = Math.min(CAP, s.charge + 3);
  },

  blast,
  bestAt,
  setPowder(s, i) {
    if (i === s.powder || !POWDERS[i] || !s.life.gte(POWDERS[i].need)) return;
    s.powder = i;
    s.charge = 0; // 詰め替えるので、ためたぶんは捨てる
  },

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(1e5).pow(0.2).floor();
  },

  // 絵：夜の採石場。岩壁の穴に火薬を詰め、起爆装置で吹き飛ばす。導火線、火薬庫、収量、自動起爆が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 240;
    const GY = 204; // 地面
    const CX = 262; // 岩壁の左端
    const HOLES = 10;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const mark = h('b', { class: 'needle auto' });
    const bar = h('div', { class: 'gauge charge' }, h('i', { class: 'z-good' }), mark);
    const status = h('div', { class: 'depth' });
    const preview = h('div', { class: 'sub' });
    const chips = POWDERS.map((p, i) => {
      const label = h('span');
      return { p, i, label, chip: h('button', { class: 'chip', onclick: () => game.setPowder(api.s(), i) }, label) };
    });
    const pack = h('button', { class: 'bigbtn' }, t('blast.pack'));
    const fire = h('button', { class: 'bigbtn fire' }, t('blast.fire'));
    const atTxt = h('span', { class: 'blowtxt' });
    const setAt = (d) => () => {
      const s = api.s();
      s.at = Math.max(10, Math.min(95, s.at + d));
    };
    const minus = h('button', { class: 'mini', onclick: setAt(-5) }, '−');
    const plus = h('button', { class: 'mini', onclick: setAt(5) }, '＋');
    const ctrl = h('div', { class: 'blowctl' }, minus, atTxt, plus);
    const wrap = h('div', { class: 'playbox' }, status, h('div', { class: 'row wrap center' }, chips.map((x) => x.chip)), cv, bar, preview, h('div', { class: 'row' }, pack, fire), ctrl);
    const bits = new Bits();
    let clock = 0;
    let seen = -1;
    let boom = 0; // 起爆の直後（揺れと閃光）
    let size = 0; // 直前の起爆の大きさ（0〜1）
    let last = 0; // 直前に見た火薬量
    let press = 0;
    const doPack = () => {
      game.click(api.s());
      press = 0.15;
      se('tamp');
    };
    pack.addEventListener('pointerdown', doPack);
    cv.addEventListener('pointerdown', doPack);
    fire.addEventListener('pointerdown', (ev) => {
      const got = blast(api.s(), api.ctx());
      if (got) {
        floatText(wrap, ev, '+' + fmt(got, 1));
        se('boom');
      }
    });
    el.append(wrap);

    const POWDER_COLOR = { black: '#8f9bc4', quick: '#e8637f', tnt: '#f2a65a' };
    const hole = (i) => [CX + 42 + (i % 5) * 33 + (i >= 5 ? 14 : 0), GY - 36 - Math.floor(i / 5) * 52];

    return {
      update() {
        const s = api.s();
        bar.firstChild.style.width = `${s.charge}%`;
        setText(status, t('blast.charge', { v: fmt(capMult(s).mul(s.charge)), max: fmt(capMult(s).mul(CAP)) }));
        setText(preview, t('blast.preview', { v: fmt(payout(s, api.ctx(), s.charge), 1) }));
        const auto = hasAuto(s);
        const tuned = treeLvl(s, 'autotune') > 0;
        ctrl.hidden = !auto;
        mark.hidden = !auto;
        minus.hidden = tuned;
        plus.hidden = tuned;
        mark.style.left = `${target(s)}%`;
        setText(atTxt, t(tuned ? 'blast.atTuned' : 'blast.at', { v: target(s) }));
        for (const x of chips) {
          const open = s.life.gte(x.p.need);
          x.chip.disabled = !open;
          x.chip.classList.toggle('on', x.i === s.powder);
          setText(x.label, open ? t(`blast.powder.${x.p.id}`) : t('farm.cropLocked', { v: fmt(x.p.need) }));
        }
      },
      frame(dt) {
        clock += dt;
        boom = Math.max(0, boom - dt);
        press = Math.max(0, press - dt);
        const s = api.s();
        const col = POWDER_COLOR[powder(s).id];
        const blasts = s.stats.blasts || 0;
        if (seen >= 0 && blasts > seen) {
          size = Math.max(0.15, last / CAP);
          boom = 0.45;
          bits.add(CX + 110, GY - 70, Math.round(14 + size * 60), { color: [C.steel, C.ice, C.amber, C.gold], speed: 120 + size * 220, up: 60 + size * 120, size: 2.6 + size * 3.4, life: 0.9 });
          bits.add(CX + 110, GY - 70, Math.round(4 + size * 8), { color: [C.steel, C.ice], speed: 40 + size * 60, up: 30, gravity: -20, size: 14 + size * 18, life: 1.3, fx: 'smoke' });
          bits.add(CX + 110, GY - 70, Math.round(3 + size * 6), { color: [C.amber, C.goldLight], speed: 60, gravity: 0, size: 12 + size * 16, life: 0.35, fx: 'spark' });
          bits.add(CX + 110, GY - 70, Math.round(6 + size * 10), { color: [C.gold, C.goldLight], size: 3.4, speed: 80, life: 0.8, to: [170, GY - 10], glow: true });
        }
        seen = blasts;
        last = s.charge;
        const filled = (s.charge / CAP) * HOLES;
        // 絵は 2 通り：素材を使う描き方（blast_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('blast') && blastArtReady()) {
          const nf = lvl(s, 'fuse');
          drawBlast(g, {
            W, H, GY, CX, HOLES, hole, clock, boom, size, press, col, filled, charge: s.charge,
            target: hasAuto(s) ? Math.ceil((target(s) / CAP) * HOLES) - 1 : -1, veins: Math.min(9, lvl(s, 'yield')),
            fuses: tier(nf, 5), fuseLabel: fmt(nf), fuseGold: count(s, 'fuse_t', FUSE_TIERS.length), spark: (clock * Math.min(3, 0.4 + fill(s) / 40)) % 1,
            kegs: Math.min(6, lvl(s, 'magazine')), magazine: lvl(s, 'magazine'), detGold: count(s, 'blast_t', BLAST_TIERS.length) > 0, auto: hasAuto(s),
            pile: Math.min(18, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0)),
          });
          bits.draw(g, dt);
          endBlast(g);
          if (boom > 0.2 && !calm()) {
            g.fillStyle = alpha('#fff6d6', (boom - 0.2) * 2.6 * (0.4 + size * 0.6));
            g.fillRect(0, 0, W, H);
          }
          return;
        }
        g.save();
        if (boom > 0 && !calm()) g.translate((Math.random() - 0.5) * boom * 18 * size, (Math.random() - 0.5) * boom * 18 * size);
        g.translate(-10, -10);
        stage(g, W + 20, H + 20, { top: '#1a2c7c', bottom: '#0d1640', horizon: GY + 10, floor: '#101c52', floorEnd: C.ink, stars: 22, t: clock });
        g.translate(10, 10);
        // 岩壁
        g.fillStyle = lin(g, CX, GY - 176, W, GY, '#4a557d', '#1a2050');
        g.beginPath();
        g.moveTo(CX, GY);
        g.lineTo(CX + 18, GY - 70);
        g.lineTo(CX + 8, GY - 120);
        g.lineTo(CX + 40, GY - 168);
        g.lineTo(W + 10, GY - 176);
        g.lineTo(W + 10, GY);
        g.closePath();
        g.fill();
        line(g, [CX, GY, CX + 18, GY - 70, CX + 8, GY - 120, CX + 40, GY - 168, W + 10, GY - 176], alpha(C.ice, 0.4), 1);
        line(g, [CX + 14, GY - 60, W, GY - 78], alpha(C.ink, 0.35), 1.2);
        line(g, [CX + 12, GY - 116, W, GY - 128], alpha(C.ink, 0.35), 1.2);
        // 収量：段が上がるほど、岩壁に金の鉱脈が増える
        const yl = Math.min(9, lvl(s, 'yield'));
        for (let i = 0; i < yl; i++) {
          const vx = CX + 34 + ((i * 83) % 170);
          const vy = GY - 158 + ((i * 47) % 130);
          gem(g, vx, vy, 4, C.gold);
          if ((i + Math.floor(clock * 2)) % 5 === 0) sparkle(g, vx + 3, vy - 3, 3.4, '#ffffff', 0.9);
        }
        // 穴：火薬がたまるほど埋まる。自動起爆の目印は、金の輪
        const at = hasAuto(s) ? Math.ceil((target(s) / CAP) * HOLES) - 1 : -1;
        for (let i = 0; i < HOLES; i++) {
          const [x, y] = hole(i);
          const k = Math.max(0, Math.min(1, filled - i));
          disc(g, x, y, 11, '#050a1c', i === at ? C.gold : alpha(C.ice, 0.3), i === at ? 2 : 1);
          if (k > 0) {
            if (k >= 1) glow(g, x, y, 18, col, 0.4);
            disc(g, x, y, 9 * Math.sqrt(k), lin(g, x - 9, y - 9, x + 9, y + 9, mix(col, '#ffffff', 0.4), mix(col, C.ink, 0.4)));
            if (k >= 1) disc(g, x - 3, y - 3, 2, alpha('#ffffff', 0.7));
          }
        }
        // 導火線：本数で数、改良で金の線になる
        const n = lvl(s, 'fuse');
        const lines = tier(n, 5);
        const ft = count(s, 'fuse_t', FUSE_TIERS.length);
        for (let i = 0; i < lines; i++) {
          g.strokeStyle = i < ft ? C.gold : alpha(C.ice, 0.6);
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(108, GY - 16);
          g.bezierCurveTo(160, GY - 4 - i * 5, 210, GY - 30 + i * 4, CX + 20, GY - 30 - i * 6);
          g.stroke();
        }
        const sp = (clock * Math.min(3, 0.4 + fill(s) / 40)) % 1;
        const sx = 108 + (CX - 88) * sp;
        const sy = GY - 16 - 14 * sp + Math.sin(sp * 6) * 4;
        glow(g, sx, sy, 10, C.amber, 0.8);
        sparkle(g, sx, sy, 4, C.goldLight);
        tag(g, `×${fmt(n)}`, 186, GY - 40, { size: 9.5 });
        // 火薬庫：段が上がるほど樽が積み上がる
        const mg = lvl(s, 'magazine');
        const kegs = Math.min(6, mg);
        for (let i = 0; i < kegs; i++) {
          const kx = 22 + (i % 3) * 16 + (i >= 3 ? 8 : 0);
          const ky = GY - 14 - Math.floor(i / 3) * 15;
          rr(g, kx - 7, ky - 7, 14, 15, 4, lin(g, kx - 7, 0, kx + 7, 0, '#a8763c', '#5a3a1a'));
          rr(g, kx - 7, ky - 3, 14, 1.6, 0, C.gold);
          rr(g, kx - 7, ky + 3, 14, 1.6, 0, C.gold);
        }
        if (mg > 0) tag(g, `Lv ${mg}`, 40, GY + 16, { size: 8.5 });
        // 起爆装置：発破の改良で金になり、自動起爆を付けるとアンテナが立つ
        const bt = count(s, 'blast_t', BLAST_TIERS.length);
        rr(g, 90, GY - 26, 36, 26, 4, lin(g, 0, GY - 26, 0, GY, bt > 0 ? C.gold : '#e8637f', bt > 0 ? C.goldDark : '#7a2440'));
        rr(g, 96, GY - 20, 24, 3, 1, alpha(C.ink, 0.4));
        const down = boom > 0 || press > 0 ? 9 : 0;
        rr(g, 106, GY - 44 + down, 4, 18 - down, 0, C.ice);
        rr(g, 94, GY - 48 + down, 28, 5, 2.5, C.ivory);
        if (hasAuto(s)) {
          line(g, [120, GY - 26, 120, GY - 46], C.ice, 1);
          const on = Math.floor(clock * 2) % 2 === 0;
          disc(g, 120, GY - 47, 2.4, on ? C.leaf : C.steelDark);
          if (on) glow(g, 120, GY - 47, 9, C.leaf, 0.7);
        }
        // 砕石の山：稼ぐほど積み上がる
        const pile = Math.min(18, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0));
        let placed = 0;
        for (let row = 0; placed < pile; row++) {
          const cols = Math.max(1, 6 - row);
          for (let c = 0; c < cols && placed < pile; c++, placed++) {
            const px = 146 + c * 15 + row * 7.5;
            const py = GY + 20 - row * 11;
            const pc = placed % 3 ? C.steel : C.gold;
            disc(g, px, py, 7.5, lin(g, px - 7, py - 7, px + 7, py + 7, mix(pc, '#ffffff', 0.35), mix(pc, C.ink, 0.5)));
          }
        }
        // 起爆の閃光
        if (boom > 0.25) fx(g, 'burst', CX + 110, GY - 70, 40 + size * 90, C.goldLight, { a: (boom - 0.25) * 5, add: true });
        bits.draw(g, dt);
        g.restore();
        if (boom > 0.2 && !calm()) {
          g.fillStyle = alpha('#fff6d6', (boom - 0.2) * 2.6 * (0.4 + size * 0.6));
          g.fillRect(0, 0, W, H);
        }
      },
    };
  },
};

export default game;

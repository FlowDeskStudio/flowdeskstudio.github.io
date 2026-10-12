// 融合ゲーム（工場 × ボール落とし）：市場。品物は倉庫にたまり続け、値段は波のように上下する。
// 高いときに売るほど儲かるが、倉庫がいっぱいになると、あふれたぶんは捨てることになる。
// 「いくら以上なら売るか」を決める遊び。高望みするほど 1 個の儲けは増えるが、売れない時間も延びる。
// 番頭（自動）、屋台の改良、のれんで伸ばす転生ツリー、実績を持つ。星を集めると実験できるようになる。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, lin, rr, disc, line, poly, text, tag, glow, coin, sparkle, Bits, tier, artOn } from '../ui/draw.js';
import { marketArtReady, marketBack, marketBell, marketStock, marketStreet } from './market_art.js';

const PERIOD = 40; // 値段の波がひと回りする秒数
const TAU = Math.PI * 2;

// 改良（1 回きり）
const STALL_TIERS = [{ own: 10, cost: 300 }, { own: 50, cost: 45000 }, { own: 150, cost: 4.5e7 }];
const SALE_TIERS = [{ n: 20, cost: 5000 }, { n: 200, cost: 5e5 }, { n: 2000, cost: 5e7 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'signpower');
const amp = (s) => Math.min(0.95, 0.5 + 0.04 * lvl(s, 'crier') + 0.03 * treeLvl(s, 'bigswing')); // 値段の振れ幅
const priceAt = (s, time) => 1 + amp(s) * Math.sin((time / PERIOD) * TAU);
const price = (s) => priceAt(s, s.time);
// 1 秒に入ってくる品物（倍率を掛ける前の個数）
const supply = (s) => {
  const n = lvl(s, 'stall');
  return n * milestoneMult(n) * 2 ** count(s, 'stall_t', STALL_TIERS.length);
};
const capSec = (s) => 15 + 4 * lvl(s, 'warehouse') + 5 * treeLvl(s, 'cellar'); // 倉庫に置ける量（何秒ぶんか）
const cap = (s) => supply(s) * capSec(s);
const valMult = (s, ctx) => Num.pow(1.2, lvl(s, 'haggle')).mul(2 ** count(s, 'sale_t', SALE_TIERS.length))
  .mul(Num.pow(1.15, treeLvl(s, 'guild'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const hasAuto = (s) => lvl(s, 'clerk') > 0;

// 「値段が th 以上なら売る」と決めたとき、波ひと回りで売れる量（個数 × 値段）
function cycleTake(s, th) {
  const a = amp(s);
  const k = (th - 1) / a;
  if (k <= -1) return supply(s) * PERIOD; // いつでも売る：平均の値段は 1
  if (k >= 1) return 0; // 届かない値段
  const win = Math.PI - 2 * Math.asin(k); // 売れる区間の広さ（ラジアン）
  const inWin = (win / TAU) * PERIOD; // 売れる秒数
  const meanIn = 1 + (a * 2 * Math.sqrt(1 - k * k)) / win; // 区間内の平均の値段
  // 区間の外でたまったぶんは、値段が th に届いた瞬間にまとめて売れる（倉庫からあふれたぶんは売れない）
  const stored = Math.min(supply(s) * (PERIOD - inWin), cap(s));
  return stored * th + supply(s) * inWin * meanIn;
}
// 1 秒あたりがいちばん多くなる売値
function bestAt(s) {
  let best = 1;
  let top = -1;
  for (let th = 1; th <= 1 + amp(s); th += 0.01) {
    const v = cycleTake(s, th);
    if (v > top) { top = v; best = th; }
  }
  return Math.round(best * 100) / 100;
}
const target = (s) => (treeLvl(s, 'eye') > 0 ? bestAt(s) : s.at / 100);

function sell(s, ctx) {
  if (s.stock <= 0) return null;
  const p = price(s);
  const got = valMult(s, ctx).mul(s.stock * p);
  earn(s, got);
  s.stock = 0;
  s.sales++;
  s.stats.sales = (s.stats.sales || 0) + 1;
  if (p >= 1 + amp(s) * 0.95) s.stats.peak = (s.stats.peak || 0) + 1;
  return got;
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('market.up.stall.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'market',
  kind: 'fusion',
  parents: ['factory', 'drop'],
  stars: 80,
  icon: '🏪',
  ppPer,
  keep: ['at'],

  // 屋台 1 つから始まる。time は値段の波の進み、stock は倉庫の品物（個数）、at は番頭が売る値段（%）
  newState: () => ({ ...baseState(), up: { stall: 1 }, time: 0, stock: 0, at: 120, sales: 0, selling: false }),

  upgrades: [
    { id: 'stall', base: 15, r: 1.15, gen: true, val: (s) => fmt(supply(s), 1) },
    { id: 'warehouse', base: 120, r: 2, max: 12, val: (s) => fmtTime(capSec(s)) },
    { id: 'haggle', base: 250, r: 1.5 },
    { id: 'crier', base: 400, r: 2.4, max: 8, val: (s) => Math.round(amp(s) * 100) },
    { id: 'clerk', base: 2500, r: 1, max: 1, show: (s) => s.sales >= 3 || s.amt.gte(2500) },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('stall_t', STALL_TIERS, 'c.tier.n', 'market.tier.stall', (s, tier) => lvl(s, 'stall') >= tier.own),
    ...tierUp('sale_t', SALE_TIERS, 'market.saletier.n', 'market.tier.sale', (s, tier) => (s.stats.sales || 0) >= tier.n),
  ],

  // のれんで買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'cellar', base: 2, r: 2.5, max: 5 },
    { id: 'bigswing', base: 3, r: 2.5, max: 5 },
    { id: 'eye', base: 15, max: 1, req: { bigswing: 2 } },
    { id: 'signpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'guild', base: 20, r: 1.7, max: 20, req: { signpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[10, 100, 1000, 10000].map((v) => ({ id: `sales${v}`, type: 'sales', v, done: (s) => (s.stats.sales || 0) >= v })),
    ...[1, 50].map((v) => ({ id: `peak${v}`, type: 'peak', v, done: (s) => (s.stats.peak || 0) >= v })),
    { id: 'spill', type: 'spill', v: 1, done: (s) => (s.stats.spill || 0) >= 1 },
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'stalls', v, done: (s) => lvl(s, 'stall') >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「常連」のぶんの屋台を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.stall = Math.max(lvl(s, 'stall'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    const v = valMult(s, ctx);
    if (hasAuto(s) && dt > 5) {
      // 長い経過：波ひと回りぶんの売上に、回った回数を掛けてまとめて受け取る
      const cycles = dt / PERIOD;
      earn(s, v.mul(cycleTake(s, target(s)) * cycles));
      s.sales += Math.floor(cycles);
      s.stats.sales = (s.stats.sales || 0) + Math.floor(cycles);
      s.time = (s.time + dt) % PERIOD;
      return;
    }
    // 短い刻み：品物がたまり、番頭がいれば売値に届いているあいだ売り続ける
    // 刻みの中で変わらない値は、先に求めておく（最適な売値の計算は重い）
    const steps = Math.max(1, Math.ceil(dt / 0.25));
    const step = dt / steps;
    const sup = supply(s);
    const room = cap(s);
    const auto = hasAuto(s);
    const th = auto ? target(s) : 0;
    for (let i = 0; i < steps; i++) {
      s.time = (s.time + step) % PERIOD;
      s.stock += sup * step;
      if (s.stock > room) {
        s.stock = room;
        s.stats.spill = 1;
      }
      if (auto && price(s) >= th && s.stock > 0) {
        const fresh = s.selling !== true;
        earn(s, v.mul(s.stock * price(s)));
        s.stock = 0;
        if (fresh) {
          s.sales++;
          s.stats.sales = (s.stats.sales || 0) + 1;
        }
        s.selling = true;
      } else if (price(s) < th) s.selling = false;
    }
  },

  rate: (s, ctx) => (hasAuto(s) ? valMult(s, ctx).mul(cycleTake(s, target(s)) / PERIOD) : ZERO),

  // 倉庫の品物を、いまの値段で全部売る
  click(s, ctx) {
    s.clicks++;
    return sell(s, ctx);
  },

  sell,
  bestAt,
  cycleTake,
  price,

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(1e5).pow(0.2).floor();
  },

  // 絵：夜の市場。値段の波を見ながら、高いところで売る。屋台、倉庫、値切り、呼び込み、番頭が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 250;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const status = h('div', { class: 'depth' });
    const preview = h('div', { class: 'sub' });
    const btn = h('button', { class: 'bigbtn' }, t('market.sell'));
    const atTxt = h('span', { class: 'blowtxt' });
    const setAt = (d) => () => {
      const s = api.s();
      s.at = Math.max(100, Math.min(195, s.at + d));
    };
    const minus = h('button', { class: 'mini', onclick: setAt(-5) }, '−');
    const plus = h('button', { class: 'mini', onclick: setAt(5) }, '＋');
    const ctrl = h('div', { class: 'blowctl' }, minus, atTxt, plus);
    const wrap = h('div', { class: 'playbox' }, status, cv, preview, btn, ctrl);
    const bits = new Bits();
    let seen = -1;
    let clock = 0;
    const act = (ev) => {
      const got = game.click(api.s(), api.ctx());
      if (got) {
        floatText(wrap, ev, '+' + fmt(got, 1));
        se('coins');
      }
    };
    btn.addEventListener('pointerdown', act);
    cv.addEventListener('pointerdown', act);
    el.append(wrap);

    const GX = 14;
    const GW = 316;
    const GT = 22;
    const GH = 136;
    const yOf = (p) => GT + GH - (p / 2) * GH;

    return {
      update() {
        const s = api.s();
        const p = price(s);
        setText(status, t('market.price', { v: Math.round(p * 100) }));
        status.dataset.st = p >= 1.2 ? 'good' : p < 0.8 ? 'hot' : '';
        setText(preview, t('market.preview', { v: fmt(valMult(s, api.ctx()).mul(s.stock * p), 1), n: fmt(s.stock), max: fmt(cap(s)) }));
        btn.disabled = s.stock <= 0;
        const auto = hasAuto(s);
        const tuned = treeLvl(s, 'eye') > 0;
        ctrl.hidden = !auto;
        minus.hidden = tuned;
        plus.hidden = tuned;
        setText(atTxt, t(tuned ? 'market.atTuned' : 'market.at', { v: Math.round(target(s) * 100) }));
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const p = price(s);
        const auto = hasAuto(s);
        const th = auto ? target(s) : 0;
        // 絵は 2 通り：まわりの物を素材で描く（market_art.js）か、図形だけの旧い描き方か。値段の板は、どちらも同じ
        const art = artOn('market') && marketArtReady();
        if (art) marketBack(g, { W, H });
        else {
          g.fillStyle = lin(g, 0, 0, 0, H, '#16267a', C.ink);
          g.fillRect(0, 0, W, H);
        }
        // 値段の板：横線が 100%、金の点線が番頭の売り値
        rr(g, GX, GT, GW, GH, 8, alpha(C.ink, 0.6), alpha(C.gold, 0.4), 1);
        for (let v = 0.5; v < 2; v += 0.5) rr(g, GX + 1, yOf(v), GW - 2, 1, 0, alpha(C.ice, v === 1 ? 0.3 : 0.1));
        text(g, '100%', GX + 6, yOf(1) - 4, 8.5, alpha(C.ice, 0.6), 'left', 600);
        if (auto) {
          g.strokeStyle = C.gold;
          g.lineWidth = 1.2;
          g.setLineDash([5, 4]);
          g.beginPath();
          g.moveTo(GX + 2, yOf(th));
          g.lineTo(GX + GW - 2, yOf(th));
          g.stroke();
          g.setLineDash([]);
        }
        const NOW = GX + GW * 0.6;
        const PXS = GW / (PERIOD * 1.5); // 1 秒あたりの幅
        const curve = (from, to) => {
          g.beginPath();
          for (let x = from; x <= to; x += 2) {
            const y = yOf(priceAt(s, s.time + (x - NOW) / PXS));
            if (x === from) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
        };
        // これまでの値動きは、下を淡く塗る
        g.save();
        g.beginPath();
        g.roundRect(GX + 1, GT + 1, GW - 2, GH - 2, 7);
        g.clip();
        curve(GX + 2, NOW);
        g.lineTo(NOW, GT + GH);
        g.lineTo(GX + 2, GT + GH);
        g.closePath();
        g.fillStyle = lin(g, 0, GT, 0, GT + GH, alpha(C.azure, 0.4), alpha(C.azure, 0));
        g.fill();
        g.restore();
        g.lineWidth = 2;
        g.lineJoin = 'round';
        g.strokeStyle = C.sky;
        curve(GX + 2, NOW);
        g.stroke();
        g.strokeStyle = alpha(C.sky, 0.35);
        g.setLineDash([3, 4]);
        curve(NOW, GX + GW - 2);
        g.stroke();
        g.setLineDash([]);
        rr(g, NOW - 0.5, GT + 2, 1, GH - 4, 0, alpha(C.ice, 0.2));
        const hot = auto && p >= th;
        glow(g, NOW, yOf(p), 18, hot || p >= 1.2 ? C.gold : C.azure, 0.7);
        disc(g, NOW, yOf(p), 5.5, hot || p >= 1.2 ? C.goldLight : C.ivory);
        tag(g, `${Math.round(p * 100)}%`, NOW, yOf(p) - 16, { size: 10 });
        // 呼び込み：鐘。段が上がるほど、値段の波が大きくなる
        const cr = lvl(s, 'crier');
        if (cr > 0 && art) marketBell(g, { x: GX + GW - 20, y: GT + 18, clock, rings: Math.min(3, Math.ceil(cr / 3)) });
        else if (cr > 0) {
          const bx = GX + GW - 20;
          const by = GT + 18;
          const sw = Math.sin(clock * 5) * 0.2;
          g.save();
          g.translate(bx, by - 8);
          g.rotate(sw);
          poly(g, [-7, 12, 7, 12, 4, 0, -4, 0], lin(g, -7, 0, 7, 12, C.goldLight, C.goldDark));
          disc(g, 0, 14, 1.8, C.goldLight);
          g.restore();
          for (let i = 0; i < Math.min(3, Math.ceil(cr / 3)); i++) {
            g.beginPath();
            g.arc(bx, by, 12 + i * 5 + ((clock * 8) % 5), Math.PI * 0.75, Math.PI * 1.25);
            g.strokeStyle = alpha(C.gold, 0.5 - i * 0.14);
            g.lineWidth = 1.2;
            g.stroke();
          }
        }
        // 倉庫：木箱の段。倉庫の段が上がるほど枠が増え、たまると金に、あふれそうだと赤くなる
        const k = Math.min(1, s.stock / Math.max(1e-9, cap(s)));
        const BX = GX + GW + 18;
        const BW = W - BX - 14;
        const cells = Math.min(10, 3 + lvl(s, 'warehouse'));
        if (art) {
          marketStock(g, { x: BX, y: GT, w: BW, h: GH, cells, k, label: t('market.stock') });
        } else {
          rr(g, BX, GT, BW, GH, 8, alpha(C.ink, 0.6), alpha(C.gold, 0.4), 1);
          const chh = (GH - 10) / cells;
          for (let i = 0; i < cells; i++) {
            const filled = k * cells - i;
            const y = GT + GH - 5 - (i + 1) * chh;
            rr(g, BX + 6, y + 1.5, BW - 12, chh - 3, 2.5, alpha(C.ice, 0.07));
            if (filled > 0) {
              g.globalAlpha = Math.min(1, filled);
              rr(g, BX + 6, y + 1.5, BW - 12, chh - 3, 2.5, k > 0.9 ? lin(g, 0, y, 0, y + chh, '#f08a9a', '#8a2a48') : lin(g, 0, y, 0, y + chh, C.goldLight, C.goldDark));
              rr(g, BX + BW / 2 - 1, y + 2.5, 2, chh - 5, 0, alpha(C.ink, 0.3));
              g.globalAlpha = 1;
            }
          }
          text(g, t('market.stock'), BX + BW / 2, GT - 7, 10, C.muted, 'center', 600);
        }
        // 屋台：数で並びが増え、改良でひさしが金になる
        const n = lvl(s, 'stall');
        const shown = tier(n, 9);
        const stt = count(s, 'stall_t', STALL_TIERS.length);
        const hg = Math.min(8, lvl(s, 'haggle'));
        if (art) {
          marketStreet(g, { W, H, shown, gold: stt * 3, label: fmt(n), hg, hgLabel: lvl(s, 'haggle') });
        } else {
          rr(g, 0, H - 22, W, 22, 0, lin(g, 0, H - 22, 0, H, '#141c40', C.ink));
          for (let i = 0; i < shown; i++) {
            const x = 30 + i * 36;
            const y = H - 22;
            rr(g, x - 12, y - 18, 24, 18, 2, lin(g, 0, y - 18, 0, y, '#2a3a8a', '#141f5c'));
            for (let j = 0; j < 4; j++) rr(g, x - 15 + j * 7.5, y - 30, 7.5, 9, j === 0 || j === 3 ? 2 : 0, j % 2 ? C.ivory : i < stt * 3 ? C.gold : i % 2 ? C.rose : C.azure);
            for (let j = 0; j < 3; j++) disc(g, x - 7 + j * 7, y - 14, 2.6, [C.leafLight, C.amber, C.gold][(i + j) % 3]);
            glow(g, x, y - 26, 16, C.goldLight, 0.18);
          }
          tag(g, `×${fmt(n)}`, 30 + shown * 36, H - 34, { size: 9.5, align: 'left' });
          // 値切り：屋台の端にコインの山。段が上がるほど高くなる
          for (let i = 0; i < hg; i++) coin(g, W - 30, H - 26 - i * 3.5, 9);
          if (hg > 0) tag(g, `Lv ${lvl(s, 'haggle')}`, W - 30, H - 46 - hg * 3.5, { size: 8.5 });
        }
        const sold = s.stats.sales || 0;
        if (seen >= 0 && sold > seen) {
          bits.add(BX + BW / 2, GT + GH - 10, 16, { color: [C.gold, C.goldLight, '#ffffff'], speed: 110, up: 80, size: 3, glow: true });
          sparkle(g, NOW, yOf(p), 16, '#ffffff');
        }
        seen = sold;
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

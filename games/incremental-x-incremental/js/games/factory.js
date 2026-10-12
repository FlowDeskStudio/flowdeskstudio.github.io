// 基本ゲーム4：工場。搬入 → 加工 → 組立の 3 工程が並び、いちばん遅い工程がライン全体の速さを決める。
// 「たくさん買う」ではなく「詰まっている工程を見つけて釣り合わせる」のが遊びの中心。
// 作るものを切り替えると工程ごとの重さが変わり、釣り合いを組み直すことになる。
// ときどき入る注文、工程ごとの改良、特許で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, poly, text, tag, glow, sparkle, stage, Bits } from '../ui/draw.js';
import { artWanted, artReady, drawFactory } from './factory_art.js';

const STAGES = [
  { id: 'intake', base: 10, glyph: 'box' },
  { id: 'process', base: 20, glyph: 'gear' },
  { id: 'assemble', base: 40, glyph: 'wrench' },
];
// 作るもの。per は機械 1 台が 1 秒に流せる数（工程順）、value は 1 個の値打ち、need は解放に要る累計
const PRODUCTS = [
  { id: 'crate', per: [3, 2, 1], value: 1, need: 0 },
  { id: 'tool', per: [3, 1, 0.5], value: 3, need: 50000 },
  { id: 'engine', per: [1.5, 0.75, 0.2], value: 10, need: 5e7 },
];
const TIERS = [{ own: 10, cost: 20 }, { own: 50, cost: 3000 }, { own: 150, cost: 3e6 }];
const ROMAN = ['I', 'II', 'III'];

// 注文：いまのラインでは少し届かない量を、期限までに作ると報酬が出る
const ORDER = { need: 100, limit: 90, reward: 2, wait: 30 };
const orderNeed = (s) => ORDER.need * 0.95 ** treeLvl(s, 'ordereasy'); // ラインの速さ何秒ぶんを求められるか
const orderReward = (s) => ORDER.reward * (1 + 0.25 * treeLvl(s, 'orderbonus'));

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'patentpower');
const product = (s) => PRODUCTS[s.product] || PRODUCTS[0];
const tierMult = (s, st) => 2 ** TIERS.reduce((a, _, i) => a + lvl(s, `${st.id}_t${i}`), 0);
const stageRate = (s, i) => {
  const st = STAGES[i];
  const n = lvl(s, st.id);
  return n * milestoneMult(n) * tierMult(s, st) * product(s).per[i];
};
const speed = (s) => Num.pow(1.2, lvl(s, 'conveyor')).mul(Num.pow(1.15, treeLvl(s, 'automation')));
const lineRate = (s) => N(Math.min(...STAGES.map((_, i) => stageRate(s, i)))).mul(speed(s)); // 毎秒の個数
const valMult = (s, ctx) => N(product(s).value).mul(Num.pow(1.15, lvl(s, 'quality'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const slowest = (s) => STAGES.reduce((a, _, i) => (stageRate(s, i) < stageRate(s, a) ? i : a), 0);
// 3 工程がほぼ釣り合っているか（実績用）
const balanced = (s) => {
  const r = STAGES.map((_, i) => stageRate(s, i));
  return STAGES.reduce((a, st) => a + lvl(s, st.id), 0) >= 30 && Math.max(...r) <= Math.min(...r) * 1.1;
};

// 作った個数を注文へ積み、期限と次の注文を進める
function runOrder(s, dt, made, ctx) {
  const o = s.order;
  if (o.left > 0) {
    o.got = o.got.add(made);
    o.left -= dt;
    if (o.got.gte(o.need)) {
      // 納品できた
      earn(s, o.need.mul(orderReward(s)).mul(valMult(s, ctx)));
      s.stats.orders = (s.stats.orders || 0) + 1;
      o.left = 0;
      o.wait = ORDER.wait;
      o.done = 3; // 「納品」を少しのあいだ表示する
    } else if (o.left <= 0) {
      o.left = 0;
      o.wait = ORDER.wait;
    }
    return;
  }
  o.done = Math.max(0, (o.done || 0) - dt);
  o.wait -= dt;
  if (o.wait <= 0 && lineRate(s).gt(0)) {
    o.need = lineRate(s).mul(orderNeed(s));
    o.got = ZERO;
    o.left = ORDER.limit;
  }
}

const game = {
  id: 'factory',
  kind: 'base',
  icon: '🏭',
  ppPer,
  keep: ['product'],
  unlock: { choice: true },

  // 各工程 1 台から始まる（転生後もここから）
  newState: () => ({
    ...baseState(), up: { intake: 1, process: 1, assemble: 1 }, product: 0,
    order: { need: ZERO, got: ZERO, left: 0, wait: 20, done: 0 },
  }),

  upgrades: [
    ...STAGES.map((st, i) => ({
      id: st.id, base: st.base, r: 1.15, gen: true,
      val: (s) => fmt(N(stageRate(s, i)).mul(speed(s)), 1),
    })),
    { id: 'conveyor', base: 500, r: 2 },
    { id: 'quality', base: 300, r: 2.2 },
    // 改良（1 回きり）
    ...STAGES.flatMap((st) => TIERS.map((tier, i) => ({
      id: `${st.id}_t${i}`,
      base: st.base * tier.cost,
      r: 1,
      max: 1,
      once: true,
      show: (s) => lvl(s, st.id) >= tier.own,
      name: (tr) => tr('c.tier.n', { g: tr(`factory.up.${st.id}.n`), k: ROMAN[i] }),
      desc: (tr) => tr('factory.tier.d', { g: tr(`factory.up.${st.id}.n`) }),
    }))),
  ],

  // 特許で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'discount', base: 2, r: 3, max: 6 },
    { id: 'ordereasy', base: 2, r: 2.5, max: 5 },
    { id: 'orderbonus', base: 3, r: 2.5, max: 5, req: { ordereasy: 1 } },
    { id: 'patentpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'automation', base: 20, r: 1.7, max: 20, req: { patentpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[1, 10, 50, 200].map((v) => ({ id: `orders${v}`, type: 'orders', v, done: (s) => (s.stats.orders || 0) >= v })),
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'own', v, done: (s) => Math.max(...STAGES.map((st) => lvl(s, st.id))) >= v })),
    { id: 'balance', type: 'balance', v: 30, done: balanced },
    { id: 'products', type: 'products', v: PRODUCTS.length, done: (s) => s.life.gte(PRODUCTS[PRODUCTS.length - 1].need) },
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 機械の割引（ツリー）
  costMult: (s, u) => (u.gen ? 0.95 ** treeLvl(s, 'discount') : 1),

  // 転生や総転生のあと：ツリー「立ち上げ」のぶんの機械を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) for (const st of STAGES) s.up[st.id] = Math.max(lvl(s, st.id), n);
  },

  tick(s, dt, ctx) {
    const made = lineRate(s).mul(dt);
    earn(s, made.mul(valMult(s, ctx)));
    if (dt <= 5) {
      runOrder(s, dt, made, ctx);
      return;
    }
    // 長い経過（オフラインなど）：手を出さなくても期限に間に合う注文だけ、こなした数でまとめて受け取る
    s.order.left = 0;
    const need = orderNeed(s);
    if (need <= ORDER.limit) {
      const cycles = dt / (need + ORDER.wait);
      earn(s, lineRate(s).mul(need * orderReward(s) * cycles).mul(valMult(s, ctx)));
      s.stats.orders = (s.stats.orders || 0) + Math.floor(cycles);
    }
  },

  rate: (s, ctx) => lineRate(s).mul(valMult(s, ctx)),

  // 手回し：ライン 0.25 秒ぶん（最低 1 個）を一気に流す。注文にも数える
  click(s, ctx) {
    s.clicks++;
    const made = lineRate(s).mul(0.25).max(1);
    const got = made.mul(valMult(s, ctx));
    earn(s, got);
    if (s.order.left > 0) runOrder(s, 0, made, ctx);
    return got;
  },

  unlockedProducts: (s) => PRODUCTS.filter((p) => s.life.gte(p.need)).length,

  setProduct(s, i) {
    if (i === s.product || !PRODUCTS[i] || !s.life.gte(PRODUCTS[i].need)) return;
    s.product = i;
    s.order.left = 0; // 作るものを変えたら、受けていた注文は流れる
  },

  prestigeTotal(s) {
    if (s.life.lt(1e6)) return ZERO;
    return s.life.div(1e6).pow(0.2).floor();
  },

  // 絵：夜の工場。3 つの機械をベルトがつなぐ。台数で機械が伸び、改良で金の印が付き、搬送と品質も絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 240;
    const BY = 156; // ベルトの上端
    const MX = [96, 208, 320]; // 機械の中心
    const MW = 64;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const out = h('div', { class: 'depth' });
    const chips = PRODUCTS.map((p, i) => {
      const label = h('span');
      return { p, i, label, chip: h('button', { class: 'chip', onclick: () => game.setProduct(api.s(), i) }, label) };
    });
    const orderTxt = h('div');
    const orderBar = h('div', { class: 'bar wide' }, h('i'));
    const orderBox = h('div', { class: 'orderbox' }, orderTxt, orderBar);
    const crank = h('button', { class: 'bigbtn' }, t('factory.crank'));
    const wrap = h('div', { class: 'playbox' }, out, h('div', { class: 'row wrap center' }, chips.map((x) => x.chip)), cv, orderBox, crank);
    const bits = new Bits();
    let clock = 0;
    let time = 0;
    let push = 0; // 手回しの勢い（少しのあいだベルトが速くなる）
    const doCrank = (ev) => {
      floatText(wrap, ev, '+' + fmt(game.click(api.s(), api.ctx()), 1));
      push = 0.3;
      bits.add(W - 100, BY - 6, 4, { color: [C.gold, C.goldLight], size: 3, speed: 50, life: 0.5, to: [W - 48, BY - 30], glow: true });
      se('crank');
    };
    crank.addEventListener('pointerdown', doCrank);
    cv.addEventListener('pointerdown', doCrank);
    el.append(wrap);

    const TINT = [C.amber, C.azure, C.violet];
    // 出荷する品：木箱、工具、エンジン
    const goods = (x, y, sz, kind, shine) => {
      if (kind === 1) {
        rr(g, x, y + sz * 0.3, sz, sz * 0.7, 2, lin(g, 0, y, 0, y + sz, C.rose, mix(C.rose, C.ink, 0.5)));
        rr(g, x + sz * 0.3, y + sz * 0.08, sz * 0.4, sz * 0.3, 2, null, C.ice, 1.4);
      } else if (kind === 2) {
        rr(g, x, y + sz * 0.2, sz, sz * 0.8, 3, lin(g, 0, y, 0, y + sz, C.ice, C.steelDark));
        disc(g, x + sz / 2, y + sz * 0.6, sz * 0.22, C.ink, C.gold, 1.2);
        rr(g, x + sz * 0.2, y, sz * 0.18, sz * 0.24, 1, C.steel);
        rr(g, x + sz * 0.62, y, sz * 0.18, sz * 0.24, 1, C.steel);
      } else {
        rr(g, x, y, sz, sz, 2, lin(g, 0, y, 0, y + sz, '#d9a85a', '#8a5f26'));
        rr(g, x + sz * 0.46, y + 1, sz * 0.08, sz - 2, 0, alpha(C.ink, 0.35));
        rr(g, x + 1, y + sz * 0.46, sz - 2, sz * 0.08, 0, alpha(C.ink, 0.35));
      }
      if (shine) sparkle(g, x + sz - 1, y + 1, 3.2, C.goldLight);
    };
    // ベルトの上の荷物。k は何番目の工程を出たか
    const item = (k, x, y, kind, shine) => {
      if (k >= 3) {
        goods(x - 8, y - 16, 16, kind, shine);
        return;
      }
      if (k === 0) rr(g, x - 5, y - 9, 10, 9, 2, lin(g, 0, y - 9, 0, y, '#b9905a', '#6a4a22'));
      else if (k === 1) rr(g, x - 5, y - 10, 10, 10, 2, lin(g, 0, y - 10, 0, y, C.goldLight, C.gold));
      else disc(g, x, y - 5.5, 5.5, lin(g, x - 5, y - 11, x + 5, y, C.ice, C.azure));
    };

    return {
      update() {
        const s = api.s();
        setText(out, t('factory.out', { v: fmt(lineRate(s), 1) }));
        for (const x of chips) {
          const open = s.life.gte(x.p.need);
          x.chip.disabled = !open;
          x.chip.classList.toggle('on', x.i === s.product);
          setText(x.label, open ? t('factory.product', { n: t(`factory.product.${x.p.id}`), v: x.p.value }) : t('farm.cropLocked', { v: fmt(x.p.need) }));
        }
        const o = s.order;
        if (o.left > 0) {
          setText(orderTxt, t('factory.order', { got: fmt(o.got), need: fmt(o.need), t: fmtTime(Math.ceil(o.left)), r: fmt(o.need.mul(orderReward(s)).mul(valMult(s, api.ctx())), 1) }));
          orderBar.firstChild.style.width = `${Math.min(100, o.got.div(o.need).toNumber() * 100)}%`;
        } else {
          setText(orderTxt, o.done > 0 ? t('factory.orderDone') : t('factory.orderWait'));
          orderBar.firstChild.style.width = o.done > 0 ? '100%' : '0%';
        }
        orderBox.classList.toggle('active', o.left > 0);
      },
      frame(dt) {
        // 絵は 2 通り：素材を使う新しい描き方（factory_art.js）と、図形だけの旧い描き方（この下）。
        // 素材が読めないとき、または localStorage の incxinc.factoryArt が 'classic' のときは旧い描き方になる。
        if (artWanted() && artReady()) {
          push = Math.max(0, push - dt);
          time += dt;
          const s = api.s();
          const lr = lineRate(s);
          const digits = lr.m > 0 ? Math.max(0, Math.log10(lr.m) + lr.e) : 0;
          clock += dt * (34 + Math.min(110, digits * 14)) * (push > 0 ? 2.2 : 1);
          const rates = STAGES.map((_, i) => stageRate(s, i));
          drawFactory(g, {
            W, H, MX, clock, time, rates, slow: slowest(s), even: rates.every((r) => r === rates[0]),
            conv: lvl(s, 'conveyor'), qual: lvl(s, 'quality'), product: s.product,
            counts: STAGES.map((st) => lvl(s, st.id)),
            tiers: STAGES.map((st) => TIERS.reduce((a, _, k) => a + lvl(s, `${st.id}_t${k}`), 0)),
            pile: Math.min(15, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0)),
            labels: {
              count: STAGES.map((st) => fmt(lvl(s, st.id))),
              rate: rates.map((r) => t('c.perSec', { v: fmt(N(r).mul(speed(s)), 1) })),
              name: STAGES.map((st) => t(`factory.up.${st.id}.n`)),
            },
          });
          bits.draw(g, dt);
          return;
        }
        push = Math.max(0, push - dt);
        time += dt;
        const s = api.s();
        const rates = STAGES.map((_, i) => stageRate(s, i));
        const slow = slowest(s);
        const even = rates.every((r) => r === rates[0]);
        const lr = lineRate(s);
        const digits = lr.m > 0 ? Math.max(0, Math.log10(lr.m) + lr.e) : 0;
        const conv = lvl(s, 'conveyor');
        const qual = lvl(s, 'quality');
        const v = (34 + Math.min(110, digits * 14)) * (push > 0 ? 2.2 : 1);
        clock += dt * v;
        // 壁（窓あかり）と床
        stage(g, W, H, { top: '#1a2c7c', bottom: '#101c52', horizon: BY + 14, floor: '#0e1846', floorEnd: C.ink });
        for (let i = 0; i < 5; i++) {
          rr(g, 22 + i * 96, 14, 54, 30, 3, alpha(C.azure, 0.1), alpha(C.ice, 0.16), 1);
          line(g, [49 + i * 96, 14, 49 + i * 96, 44], alpha(C.ice, 0.16), 1);
        }
        // ベルト：搬送の強化で、流れを示す矢が金になり本数も増える
        rr(g, 10, BY, W - 88, 13, 6.5, lin(g, 0, BY, 0, BY + 13, '#2a3566', '#141c40'), alpha(C.ice, 0.3), 1);
        const step = Math.max(8, 16 - conv * 0.6);
        g.strokeStyle = conv > 0 ? alpha(C.gold, 0.75) : alpha(C.ice, 0.35);
        g.lineWidth = 1.2;
        g.beginPath();
        for (let x = 18 + (clock % step); x < W - 86; x += step) {
          g.moveTo(x, BY + 3);
          g.lineTo(x + 4, BY + 6.5);
          g.lineTo(x, BY + 10);
        }
        g.stroke();
        for (let i = 0; i < 6; i++) disc(g, 22 + i * ((W - 112) / 5), BY + 18, 4, '#141c40', alpha(C.ice, 0.3), 1);
        if (conv > 0) tag(g, `Lv ${conv}`, 34, BY + 34, { size: 8.5 });
        // 荷物：詰まっている工程の手前は混み合い、その先はまばらになる
        const ends = [10, ...MX, W - 88];
        for (let k = 0; k < 4; k++) {
          const jam = !even && k <= slow && slow > 0;
          const gap = even ? 24 : jam ? 13 : 38;
          const off = (clock * (jam ? 0.3 : 1)) % gap;
          for (let x = ends[k] + off + (k ? MW / 2 : 4); x < ends[k + 1] - (k < 3 ? MW / 2 : 4); x += gap) item(k, x, BY, s.product, qual > 0);
        }
        // 詰まった工程の前にたまる山
        if (!even && slow > 0) {
          const ratio = Math.min(...rates.slice(0, slow)) / Math.max(1e-9, rates[slow]);
          const n = Math.min(10, Math.round(2 + 3 * Math.log2(ratio)));
          let placed = 0;
          for (let row = 0; placed < n; row++) {
            for (let col = 0; col < 4 - row && placed < n; col++, placed++) {
              item(slow, MX[slow] - MW / 2 - 8 - col * 11 - row * 5.5, BY - 10 - row * 10, s.product, false);
            }
          }
        }
        // 機械：台数が増えるほど背が伸び、改良のたびに金の帯が 1 本増える
        STAGES.forEach((st, i) => {
          const n = lvl(s, st.id);
          const hh = 46 + Math.min(46, Math.log2(n + 1) * 6);
          const x = MX[i] - MW / 2;
          const y = BY + 15 - hh;
          const isSlow = !even && i === slow;
          const col = TINT[i];
          rr(g, x, y, MW, hh, 8, lin(g, x, y, x + MW, y + hh, mix(col, '#ffffff', 0.12), mix(col, C.ink, 0.62)), isSlow ? C.rose : alpha(C.ice, 0.35), isSlow ? 2 : 1);
          const tiers = TIERS.reduce((a, _, k) => a + lvl(s, `${st.id}_t${k}`), 0);
          for (let k = 0; k < tiers; k++) rr(g, x + 6, y + hh - 34 - k * 4, MW - 12, 1.8, 1, C.gold);
          const cx = MX[i];
          const cy = y + 22;
          if (i === 0) {
            // 搬入：じょうご
            poly(g, [cx - 20, y - 12, cx + 20, y - 12, cx + 9, y + 2, cx - 9, y + 2], lin(g, 0, y - 12, 0, y + 2, C.ice, C.steel));
            item(0, cx, y - 12 + ((clock * 0.4) % 12), 0, false);
          } else if (i === 1) {
            // 加工：回る歯車
            const a = clock * 0.06;
            g.strokeStyle = C.ice;
            g.lineWidth = 3;
            g.lineCap = 'round';
            g.beginPath();
            for (let k = 0; k < 8; k++) {
              g.moveTo(cx + Math.cos(a + k * 0.785) * 10, cy + Math.sin(a + k * 0.785) * 10);
              g.lineTo(cx + Math.cos(a + k * 0.785) * 15, cy + Math.sin(a + k * 0.785) * 15);
            }
            g.stroke();
            disc(g, cx, cy, 11, lin(g, cx - 11, cy - 11, cx + 11, cy + 11, C.ice, C.steel));
            disc(g, cx, cy, 3.5, C.ink);
          } else {
            // 組立：上下するプレス
            const p = Math.abs(Math.sin(clock * 0.05)) * 10;
            rr(g, cx - 14, y + 8, 28, 26, 4, alpha(C.ink, 0.5), alpha(C.ice, 0.3), 1);
            rr(g, cx - 2, y + 9, 4, 6 + p, 0, C.steel);
            rr(g, cx - 9, y + 14 + p, 18, 5, 1.5, C.ice);
            if (p > 9) sparkle(g, cx, y + 30, 5, C.goldLight);
          }
          // 動いている印の灯り
          disc(g, x + MW - 9, y + 9, 2.4, isSlow ? C.rose : C.leaf);
          glow(g, x + MW - 9, y + 9, 8, isSlow ? C.rose : C.leaf, 0.6);
          tag(g, `×${fmt(n)}`, cx, y + hh - 16, { size: 10 });
          text(g, t('c.perSec', { v: fmt(N(rates[i]).mul(speed(s)), 1) }), cx, BY + 36, 10.5, isSlow ? C.rose : C.ivory);
          text(g, t(`factory.up.${st.id}.n`), cx, BY + 51, 9.5, C.muted, 'center', 600);
          if (isSlow) {
            const by = y - 14 + Math.sin(time * 6) * 2;
            poly(g, [cx + MW / 2 + 2, by + 12, cx + MW / 2 + 10, by - 2, cx + MW / 2 + 18, by + 12], C.rose);
            text(g, '!', cx + MW / 2 + 10, by + 10.5, 9.5, '#ffffff');
          }
        });
        // 品質：出口の検査の門。段が上がるほど光が強い
        if (qual > 0) {
          const qx = MX[2] + MW / 2 + 16;
          rr(g, qx - 1.5, BY - 30, 3, 30, 1, C.gold);
          rr(g, qx + 12.5, BY - 30, 3, 30, 1, C.gold);
          rr(g, qx - 3, BY - 33, 20, 4, 2, C.goldLight);
          glow(g, qx + 7, BY - 14, 18 + Math.min(14, qual), C.gold, 0.35 + 0.15 * Math.sin(time * 4));
          tag(g, `Lv ${qual}`, qx + 7, BY - 42, { size: 8.5 });
        }
        // 出荷：稼ぐほど品が積み上がる
        const pile = Math.min(15, Math.floor(s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0));
        rr(g, W - 76, BY + 13, 66, 4, 1, alpha(C.gold, 0.6));
        for (let i = 0; i < pile; i++) goods(W - 72 + (i % 3) * 20, BY - 5 - Math.floor(i / 3) * 18, 17, s.product, qual > 0 && i % 4 === 0);
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

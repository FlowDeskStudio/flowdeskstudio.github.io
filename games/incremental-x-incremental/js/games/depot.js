// 融合ゲーム（工場 × 迷路探索）：配送センター。限られたトラックを路線へ割り振る。
// 同じ路線に詰め込むほど 1 台あたりの稼ぎは落ちる（台数の平方根に比例）ので、路線の強さに合わせた配分が要る。
// 路線は 5 本まで増え、順に巡ってくる特需のあいだはその路線が 3 倍稼ぐ。組み直すかどうかが腕の見せどころ。
// トラックの改良、路線図で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, pointIn, alpha, mix, lin, rr, disc, line, poly, tag, glow, image, Bits, artOn } from '../ui/draw.js';
import { depotArtReady, drawDepot } from './depot_art.js';
import { miniIcon } from '../ui/icons.js';

// need は路線が開く累計
const ROUTES = [
  { id: 'near', base: 1, glyph: 'house', color: '#6fbf8a', need: 0 },
  { id: 'mid', base: 1.6, glyph: 'city', color: '#6a63e0', need: 0 },
  { id: 'far', base: 2.5, glyph: 'mountain', color: '#7f8bb8', need: 0 },
  { id: 'sea', base: 4, glyph: 'ship', color: '#3f8fe8', need: 1e5 },
  { id: 'air', base: 6.5, glyph: 'plane', color: '#9d86ff', need: 1e8 },
];
const SURGE = { mult: 3, sec: 45, wait: 45 }; // 特需：ひとつの路線が 3 倍

// 改良（1 回きり）
const TRUCK_TIERS = [{ own: 10, cost: 300 }, { own: 50, cost: 45000 }, { own: 150, cost: 4.5e7 }];
const SURGE_TIERS = [{ n: 10, cost: 5000 }, { n: 100, cost: 5e6 }, { n: 1000, cost: 5e9 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'mappower');
const trucks = (s) => lvl(s, 'truck');
const open = (s, i) => s.life.gte(ROUTES[i].need);
const surgeMult = (s) => SURGE.mult + 0.5 * treeLvl(s, 'surgepower');
const surgeSec = (s) => SURGE.sec * (1 + 0.25 * treeLvl(s, 'surgelong'));
const surging = (s, i) => s.surge.left > 0 && s.surge.route === i;
const routeVal = (s, i) => (open(s, i) ? ROUTES[i].base * 1.2 ** lvl(s, ROUTES[i].id) * (surging(s, i) ? surgeMult(s) : 1) : 0);
const used = (s) => s.assign.reduce((a, b) => a + b, 0);
const idle = (s) => trucks(s) - used(s);
const valMult = (s, ctx) => N(milestoneMult(trucks(s)) * 2 ** count(s, 'truck_t', TRUCK_TIERS.length) * 2 ** count(s, 'surge_t', SURGE_TIERS.length))
  .mul(Num.pow(1.15, lvl(s, 'pallet'))).mul(Num.pow(1.15, treeLvl(s, 'network'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const flowOf = (s, assign) => assign.reduce((a, n, i) => a + routeVal(s, i) * Math.sqrt(n), 0);
const flow = (s) => flowOf(s, s.assign);
const hasAuto = (s) => lvl(s, 'dispatch') > 0;

// いちばん稼げる配分：台数を「路線の強さの 2 乗」に比例させる
function ideal(s) {
  const total = trucks(s);
  const w = ROUTES.map((_, i) => routeVal(s, i) ** 2);
  const sum = w.reduce((a, b) => a + b, 0);
  const out = w.map((x) => Math.floor((total * x) / sum));
  let left = total - out.reduce((a, b) => a + b, 0);
  // 端数は、足したときの伸びが大きい路線から配る
  while (left-- > 0) {
    let best = 0;
    let gain = -1;
    for (let i = 0; i < ROUTES.length; i++) {
      const d = routeVal(s, i) * (Math.sqrt(out[i] + 1) - Math.sqrt(out[i]));
      if (d > gain) { gain = d; best = i; }
    }
    out[best]++;
  }
  return out;
}
function dispatch(s) {
  s.assign = ideal(s);
}
// いまの配分が、いちばん稼げる配分にほぼ並んでいるか（実績用）
const wellSplit = (s) => trucks(s) >= 20 && idle(s) === 0 && flow(s) >= flowOf(s, ideal(s)) * 0.98;

// 特需を進める。路線は開いているものを順に巡る
function runSurge(s, dt) {
  const g = s.surge;
  while (dt > 0) {
    if (g.left > 0) {
      const step = Math.min(dt, g.left);
      g.left -= step;
      dt -= step;
      // 特需の路線に全体の 4 割以上を回していた時間を数える
      if (s.assign[g.route] >= trucks(s) * 0.4) g.served += step;
      if (g.left <= 0) {
        if (g.served >= surgeSec(s) * 0.5) s.stats.surges = (s.stats.surges || 0) + 1;
        g.wait = SURGE.wait;
        if (hasAuto(s)) dispatch(s);
      }
    } else {
      const step = Math.min(dt, g.wait);
      g.wait -= step;
      dt -= step;
      if (g.wait <= 0) {
        const n = ROUTES.filter((_, i) => open(s, i)).length;
        g.route = (g.route + 1) % n;
        g.left = surgeSec(s);
        g.served = 0;
        if (hasAuto(s)) dispatch(s);
      }
    }
  }
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('depot.up.truck.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'depot',
  kind: 'fusion',
  parents: ['factory', 'maze'],
  icon: '🚚',
  ppPer,

  // トラック 1 台（近距離に配車済み）から始まる
  newState: () => ({
    ...baseState(), up: { truck: 1 }, assign: [1, 0, 0, 0, 0],
    surge: { route: 0, left: 0, wait: SURGE.wait, served: 0 },
  }),

  upgrades: [
    { id: 'truck', base: 15, r: 1.15, gen: true, val: (s) => String(idle(s)) },
    ...ROUTES.map((r, i) => ({ id: r.id, base: [80, 160, 240, 20000, 2e6][i], r: 2, show: (s) => open(s, i), val: (s) => fmt(ROUTES[i].base * 1.2 ** lvl(s, r.id), 2) })),
    { id: 'pallet', base: 250, r: 2.2 },
    { id: 'dispatch', base: 2500, r: 1, max: 1, show: (s) => trucks(s) >= 6 },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('truck_t', TRUCK_TIERS, 'c.tier.n', 'depot.tier.truck', (s, tier) => trucks(s) >= tier.own),
    ...tierUp('surge_t', SURGE_TIERS, 'depot.surgetier.n', 'depot.tier.surge', (s, tier) => (s.stats.surges || 0) >= tier.n),
  ],

  // 路線図で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'garage', base: 2, r: 3, max: 6 },
    { id: 'surgepower', base: 3, r: 3, max: 4 },
    { id: 'surgelong', base: 3, r: 2.5, max: 4, req: { surgepower: 1 } },
    { id: 'mappower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'network', base: 20, r: 1.7, max: 20, req: { mappower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[10, 100, 1000].map((v) => ({ id: `surges${v}`, type: 'surges', v, done: (s) => (s.stats.surges || 0) >= v })),
    { id: 'routes', type: 'routes', v: ROUTES.length, done: (s) => ROUTES.every((_, i) => open(s, i)) },
    { id: 'split', type: 'split', v: 20, done: wellSplit },
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'trucks', v, done: (s) => trucks(s) >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // トラックの割引（ツリー）
  costMult: (s, u) => (u.gen ? 0.95 ** treeLvl(s, 'garage') : 1),

  // 転生や総転生のあと：ツリー「車庫入れ」のぶんのトラックを、近い路線から配って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > trucks(s)) {
      s.up.truck = n;
      dispatch(s);
    }
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    // 路線が増える前のデータでは、配車の枠が足りないことがある
    while (s.assign.length < ROUTES.length) s.assign.push(0);
    // 刻みの前後の稼ぎをならす（特需の切り替わりをまたぐ長い経過のため）
    const before = flow(s);
    runSurge(s, dt);
    earn(s, valMult(s, ctx).mul(((before + flow(s)) / 2) * dt));
  },

  rate: (s, ctx) => valMult(s, ctx).mul(flow(s)),

  // 配車係がいれば、台数や路線が変わるたびに組み直す
  onBuy(s) {
    if (hasAuto(s)) dispatch(s);
  },

  // 積み込みを手伝う：0.25 秒ぶん（最低 1 個）
  click(s, ctx) {
    s.clicks++;
    const got = valMult(s, ctx).mul(Math.max(1, flow(s) * 0.25));
    earn(s, got);
    return got;
  },

  move(s, i, d) {
    if (!open(s, i)) return;
    if (d > 0 && idle(s) < 1) return;
    if (d < 0 && s.assign[i] < 1) return;
    s.assign[i] += d;
  },

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(1e5).pow(0.2).floor();
  },

  // 絵：夜の地図。配送センターから、光る道が届け先へ伸びる。台数、路線の強化、パレット、配車係が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 260;
    const HUB = [68, 136]; // 配送センター
    const { cv, g } = makeCanvas(W, H, 'scene');
    const idleEl = h('div', { class: 'depth' });
    const surgeEl = h('div', { class: 'zone' });
    const rows = ROUTES.map((r, i) => {
      const cnt = h('span', { class: 'blowtxt' });
      const rate = h('span', { class: 'frate' });
      const hotTag = h('em', { class: 'ftag hot' }, t('depot.surgeTag'));
      const minus = h('button', { class: 'mini', onclick: () => game.move(api.s(), i, -1) }, '−');
      const plus = h('button', { class: 'mini', onclick: () => game.move(api.s(), i, 1) }, '＋');
      const row = h('div', { class: 'frow' }, h('span', { class: 'gicon', html: miniIcon(r.glyph, r.color) }),
        h('div', { class: 'fmid' }, h('div', { class: 'fname' }, t(`depot.up.${r.id}.n`), hotTag), h('div', { class: 'blowctl' }, minus, cnt, plus)), rate);
      return { i, cnt, rate, tag: hotTag, minus, plus, row };
    });
    const auto = h('div', { class: 'sub' }, t('depot.auto'));
    const help = h('button', { class: 'bigbtn' }, t('depot.help'));
    const wrap = h('div', { class: 'playbox' }, h('div', { class: 'row center' }, surgeEl, idleEl), cv, h('div', { class: 'fline' }, rows.map((r) => r.row)), auto, help);
    const bits = new Bits();
    let clock = 0;
    const doHelp = (ev) => {
      floatText(wrap, ev, '+' + fmt(game.click(api.s(), api.ctx()), 1));
      bits.add(HUB[0] + 24, HUB[1] + 6, 4, { color: [C.gold, C.goldLight], speed: 70, up: 50, size: 3, life: 0.45, glow: true });
      se('crate');
    };
    help.addEventListener('pointerdown', doHelp);
    // 届け先の位置（右側に扇形に並ぶ）
    const dest = (i) => [312 + [0, 72, 114, 100, 42][i], [38, 60, 128, 204, 230][i]];
    // 絵の届け先を押すと 1 台回す（配車係がいないあいだ）。それ以外の所は積み込みの手伝い
    cv.addEventListener('pointerdown', (ev) => {
      const s = api.s();
      const [x, y] = pointIn(cv, ev, W, H);
      const hitRoute = ROUTES.findIndex((_, i) => open(s, i) && Math.hypot(x - dest(i)[0], y - dest(i)[1]) < 26);
      if (hitRoute >= 0 && !hasAuto(s) && idle(s) > 0) {
        game.move(s, hitRoute, 1);
        se('select');
      } else doHelp(ev);
    });
    el.append(wrap);

    const icons = ROUTES.map((r) => `data:image/svg+xml;utf8,${encodeURIComponent(miniIcon(r.glyph, r.color))}`);
    // 道の途中の点（p は 0〜1）
    const along = (i, p) => {
      const [x1, y1] = dest(i);
      const mx = (HUB[0] + x1) / 2;
      const my = (HUB[1] + y1) / 2 + (y1 - HUB[1]) * 0.25;
      const q = 1 - p;
      return [q * q * HUB[0] + 2 * q * p * mx + p * p * x1, q * q * HUB[1] + 2 * q * p * my + p * p * y1];
    };
    // トラック：改良で金の帯、パレットの段で荷の高さが変わる
    const truck = (x, y, color, back, tiers, load) => {
      rr(g, x - 8, y - 9 - load, 12, 9 + load, 2, lin(g, 0, y - 9 - load, 0, y, mix(color, '#ffffff', 0.25), mix(color, C.ink, 0.4)));
      for (let k = 0; k < tiers; k++) rr(g, x - 8, y - 3 - k * 2.6, 12, 1.2, 0, C.gold);
      rr(g, back ? x - 13 : x + 4, y - 7, 5, 7, 1.5, C.ice);
      disc(g, x - 5, y + 1, 2.1, C.ink, alpha(C.ice, 0.6), 0.8);
      disc(g, x + 4, y + 1, 2.1, C.ink, alpha(C.ice, 0.6), 0.8);
      // 前を照らす灯り
      glow(g, back ? x - 15 : x + 11, y - 3, 7, C.goldLight, 0.6);
    };

    return {
      update() {
        const s = api.s();
        const free = idle(s);
        const a = hasAuto(s);
        setText(idleEl, t('depot.idle', { v: free, n: trucks(s) }));
        idleEl.dataset.st = free > 0 ? 'hot' : 'good';
        const sg = s.surge;
        setText(surgeEl, sg.left > 0
          ? t('depot.surgeOn', { r: t(`depot.up.${ROUTES[sg.route].id}.n`), m: surgeMult(s), t: fmtTime(Math.ceil(sg.left)) })
          : t('depot.surgeWait', { t: fmtTime(Math.ceil(sg.wait)) }));
        auto.hidden = !a;
        const v = valMult(s, api.ctx());
        for (const r of rows) {
          r.row.hidden = !open(s, r.i);
          const hot = surging(s, r.i);
          r.tag.hidden = !hot;
          r.row.classList.toggle('surge', hot);
          setText(r.cnt, t('depot.count', { v: s.assign[r.i] || 0 }));
          setText(r.rate, t('c.perSec', { v: fmt(v.mul(routeVal(s, r.i) * Math.sqrt(s.assign[r.i] || 0)), 1) }));
          r.minus.hidden = a;
          r.plus.hidden = a;
          r.plus.disabled = free < 1;
          r.minus.disabled = (s.assign[r.i] || 0) < 1;
        }
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        // 絵は 2 通り：素材を使う描き方（depot_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('depot') && depotArtReady()) {
          drawDepot(g, {
            W, H, HUB, clock, dest, along,
            routes: ROUTES.map((r, i) => ({ open: open(s, i), n: s.assign[i] || 0, hot: surging(s, i), lvl: lvl(s, r.id) })),
            total: trucks(s), totalLabel: fmt(trucks(s)), free: idle(s),
            tiers: count(s, 'truck_t', TRUCK_TIERS.length), load: Math.min(5, Math.floor(lvl(s, 'pallet') / 3)),
            surgeTier: count(s, 'surge_t', SURGE_TIERS.length), auto: hasAuto(s),
          });
          bits.draw(g, dt);
          return;
        }
        // 地図の地面：升目と、ところどころの街あかり
        g.fillStyle = lin(g, 0, 0, W, H, '#16267a', C.ink);
        g.fillRect(0, 0, W, H);
        for (let x = 0; x < W; x += 24) rr(g, x, 0, 1, H, 0, alpha(C.ice, 0.045));
        for (let y = 0; y < H; y += 24) rr(g, 0, y, W, 1, 0, alpha(C.ice, 0.045));
        for (let i = 0; i < 16; i++) disc(g, (i * 97 + 40) % W, (i * 61 + 30) % H, 1.2, alpha(C.goldLight, 0.25 + 0.2 * Math.sin(clock + i)));
        // 海（航路が開いたら）
        if (open(s, 3)) {
          g.fillStyle = lin(g, W - 160, H - 80, W, H, alpha(C.azure, 0.5), alpha(C.royal, 0.15));
          g.beginPath();
          g.ellipse(W - 10, H + 6, 156, 82, 0, 0, Math.PI * 2);
          g.fill();
          for (let i = 0; i < 4; i++) line(g, [W - 120 + i * 26 + Math.sin(clock + i) * 4, H - 24 - i * 9, W - 104 + i * 26 + Math.sin(clock + i) * 4, H - 24 - i * 9], alpha(C.ice, 0.3), 1);
        }
        const tiers = count(s, 'truck_t', TRUCK_TIERS.length);
        const load = Math.min(5, Math.floor(lvl(s, 'pallet') / 3));
        const st = count(s, 'surge_t', SURGE_TIERS.length);
        // 道と、行き来するトラック
        ROUTES.forEach((r, i) => {
          if (!open(s, i)) return;
          const n = s.assign[i] || 0;
          const hot = surging(s, i);
          const [x1, y1] = dest(i);
          const mid = along(i, 0.5);
          const cx = 2 * mid[0] - (HUB[0] + x1) / 2;
          const cy = 2 * mid[1] - (HUB[1] + y1) / 2;
          const path = () => {
            g.beginPath();
            g.moveTo(...HUB);
            g.quadraticCurveTo(cx, cy, x1, y1);
          };
          // 特需の道は金に光る。台数が多い道ほど太い
          g.lineCap = 'round';
          if (hot) {
            g.strokeStyle = alpha(C.gold, 0.22 + st * 0.05 + Math.sin(clock * 6) * 0.1);
            g.lineWidth = 16 + st * 2;
            path();
            g.stroke();
          }
          g.strokeStyle = n > 0 ? alpha(hot ? C.goldLight : C.sky, 0.85) : alpha(C.ice, 0.2);
          g.lineWidth = 2 + Math.min(4, Math.log2(n + 1));
          g.setLineDash(i >= 3 ? [3, 8] : []);
          path();
          g.stroke();
          g.setLineDash([]);
          g.lineCap = 'butt';
          const shown = Math.min(n, 7);
          const sp = (0.16 + 0.03 * i) * (hot ? 1.8 : 1) / (1 + i * 0.25);
          for (let k = 0; k < shown; k++) {
            const ph = (clock * sp + k / shown) % 1;
            const back = ph > 0.5;
            const p = back ? 2 - ph * 2 : ph * 2;
            const [x, y] = along(i, p);
            truck(x, y + (back ? 4 : -3), r.color, back, tiers, back ? 0 : load);
          }
          // 届け先：路線を強化するほど、まわりに金の点が増える
          const rl = Math.min(8, lvl(s, r.id));
          for (let k = 0; k < rl; k++) {
            const a = -Math.PI / 2 + (k / 8) * Math.PI * 2;
            disc(g, x1 + Math.cos(a) * 26, y1 + Math.sin(a) * 26, 1.6, C.gold);
          }
          if (hot) glow(g, x1, y1, 40, C.gold, 0.5);
          const im = image(icons[i]);
          const sz = hot ? 42 + Math.sin(clock * 6) * 3 : 36;
          if (im) g.drawImage(im, x1 - sz / 2, y1 - sz / 2, sz, sz);
          tag(g, `×${n}`, x1, y1 + 26, { size: 9.5, color: hot ? C.ink : C.goldLight, bg: hot ? C.gold : alpha(C.ink, 0.72) });
        });
        // 配送センター：持っている台数ぶん、建物が大きくなる
        const total = trucks(s);
        const bw = 58 + Math.min(26, Math.log2(total + 1) * 4);
        const bh = 40 + Math.min(22, Math.log2(total + 1) * 3.5);
        glow(g, HUB[0], HUB[1], 70, C.azure, 0.35);
        rr(g, HUB[0] - bw / 2, HUB[1] - bh / 2, bw, bh, 5, lin(g, 0, HUB[1] - bh / 2, 0, HUB[1] + bh / 2, '#3a56c8', '#141f5c'), alpha(C.gold, 0.6), 1);
        poly(g, [HUB[0] - bw / 2 - 5, HUB[1] - bh / 2 + 2, HUB[0], HUB[1] - bh / 2 - 16, HUB[0] + bw / 2 + 5, HUB[1] - bh / 2 + 2], lin(g, 0, HUB[1] - bh / 2 - 16, 0, HUB[1] - bh / 2, C.gold, C.goldDark));
        for (let k = 0; k < 3; k++) rr(g, HUB[0] - bw / 2 + 6 + k * ((bw - 20) / 2), HUB[1] - bh / 2 + 22, 8, 6, 1, alpha(C.goldLight, 0.8));
        rr(g, HUB[0] - 11, HUB[1] + bh / 2 - 16, 22, 16, 2, C.ink, alpha(C.ice, 0.4), 1);
        tag(g, `×${fmt(total)}`, HUB[0], HUB[1] - bh / 2 + 12, { size: 9.5 });
        // 配車係：屋根の上で回るレーダー
        if (hasAuto(s)) {
          const rx = HUB[0] + bw / 2 - 6;
          const ry = HUB[1] - bh / 2 - 12;
          line(g, [rx, ry + 12, rx, ry], C.ice, 1.2);
          const a = clock * 2.4;
          g.fillStyle = alpha(C.leaf, 0.3);
          g.beginPath();
          g.moveTo(rx, ry);
          g.arc(rx, ry, 14, a, a + 0.9);
          g.closePath();
          g.fill();
          disc(g, rx, ry, 2.2, C.leaf);
        }
        // 手の空いたトラックは、センターの前に並んで待つ
        const free = idle(s);
        for (let k = 0; k < Math.min(free, 6); k++) truck(HUB[0] - 30 + (k % 3) * 24, HUB[1] + bh / 2 + 18 + Math.floor(k / 3) * 14, C.steel, false, tiers, 0);
        if (free > 6) tag(g, `+${free - 6}`, HUB[0] + 50, HUB[1] + bh / 2 + 30, { size: 9 });
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

// 基本ゲーム1：クリッカー。クリックと設備でポポーを集める。
// 設備 10 種、設備ごとの改良、ときどき現れる金のポポー、種で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, pointIn, alpha, lin, rr, disc, line, poly, tag, glow, shadow, stage, pawpaw, sparkle, smoke, Bits, tier, artOn } from '../ui/draw.js';
import { clickerArtReady, drawClicker, drawGold } from './clicker_art.js';

const GENS = [
  { id: 'picker', base: 15, prod: 0.5 },
  { id: 'tree', base: 120, prod: 4 },
  { id: 'cart', base: 1300, prod: 25 },
  { id: 'press', base: 15000, prod: 150 },
  { id: 'grove', base: 200000, prod: 1000 },
  { id: 'market', base: 3.3e6, prod: 7500 },
  { id: 'cannery', base: 5e7, prod: 50000 },
  { id: 'port', base: 7.5e8, prod: 350000 },
  { id: 'airship', base: 1.2e10, prod: 2.5e6 },
  { id: 'city', base: 2e11, prod: 2e7 },
];
// 改良：設備を一定数そろえると買える、その設備の生産 2 倍（各設備 3 段）
const TIERS = [
  { own: 10, cost: 20 },
  { own: 50, cost: 3000 },
  { own: 150, cost: 3e6 },
];
// 手袋：クリック回数に応じて買える、クリックの収穫 2 倍
const GLOVES = [
  { clicks: 100, cost: 500 },
  { clicks: 1000, cost: 50000 },
  { clicks: 10000, cost: 5e6 },
];
const ROMAN = ['I', 'II', 'III'];

// 金のポポー：受け取るたびに 3 種類の効果が順に巡る
const GOLD_KINDS = ['harvest', 'frenzy', 'bigclick'];
const GOLD_STAY = 12; // 画面に出ている秒数
const HARVEST_SEC = 240; // 大収穫：生産この秒数ぶん
const FRENZY = { sec: 30 }; // 豊作：生産 7 倍（ツリーで伸びる）
const frenzyMult = (s) => 7 + treeLvl(s, 'abundance');
const BIGCLICK = { mult: 30, sec: 15 }; // 大粒：クリック 30 倍

const goldEvery = (s) => 120 * 0.85 ** treeLvl(s, 'goldfreq');
const goldDur = (s) => 1 + 0.25 * treeLvl(s, 'golddur');
const hasMagnet = (s) => treeLvl(s, 'magnet') > 0;
const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'seedpower');

const tierMult = (s, g) => 2 ** TIERS.reduce((a, _, i) => a + lvl(s, `${g.id}_t${i}`), 0);
const gloveMult = (s) => 2 ** GLOVES.reduce((a, _, i) => a + lvl(s, `glove${i}`), 0);
const allMult = (s, ctx) => Num.pow(1.5, lvl(s, 'compost')).mul(Num.pow(1.25, lvl(s, 'graft'))).mul(Num.pow(1.25, treeLvl(s, 'heirloom'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const genEach = (s, g) => g.prod * milestoneMult(lvl(s, g.id)) * tierMult(s, g);

// 豊作の効果を除いた毎秒の生産
function basePps(s, ctx) {
  let sum = 0;
  for (const g of GENS) sum += lvl(s, g.id) * genEach(s, g);
  return N(sum).mul(allMult(s, ctx));
}
const pps = (s, ctx) => basePps(s, ctx).mul(s.buffs.frenzy > 0 ? frenzyMult(s) : 1);

function clickPower(s, ctx) {
  const hand = N((1 + lvl(s, 'hand')) * gloveMult(s)).mul(allMult(s, ctx));
  const share = 0.01 * lvl(s, 'sync') + 0.02 * treeLvl(s, 'deepclick');
  return hand.add(pps(s, ctx).mul(share)).mul(s.buffs.bigclick > 0 ? BIGCLICK.mult : 1);
}

// 金のポポーの効果。scale は効果の大きさ（自動で受け取ると半分）
function applyGold(s, ctx, scale) {
  const kind = GOLD_KINDS[(s.stats.gold || 0) % GOLD_KINDS.length];
  s.stats.gold = (s.stats.gold || 0) + 1;
  let got = null;
  if (kind === 'harvest') {
    got = basePps(s, ctx).mul(HARVEST_SEC * scale).max(clickPower(s, ctx).mul(50 * scale));
    earn(s, got);
  } else if (kind === 'frenzy') {
    s.buffs.frenzy = FRENZY.sec * goldDur(s) * scale;
  } else {
    s.buffs.bigclick = BIGCLICK.sec * goldDur(s) * scale;
  }
  return { kind, got };
}

const own = (s) => Math.max(...GENS.map((g) => lvl(s, g.id)));
const lifeAch = [1e3, 1e6, 1e9, 1e12, 1e15, 1e18, 1e21].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) }));

const game = {
  id: 'clicker',
  kind: 'base',
  icon: '🍈',
  iconImg: 'pawpaw',
  ppImg: 'seed',
  ppPer,

  newState: () => ({ ...baseState(), gold: { t: 120, on: 0, x: 0.5, y: 0.5 }, buffs: { frenzy: 0, bigclick: 0 } }),

  upgrades: [
    { id: 'hand', base: 10, r: 1.5, val: (s, ctx) => fmt(clickPower(s, ctx), 1) },
    ...GENS.map((g) => ({
      id: g.id,
      base: g.base,
      r: 1.15,
      gen: true,
      show: (s) => s.life.gte(g.base / 3) || s.amt.gte(g.base), // 元手で始まる周は、買える時点で見える
      val: (s, ctx) => fmt(N(genEach(s, g)).mul(allMult(s, ctx)), 1),
    })),
    { id: 'compost', base: 10000, r: 6, show: (s) => s.life.gte(4000) || s.amt.gte(10000) },
    // 後半の伸びを支える強化（序盤の流れは変えない）
    { id: 'graft', base: 1e12, r: 2.6, show: (s) => s.life.gte(1e11) },
    { id: 'sync', base: 5000, r: 4, max: 20, show: (s) => s.life.gte(2000), val: (s) => String(lvl(s, 'sync')) },
    // 改良（1 回きり）
    ...GENS.flatMap((g) => TIERS.map((tier, i) => ({
      id: `${g.id}_t${i}`,
      base: g.base * tier.cost,
      r: 1,
      max: 1,
      once: true,
      show: (s) => lvl(s, g.id) >= tier.own,
      name: (tr) => tr('clicker.tier.n', { g: tr(`clicker.up.${g.id}.n`), k: ROMAN[i] }),
      desc: (tr) => tr('clicker.tier.d', { g: tr(`clicker.up.${g.id}.n`) }),
    }))),
    ...GLOVES.map((gl, i) => ({
      id: `glove${i}`,
      base: gl.cost,
      r: 1,
      max: 1,
      once: true,
      show: (s) => s.clicks >= gl.clicks,
      name: (tr) => tr('clicker.glove.n', { k: ROMAN[i] }),
      desc: (tr) => tr('clicker.glove.d'),
    })),
  ],

  // 種で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'deepclick', base: 2, r: 2.5, max: 5 },
    { id: 'discount', base: 3, r: 3, max: 6 },
    { id: 'goldfreq', base: 2, r: 2.5, max: 5 },
    { id: 'golddur', base: 4, r: 3, max: 4, req: { goldfreq: 1 } },
    { id: 'magnet', base: 25, max: 1, req: { goldfreq: 2 } },
    { id: 'seedpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'abundance', base: 100, r: 5, max: 10, req: { golddur: 2 } },
    { id: 'heirloom', base: 500, r: 6, max: 20, req: { seedpower: 2 } },
  ],

  achievements: [
    ...lifeAch,
    ...[100, 1000, 10000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'own', v, done: (s) => own(s) >= v })),
    { id: 'all1', type: 'all', v: 1, done: (s) => GENS.every((g) => lvl(s, g.id) >= 1) },
    { id: 'all50', type: 'all', v: 50, done: (s) => GENS.every((g) => lvl(s, g.id) >= 50) },
    ...[1, 10, 50].map((v) => ({ id: `gold${v}`, type: 'gold', v, done: (s) => (s.stats.gold || 0) >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 設備の割引（ツリー）
  costMult: (s, u) => (u.gen ? 0.95 ** treeLvl(s, 'discount') : 1),

  // 転生や総転生のあと：ツリー「よい出だし」のぶんの収穫ばさみを持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.picker = Math.max(lvl(s, 'picker'), n);
  },

  tick(s, dt, ctx) {
    const base = basePps(s, ctx);
    const boosted = Math.min(dt, s.buffs.frenzy);
    earn(s, base.mul(dt + (frenzyMult(s) - 1) * boosted));
    s.buffs.frenzy = Math.max(0, s.buffs.frenzy - dt);
    s.buffs.bigclick = Math.max(0, s.buffs.bigclick - dt);

    // 金のポポー
    const g = s.gold;
    if (g.on > 0) g.on = Math.max(0, g.on - dt);
    g.t -= dt;
    if (g.t > 0) return;
    const every = goldEvery(s);
    if (hasMagnet(s)) {
      // 磁石：出たそばから自動で受け取る（効果は半分）。長い経過は平均の効果でまとめる
      const n = 1 + Math.floor(-g.t / every);
      g.t += n * every;
      if (n === 1) {
        applyGold(s, ctx, 0.5);
      } else {
        earn(s, base.mul(((HARVEST_SEC * 0.5 + (frenzyMult(s) - 1) * FRENZY.sec * goldDur(s) * 0.5) / GOLD_KINDS.length) * n));
        s.stats.gold = (s.stats.gold || 0) + n;
      }
    } else {
      g.t = every;
      // 見ているときだけ現れる
      if (ctx.visible) {
        g.on = GOLD_STAY;
        g.x = 0.12 + Math.random() * 0.76;
        g.y = 0.15 + Math.random() * 0.6;
      }
    }
  },

  rate: pps,
  clickPower,

  click(s, ctx) {
    const p = clickPower(s, ctx);
    earn(s, p);
    s.clicks++;
    return p;
  },

  // 金のポポーを受け取る
  clickGold(s, ctx) {
    if (s.gold.on <= 0) return null;
    s.gold.on = 0;
    return applyGold(s, ctx, 1);
  },

  prestigeTotal(s) {
    if (s.life.lt(1e6)) return ZERO;
    return s.life.div(2.5e5).pow(0.33).floor();
  },

  // 絵：夜の果樹園。まんなかの大きな実を摘む。買った設備は、まわりに建っていく。
  mount(el, api) {
    const W = 480;
    const H = 300;
    const HZ = 196; // 地平線
    const FX = 240;
    const FY = 142;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const per = h('div', { class: 'sub' });
    const frenzy = h('span', { class: 'buff' });
    const bigclick = h('span', { class: 'buff' });
    const buffs = h('div', { class: 'row wrap center buffs' }, frenzy, bigclick);
    const wrap = h('div', { class: 'playbox' }, buffs, cv, per);
    const bits = new Bits();
    let clock = 0;
    let press = 0;
    const goldAt = (s) => [W * s.gold.x, 30 + (H - 110) * s.gold.y];
    cv.addEventListener('pointerdown', (ev) => {
      const s = api.s();
      const [x, y] = pointIn(cv, ev, W, H);
      const [gx, gy] = goldAt(s);
      if (s.gold.on > 0 && Math.hypot(x - gx, y - gy) < 28) {
        const r = game.clickGold(s, api.ctx());
        if (!r) return;
        bits.add(gx, gy, 26, { color: [C.gold, C.goldLight, '#ffffff'], speed: 170, size: 3, glow: true });
        floatText(wrap, ev, r.got ? `${t('clicker.gold.harvest')} +${fmt(r.got, 1)}` : t(`clicker.gold.${r.kind}`, { m: r.kind === 'frenzy' ? frenzyMult(s) : BIGCLICK.mult }), 'big');
        se('bonus');
        return;
      }
      const p = game.click(s, api.ctx());
      press = 0.16;
      bits.add(FX + (Math.random() - 0.5) * 70, FY - 20, 4, { color: [C.leafLight, C.gold, C.leaf], speed: 110, up: 60, size: 3, life: 0.5 });
      floatText(wrap, ev, '+' + fmt(p, 1));
      se('pluck');
    });
    el.append(wrap);

    // 改良の段数（金の粒で示す）
    const pips = (x, y, id, s) => {
      const k = TIERS.reduce((a, _, i) => a + lvl(s, `${id}_t${i}`), 0);
      for (let i = 0; i < k; i++) sparkle(g, x + (i - (k - 1) / 2) * 9, y, 3.6, C.gold);
    };
    const count = (x, y, n) => tag(g, `×${fmt(n)}`, x, y, { size: 9.5 });
    const treeAt = (x, y, sz, fruit = true) => {
      shadow(g, x, y, sz * 0.5, sz * 0.12);
      rr(g, x - sz * 0.06, y - sz * 0.5, sz * 0.12, sz * 0.5, 2, '#5c4630');
      disc(g, x, y - sz * 0.72, sz * 0.42, lin(g, x - sz * 0.4, y - sz * 1.1, x + sz * 0.4, y - sz * 0.3, C.leaf, C.leafDark));
      disc(g, x - sz * 0.14, y - sz * 0.84, sz * 0.14, alpha(C.leafLight, 0.5));
      if (fruit) {
        disc(g, x + sz * 0.12, y - sz * 0.6, sz * 0.07, C.leafLight);
        disc(g, x - sz * 0.2, y - sz * 0.56, sz * 0.06, C.leafLight);
      }
    };

    return {
      update() {
        const s = api.s();
        setText(per, t('clicker.perClick', { v: fmt(clickPower(s, api.ctx()), 1) }));
        frenzy.hidden = s.buffs.frenzy <= 0;
        setText(frenzy, t('clicker.buff.frenzy', { m: frenzyMult(s), t: fmtTime(s.buffs.frenzy) }));
        bigclick.hidden = s.buffs.bigclick <= 0;
        setText(bigclick, t('clicker.buff.bigclick', { m: BIGCLICK.mult, t: fmtTime(s.buffs.bigclick) }));
      },
      frame(dt) {
        clock += dt;
        press = Math.max(0, press - dt);
        const s = api.s();
        const n = (id) => lvl(s, id);
        const fren = s.buffs.frenzy > 0;
        const big = s.buffs.bigclick > 0;
        // 絵は 2 通り：素材を使う描き方（clicker_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('clicker') && clickerArtReady()) {
          drawClicker(g, {
            W, H, HZ, FX, FY, clock, press, n, fren, big, clicks: s.clicks,
            tiers: (id) => TIERS.reduce((a, _, i) => a + lvl(s, `${id}_t${i}`), 0),
            label: (id) => fmt(lvl(s, id)),
            gloves: GLOVES.reduce((a, _, i) => a + n(`glove${i}`), 0),
          });
          if (fren && Math.random() < dt * 30) bits.add(Math.random() * W, -4, 1, { color: [C.gold, C.goldLight], speed: 20, angle: Math.PI / 2, spread: 0.4, gravity: 160, life: 1.6, size: 2.4, glow: true });
          bits.draw(g, dt);
          if (s.gold.on > 0) drawGold(g, ...goldAt(s), clock, s.gold.on < 3);
          return;
        }
        stage(g, W, H, { top: fren ? '#3b3a8a' : C.navy, bottom: '#101c52', horizon: HZ, floor: '#12305a', floorEnd: C.ink, stars: 26, t: clock });

        // 街：地平線の向こうの灯り。数が増えるほど高く、広くなる
        if (n('city') > 0) {
          const k = tier(n('city'), 7);
          for (let i = 0; i < 3 + k * 2; i++) {
            const bw = 11 + (i * 7) % 8;
            const bh = 16 + ((i * 13) % 5) * 5 + k * 5;
            const bx = 470 - i * 13 - bw;
            if (bx < 330) break;
            rr(g, bx, HZ - bh, bw, bh, 1.5, lin(g, 0, HZ - bh, 0, HZ, '#2a3f9a', '#101c52'));
            for (let wy = HZ - bh + 4; wy < HZ - 4; wy += 6) {
              if ((i + wy) % 3) rr(g, bx + 2.5, wy, 2, 2.4, 0.5, alpha(C.goldLight, 0.55 + 0.35 * Math.sin(clock + i + wy)));
              if ((i * 2 + wy) % 4) rr(g, bx + bw - 4.5, wy, 2, 2.4, 0.5, alpha(C.goldLight, 0.7));
            }
          }
          pips(420, HZ - 62 - tier(n('city'), 7) * 5, 'city', s);
          count(440, HZ + 12, n('city'));
        }
        // 加工場：煙突から煙
        if (n('cannery') > 0) {
          const x = 322;
          rr(g, x, HZ - 26, 46, 26, 2, lin(g, 0, HZ - 26, 0, HZ, C.steel, C.steelDark));
          poly(g, [x, HZ - 26, x + 11, HZ - 36, x + 11, HZ - 26, x + 22, HZ - 36, x + 22, HZ - 26, x + 33, HZ - 36, x + 33, HZ - 26], C.steel);
          rr(g, x + 36, HZ - 50, 7, 26, 1, C.steelDark);
          for (let i = 0; i < 3; i++) smoke(g, x + 40, HZ - 54, (clock * 0.3 + i / 3) % 1, { rise: 30, size: 7 });
          for (let i = 0; i < 3; i++) rr(g, x + 6 + i * 11, HZ - 14, 6, 6, 1, alpha(C.goldLight, 0.8));
          pips(x + 20, HZ - 44, 'cannery', s);
          count(x + 22, HZ + 12, n('cannery'));
        }
        // 果樹園：地平線に並ぶ木
        if (n('grove') > 0) {
          const k = 2 + tier(n('grove'), 5);
          for (let i = 0; i < k; i++) treeAt(22 + i * 15, HZ + 2 + (i % 2) * 3, 26 + (i % 3) * 3);
          pips(60, HZ - 36, 'grove', s);
          count(60, HZ + 14, n('grove'));
        }
        // 市場：しま模様のひさし
        if (n('market') > 0) {
          const x = 118;
          rr(g, x + 2, HZ - 14, 36, 14, 1.5, '#3a2f55');
          for (let i = 0; i < 6; i++) rr(g, x + i * 6.7, HZ - 24, 6.7, 11, i === 0 || i === 5 ? 2 : 0, i % 2 ? C.ivory : C.azure);
          for (let i = 0; i < 4; i++) disc(g, x + 9 + i * 7.5, HZ - 15, 2.6, i % 2 ? C.leafLight : C.gold);
          pips(x + 20, HZ - 32, 'market', s);
          count(x + 20, HZ + 12, n('market'));
        }
        // 飛行船：空をゆっくり行き来する
        if (n('airship') > 0) {
          const x = 90 + Math.sin(clock * 0.22) * 46;
          const y = 46 + Math.sin(clock * 0.9) * 3;
          g.fillStyle = lin(g, x - 30, y - 12, x + 30, y + 12, C.goldLight, C.gold, C.goldDark);
          g.beginPath();
          g.ellipse(x, y, 32, 12, 0, 0, Math.PI * 2);
          g.fill();
          line(g, [x - 16, y, x + 16, y], alpha(C.goldDark, 0.7), 1);
          poly(g, [x - 30, y, x - 40, y - 8, x - 36, y, x - 40, y + 8], C.goldDark);
          rr(g, x - 9, y + 13, 18, 6, 2, C.navy, C.gold, 1);
          line(g, [x - 7, y + 11, x - 7, y + 13, x + 7, y + 13, x + 7, y + 11], alpha(C.ice, 0.6), 0.8);
          pips(x, y - 20, 'airship', s);
          count(x, y + 30, n('airship'));
        }
        // 港：手前に水辺、桟橋と船
        if (n('port') > 0) {
          g.fillStyle = lin(g, 0, 262, 0, H, '#1a3fa8', C.ink);
          g.fillRect(0, 264, W, H - 264);
          for (let i = 0; i < 9; i++) line(g, [i * 60 + ((clock * 14) % 60) - 20, 274 + (i % 3) * 8, i * 60 + ((clock * 14) % 60), 274 + (i % 3) * 8], alpha(C.ice, 0.25), 1);
          const x = 404;
          const y = 272 + Math.sin(clock * 1.4) * 1.2;
          poly(g, [x - 30, y, x + 30, y, x + 22, y + 10, x - 22, y + 10], lin(g, 0, y, 0, y + 10, C.ivory, C.steel));
          rr(g, x - 12, y - 9, 22, 9, 1.5, C.azure);
          line(g, [x - 2, y - 9, x - 2, y - 26], C.ice, 1.4);
          poly(g, [x, y - 26, x + 14, y - 12, x, y - 12], C.goldLight);
          rr(g, 318, 262, 44, 4, 1, '#5c4630');
          rr(g, 324, 266, 3, 12, 0, '#3f3020');
          rr(g, 352, 266, 3, 12, 0, '#3f3020');
          pips(x, y - 34, 'port', s);
          count(340, 256, n('port'));
        }

        // まんなかの実。堆肥は足もとの土の山、接ぎ木は小さな実、連動は回る光
        const mound = Math.min(1, n('compost') / 12);
        g.fillStyle = lin(g, 0, HZ - 10, 0, HZ + 26, '#3d5a3a', '#16283a');
        g.beginPath();
        g.ellipse(FX, HZ + 14, 92 + mound * 30, 18 + mound * 8, 0, Math.PI, 0);
        g.fill();
        for (let i = 0; i < Math.min(14, n('compost')); i++) {
          const a = (i / 14) * Math.PI;
          const tx = FX - Math.cos(a) * (70 + mound * 28) * (0.5 + ((i * 37) % 50) / 100);
          line(g, [tx, HZ + 6, tx - 2, HZ - 1, tx, HZ + 6, tx + 3, HZ - 2], C.leaf, 1.2);
        }
        shadow(g, FX, HZ + 6, 74, 9, 0.45);
        glow(g, FX, FY, 120, big ? C.gold : fren ? C.gold : C.azure, big ? 0.55 : 0.35);
        const sync = Math.min(20, n('sync'));
        for (let i = 0; i < sync; i++) {
          const a = clock * 0.6 + (i / sync) * Math.PI * 2;
          disc(g, FX + Math.cos(a) * 82, FY + Math.sin(a) * 52, 1.8, alpha(C.goldLight, 0.5 + 0.5 * Math.sin(a * 2)));
        }
        // まだ触っていないうちは、実のまわりに輪が広がって誘う
        if (s.clicks < 5) {
          const u = (clock * 0.6) % 1;
          g.beginPath();
          g.ellipse(FX, FY, 66 + u * 30, 50 + u * 24, -0.26, 0, Math.PI * 2);
          g.strokeStyle = alpha(C.goldLight, 0.55 * (1 - u));
          g.lineWidth = 1.5;
          g.stroke();
        }
        const sq = 1 - (press / 0.16) * 0.1;
        const size = (big ? 120 : 106) * (1 + Math.sin(clock * 1.6) * 0.012);
        pawpaw(g, FX, FY + (1 - sq) * 30, size * (2 - sq), { tone: fren ? 'ripe' : 'green', squash: sq * sq, rot: -0.26 + Math.sin(clock * 0.8) * 0.02 });
        // 接ぎ木：足もとに小さな実がなる
        const graft = Math.min(8, n('graft'));
        for (let i = 0; i < graft; i++) {
          const side = i % 2 ? 1 : -1;
          pawpaw(g, FX + side * (34 + Math.floor(i / 2) * 17), HZ + 3 - (Math.floor(i / 2) % 2) * 4 + Math.sin(clock * 1.3 + i) * 0.8, 17, { rot: -0.26 * side, leaf: false });
        }
        // 手袋：実を囲む金の弧
        const gl = GLOVES.reduce((a, _, i) => a + n(`glove${i}`), 0);
        for (let i = 0; i < gl; i++) {
          g.beginPath();
          g.arc(FX, FY, 72 + i * 6, Math.PI * 0.12, Math.PI * 0.4);
          g.strokeStyle = alpha(C.gold, 0.8 - i * 0.2);
          g.lineWidth = 2;
          g.lineCap = 'round';
          g.stroke();
        }

        // 手前の列：かご、苗木、荷車、圧搾機
        if (n('picker') > 0) {
          const k = tier(n('picker'), 5);
          for (let i = 0; i < k; i++) {
            const x = 30 + i * 19;
            const y = 244 + (i % 2) * 6;
            shadow(g, x, y + 8, 9, 2.5);
            poly(g, [x - 8, y, x + 8, y, x + 6, y + 8, x - 6, y + 8], lin(g, 0, y, 0, y + 8, '#c9a05a', '#7a5a2c'));
            disc(g, x - 3, y - 1, 3.2, C.leaf);
            disc(g, x + 3, y - 2, 3.2, C.leafLight);
          }
          pips(30 + (k - 1) * 9.5, 232, 'picker', s);
          count(30 + (k - 1) * 9.5, 268, n('picker'));
        }
        if (n('tree') > 0) {
          const k = tier(n('tree'), 4);
          for (let i = 0; i < k; i++) treeAt(138 + i * 13, 252 - (i % 2) * 8, 20, false);
          pips(138 + (k - 1) * 6.5, 220, 'tree', s);
          count(138 + (k - 1) * 6.5, 268, n('tree'));
        }
        if (n('cart') > 0) {
          const x = 318 + Math.sin(clock * 0.7) * 5;
          const y = 240;
          shadow(g, x, y + 13, 20, 3);
          rr(g, x - 16, y - 2, 32, 11, 2, lin(g, 0, y - 2, 0, y + 9, '#b98a4a', '#6a4a22'));
          for (let i = 0; i < 5; i++) disc(g, x - 11 + i * 5.5, y - 3 - (i % 2) * 3, 3.6, i % 2 ? C.leafLight : C.leaf);
          disc(g, x - 9, y + 11, 4.5, C.ink, C.gold, 1.4);
          disc(g, x + 9, y + 11, 4.5, C.ink, C.gold, 1.4);
          line(g, [x + 16, y + 2, x + 26, y - 4], '#b98a4a', 1.6);
          pips(x, y - 16, 'cart', s);
          count(318, 268, n('cart'));
        }
        if (n('press') > 0) {
          const x = 388;
          const y = 226;
          const d = (Math.sin(clock * 3) + 1) * 4;
          shadow(g, x, y + 28, 22, 3.5);
          rr(g, x - 18, y + 14, 36, 12, 2, lin(g, 0, y + 14, 0, y + 26, C.steel, C.steelDark));
          rr(g, x - 16, y - 6, 3, 20, 1, C.steel);
          rr(g, x + 13, y - 6, 3, 20, 1, C.steel);
          rr(g, x - 18, y - 9, 36, 4, 1.5, C.gold);
          rr(g, x - 1.5, y - 5, 3, 6 + d, 0, C.ice);
          rr(g, x - 12, y + 1 + d, 24, 4, 1, C.ice);
          disc(g, x, y + 30 + ((clock * 20) % 6), 1.6, C.gold);
          pips(x, y - 16, 'press', s);
          count(x, 268, n('press'));
        }

        // 豊作：金の粒が降る
        if (fren && Math.random() < dt * 30) bits.add(Math.random() * W, -4, 1, { color: [C.gold, C.goldLight], speed: 20, angle: Math.PI / 2, spread: 0.4, gravity: 160, life: 1.6, size: 2.4, glow: true });
        bits.draw(g, dt);

        // 金のポポー
        if (s.gold.on > 0) {
          const [gx, gy0] = goldAt(s);
          const gy = gy0 + Math.sin(clock * 3) * 4;
          g.globalAlpha = s.gold.on < 3 ? 0.35 + 0.5 * Math.abs(Math.sin(clock * 8)) : 1;
          glow(g, gx, gy, 44, C.gold, 0.6);
          pawpaw(g, gx, gy, 40, { tone: 'gold', rot: -0.26 + Math.sin(clock * 2) * 0.15 });
          sparkle(g, gx + 20, gy - 16, 5 + Math.sin(clock * 5) * 2, '#ffffff');
          g.globalAlpha = 1;
        }
      },
    };
  },
};

export default game;

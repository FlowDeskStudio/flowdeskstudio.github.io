// 融合ゲーム（ブロック崩し × 迷路探索）：塔。1 階のぼるごとに財宝は増えるが、崩れる見込みも上がる。
// 崩れたら、それまでの財宝はほとんど失う。「何階で引き返すか」を決める、欲張りと引き際の遊び。
// 荷運び（自動）、綱や保険の強化、鍵で伸ばす転生ツリー、実績を持つ。星を集めると実験できるようになる。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, poly, text, tag, glow, gem, coin, sparkle, stage, Bits, tier, calm, artOn } from '../ui/draw.js';
import { towerArtReady, drawTower } from './tower_art.js';

const MAX_FLOOR = 60;
const PREP = 6; // 1 回ごとの支度の秒数（これがあるので、すぐ引き返すより数階のぼるほうが得になる）

// 改良（1 回きり）
const CLIMBER_TIERS = [{ own: 10, cost: 300 }, { own: 50, cost: 45000 }, { own: 150, cost: 4.5e7 }];
const RETURN_TIERS = [{ n: 30, cost: 5000 }, { n: 300, cost: 5e5 }, { n: 3000, cost: 5e7 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'keypower');
const growth = (s) => 1.35 + 0.01 * treeLvl(s, 'greed'); // 1 階ごとに財宝が増える倍率
const floorTime = (s) => 3 * 0.92 ** lvl(s, 'boots'); // 1 階のぼる秒数
const safe = (s) => 2 + treeLvl(s, 'sure'); // ここまでは崩れない
// f 階へのぼるときに崩れる見込み
const risk = (s, f) => (f <= safe(s) ? 0 : Math.min(0.9, 0.04 * 0.95 ** lvl(s, 'rope') * (f - safe(s))));
const kept = (s) => 0.1 + 0.05 * lvl(s, 'insure'); // 崩れても持ち帰れる割合
// f 階まで来たときの財宝（倍率を掛ける前）
const pot = (s, f) => (f < 1 ? 0 : 10 * growth(s) ** (f - 1));
const valMult = (s, ctx) => {
  const n = lvl(s, 'climber');
  return N(n * milestoneMult(n) * 2 ** count(s, 'climber_t', CLIMBER_TIERS.length) * 2 ** count(s, 'return_t', RETURN_TIERS.length))
    .mul(Num.pow(1.2, lvl(s, 'appraise'))).mul(Num.pow(1.15, treeLvl(s, 'vault'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
};
const hasAuto = (s) => lvl(s, 'porter') > 0;

// 「f 階で引き返す」と決めたときの、1 回あたりの見込みの実入りと時間
function plan(s, f) {
  let alive = 1;
  let gain = 0;
  let time = PREP;
  for (let k = 1; k <= f; k++) {
    const p = risk(s, k);
    time += alive * floorTime(s);
    gain += alive * p * pot(s, k - 1) * kept(s); // k 階へのぼる途中で崩れた
    alive *= 1 - p;
  }
  // 目当ての階に着いてから引き返すまでに、もう 1 階ぶんの時間がかかる
  return { gain: gain + alive * pot(s, f), time: time + alive * floorTime(s), alive };
}
// 1 秒あたりがいちばん多くなる引き返す階
function bestAt(s) {
  let best = 1;
  let top = -1;
  for (let f = 1; f <= MAX_FLOOR; f++) {
    const pl = plan(s, f);
    if (pl.gain / pl.time > top) { top = pl.gain / pl.time; best = f; }
  }
  return best;
}
const target = (s) => (treeLvl(s, 'sense') > 0 ? bestAt(s) : Math.max(1, Math.min(MAX_FLOOR, s.at)));

// 引き返して、財宝を持ち帰る
function bank(s, ctx) {
  if (s.floor < 1) return null;
  const got = valMult(s, ctx).mul(pot(s, s.floor));
  earn(s, got);
  s.stats.returns = (s.stats.returns || 0) + 1;
  if (s.floor > (s.stats.high || 0)) s.stats.high = s.floor;
  s.returns++;
  s.floor = 0;
  s.prog = -PREP;
  return got;
}

// 崩れた：財宝の一部だけを持ち帰る
function collapse(s, ctx) {
  earn(s, valMult(s, ctx).mul(pot(s, s.floor) * kept(s)));
  s.stats.falls = (s.stats.falls || 0) + 1;
  s.fell = 1.2; // 画面で崩れを見せる秒数
  s.floor = 0;
  s.prog = -PREP;
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('tower.up.climber.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'tower',
  kind: 'fusion',
  parents: ['breakout', 'maze'],
  stars: 200,
  icon: '🗼',
  ppPer,
  keep: ['at'],

  // 登り手 1 人から始まる。floor はいまいる階、prog は次の階への進み（秒）、at は荷運びが引き返す階
  newState: () => ({ ...baseState(), up: { climber: 1 }, floor: 0, prog: 0, at: 5, returns: 0, fell: 0 }),

  upgrades: [
    { id: 'climber', base: 15, r: 1.15, gen: true, val: (s, ctx) => fmt(valMult(s, ctx).mul(10), 1) },
    { id: 'boots', base: 100, r: 1.9, max: 15, val: (s) => floorTime(s).toFixed(2) },
    { id: 'rope', base: 150, r: 2, max: 15 },
    { id: 'appraise', base: 250, r: 1.5 },
    { id: 'insure', base: 400, r: 3, max: 8, val: (s) => Math.round(kept(s) * 100) },
    { id: 'porter', base: 2500, r: 1, max: 1, show: (s) => s.returns >= 3 || s.amt.gte(2500) },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('climber_t', CLIMBER_TIERS, 'c.tier.n', 'tower.tier.climber', (s, tier) => lvl(s, 'climber') >= tier.own),
    ...tierUp('return_t', RETURN_TIERS, 'tower.returntier.n', 'tower.tier.return', (s, tier) => (s.stats.returns || 0) >= tier.n),
  ],

  // 鍵で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'sure', base: 2, r: 2.5, max: 5 },
    { id: 'greed', base: 3, r: 2.5, max: 5 },
    { id: 'sense', base: 15, max: 1, req: { sure: 2 } },
    { id: 'keypower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'vault', base: 20, r: 1.7, max: 20, req: { keypower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[10, 100, 1000, 10000].map((v) => ({ id: `returns${v}`, type: 'returns', v, done: (s) => (s.stats.returns || 0) >= v })),
    ...[5, 10, 15, 20, 30].map((v) => ({ id: `high${v}`, type: 'high', v, done: (s) => (s.stats.high || 0) >= v })),
    ...[1, 100].map((v) => ({ id: `falls${v}`, type: 'falls', v, done: (s) => (s.stats.falls || 0) >= v })),
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'climbers', v, done: (s) => lvl(s, 'climber') >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「顔なじみ」のぶんの登り手を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.climber = Math.max(lvl(s, 'climber'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    s.fell = Math.max(0, (s.fell || 0) - dt);
    if (hasAuto(s) && dt > 5) {
      // 長い経過：1 回あたりの見込みに、こなした回数を掛けてまとめて受け取る
      const pl = plan(s, target(s));
      const runs = dt / pl.time;
      earn(s, valMult(s, ctx).mul(pl.gain * runs));
      // 持ち帰れた回数と、崩れた回数
      s.returns += Math.floor(runs * pl.alive);
      s.stats.returns = (s.stats.returns || 0) + Math.floor(runs * pl.alive);
      s.stats.falls = (s.stats.falls || 0) + Math.floor(runs * (1 - pl.alive));
      s.stats.high = Math.max(s.stats.high || 0, target(s));
      return;
    }
    // 短い刻み：のぼり続ける。階に着くたびに、崩れるかどうかが決まる
    // 刻みの中で変わらない値は、先に求めておく（最適な階の計算は重い）
    s.prog += dt;
    const ft = floorTime(s);
    const auto = hasAuto(s);
    const goal = auto ? target(s) : 0;
    for (let i = 0; i < 200 && s.prog >= ft; i++) {
      s.prog -= ft;
      if (auto && s.floor >= goal) {
        bank(s, ctx);
        continue;
      }
      if (s.floor >= MAX_FLOOR) continue;
      if (Math.random() < risk(s, s.floor + 1)) collapse(s, ctx);
      else s.floor++;
    }
  },

  rate(s, ctx) {
    if (!hasAuto(s)) return ZERO;
    const pl = plan(s, target(s));
    return valMult(s, ctx).mul(pl.gain / pl.time);
  },

  // 引き返す
  click(s, ctx) {
    s.clicks++;
    return bank(s, ctx);
  },

  bank,
  plan,
  bestAt,
  risk,

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(1e5).pow(0.2).floor();
  },

  // 絵：夜の塔。のぼるほど財宝が増え、上の階ほど崩れやすい。登り手、靴、命綱、鑑定、保険、荷運びが絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 260;
    const GY = 236;
    const FH = 26; // 1 階の高さ
    const TX = 160;
    const TW = 120;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const status = h('div', { class: 'depth' });
    const preview = h('div', { class: 'sub' });
    const btn = h('button', { class: 'bigbtn' }, t('tower.bank'));
    const atTxt = h('span', { class: 'blowtxt' });
    const setAt = (d) => () => {
      const s = api.s();
      s.at = Math.max(1, Math.min(MAX_FLOOR, s.at + d));
    };
    const minus = h('button', { class: 'mini', onclick: setAt(-1) }, '−');
    const plus = h('button', { class: 'mini', onclick: setAt(1) }, '＋');
    const ctrl = h('div', { class: 'blowctl' }, minus, atTxt, plus);
    const wrap = h('div', { class: 'playbox' }, status, cv, preview, btn, ctrl);
    const bits = new Bits();
    let clock = 0;
    let seenFalls = -1;
    let seenReturns = -1;
    let cam = 0; // 見ている高さ（階）。登り手を追う
    const act = (ev) => {
      const got = game.click(api.s(), api.ctx());
      if (got) {
        floatText(wrap, ev, '+' + fmt(got, 1), 'big');
        se('coins');
      }
    };
    btn.addEventListener('pointerdown', act);
    cv.addEventListener('pointerdown', act);
    el.append(wrap);

    return {
      update() {
        const s = api.s();
        const next = risk(s, s.floor + 1);
        setText(status, t('tower.floor', { v: s.floor, p: Math.round(next * 100) }));
        status.dataset.st = next >= 0.3 ? 'hot' : next > 0 ? '' : 'good';
        setText(preview, s.floor < 1 ? '' : t('tower.preview', { v: fmt(valMult(s, api.ctx()).mul(pot(s, s.floor)), 1), k: fmt(valMult(s, api.ctx()).mul(pot(s, s.floor) * kept(s)), 1) }));
        btn.disabled = s.floor < 1;
        const auto = hasAuto(s);
        const tuned = treeLvl(s, 'sense') > 0;
        ctrl.hidden = !auto;
        minus.hidden = tuned;
        plus.hidden = tuned;
        setText(atTxt, t(tuned ? 'tower.atTuned' : 'tower.at', { v: target(s) }));
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const pos = s.floor + Math.max(0, Math.min(1, s.prog / floorTime(s)));
        cam += (Math.max(0, pos - 4) - cam) * Math.min(1, dt * 5);
        const shake = s.fell > 0 && !calm() ? (Math.random() - 0.5) * 8 * s.fell : 0;
        // 絵は 2 通り：素材を使う描き方（tower_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('tower') && towerArtReady()) {
          drawTower(g, { W, H, GY, FH, TX, TW, clock, cam, pos, shake, floor: s.floor, goal: hasAuto(s) ? target(s) : -1, riskOf: (f) => risk(s, f),
            ins: lvl(s, 'insure'), rope: lvl(s, 'rope'), crew: tier(lvl(s, 'climber'), 5), ct: count(s, 'climber_t', CLIMBER_TIERS.length), boots: Math.min(6, lvl(s, 'boots')), label: fmt(lvl(s, 'climber')),
            sack: { r: Math.min(44, 12 + s.floor * 2.2), gold: count(s, 'return_t', RETURN_TIERS.length) > 0, ap: Math.min(5, lvl(s, 'appraise')) } });
        } else {
          stage(g, W, H, { top: '#101c52', bottom: '#1f3fae', stars: 34, t: clock });
          disc(g, W - 70, 46 + cam * 2, 20, C.goldLight);
          glow(g, W - 70, 46 + cam * 2, 70, C.goldLight, 0.3);
          const ground = GY + cam * FH;
          if (ground < H) rr(g, 0, ground, W, H - ground, 0, lin(g, 0, ground, 0, H, '#16305a', C.ink));
          g.save();
          g.translate(shake, 0);
          // 保険：塔の足もとの網。段が上がるほど広い
          const ins = lvl(s, 'insure');
          if (ins > 0 && ground < H + 20) {
            const nw = 30 + ins * 6;
            for (const side of [-1, 1]) {
              const nx = side < 0 ? TX : TX + TW;
              g.strokeStyle = alpha(C.teal, 0.8);
              g.lineWidth = 1;
              g.beginPath();
              g.moveTo(nx, ground - 4);
              g.quadraticCurveTo(nx + side * nw * 0.5, ground + 6, nx + side * nw, ground - 14);
              g.stroke();
              for (let i = 1; i < 5; i++) line(g, [nx + side * nw * (i / 5), ground - 4 - (i / 5) * 6, nx + side * nw * (i / 5), ground + 2 - Math.abs(i - 2.5) * 1.5], alpha(C.teal, 0.5), 0.8);
              line(g, [nx + side * nw, ground - 14, nx + side * nw, ground], C.steel, 1.4);
            }
          }
          // 塔：のぼった階は窓に灯がともる。危ない階ほど赤い
          const topF = Math.ceil(cam + 10);
          const goal = hasAuto(s) ? target(s) : -1;
          for (let f = Math.max(1, Math.floor(cam)); f <= topF; f++) {
            const y = GY - (f - cam) * FH;
            const r = risk(s, f);
            const done = f <= s.floor;
            rr(g, TX, y, TW, FH - 1, 2, done ? lin(g, TX, 0, TX + TW, 0, '#4a5aa8', '#27357a') : alpha(C.steel, 0.18), alpha(C.ice, done ? 0.4 : 0.15), 1);
            if (r > 0) rr(g, TX + 1, y + 1, TW - 2, FH - 3, 2, alpha(C.rose, Math.min(0.6, r * 0.8)));
            for (const wx of [TX + 22, TX + TW / 2, TX + TW - 22]) {
              rr(g, wx - 5, y + 6, 10, 13, [5, 5, 1, 1], done ? C.goldLight : alpha(C.ink, 0.5));
              if (done) glow(g, wx, y + 12, 12, C.gold, 0.35);
            }
            text(g, String(f), TX - 30, y + FH / 2 + 4, 10, done ? C.ivory : C.muted, 'right', 600);
            if (r > 0) text(g, `${Math.round(r * 100)}%`, TX + TW + 30, y + FH / 2 + 4, 9.5, C.rose, 'left');
            // 荷運び：引き返す階に旗が立つ
            if (f === goal) {
              rr(g, TX - 2, y - 1, TW + 4, FH + 1, 3, null, C.gold, 1.6);
              line(g, [TX + TW + 6, y + FH, TX + TW + 6, y - 6], C.gold, 1.4);
              poly(g, [TX + TW + 6, y - 6, TX + TW + 22, y - 1, TX + TW + 6, y + 4], C.gold);
            }
          }
          // 命綱：塔の左に下がる綱。段が上がるほど金に近づき、結び目が増える
          const rope = lvl(s, 'rope');
          if (rope > 0) {
            const rc = mix('#b98a4a', C.goldLight, Math.min(1, rope / 15));
            line(g, [TX - 12, 0, TX - 12 + Math.sin(clock * 1.5) * 2, H], rc, 1.6);
            for (let i = 0; i < Math.min(8, rope); i++) disc(g, TX - 12, ((i * 37 + cam * FH) % H + H) % H, 2.2, rc);
          }
          // 登り手：人数で列が伸び、改良で金になる。靴の段で足もとの光が長くなる
          const cy = GY - (pos - cam) * FH;
          const crew = tier(lvl(s, 'climber'), 5);
          const ct = count(s, 'climber_t', CLIMBER_TIERS.length);
          const boots = Math.min(6, lvl(s, 'boots'));
          for (let i = crew - 1; i >= 0; i--) {
            const px = TX - 12 + Math.sin(clock * 10 + i) * 1.2;
            const py = cy - 8 + i * 13;
            if (py > H + 10) continue;
            if (i === 0) {
              for (let b = 1; b <= boots; b++) disc(g, px, py + 6 + b * 4, 2.4 * (1 - b / (boots + 1)), alpha(C.goldLight, 0.5 * (1 - b / (boots + 1))));
              glow(g, px, py, 16, C.goldLight, 0.5);
            }
            disc(g, px, py - 5, 3.6, ct >= 3 ? C.goldLight : C.ivory);
            rr(g, px - 3.5, py - 1, 7, 9, 2.5, [C.azure, C.teal, C.violet, C.gold][Math.min(3, ct)]);
          }
          g.restore();
          tag(g, `×${fmt(lvl(s, 'climber'))}`, 44, H - 16, { size: 9.5 });
          // 財宝の袋：のぼるほどふくらむ。鑑定の段で、口から宝石がのぞく
          if (s.floor > 0) {
            const r = Math.min(44, 12 + s.floor * 2.2);
            const bx = W - 96;
            const by = H - 26 - r + 10;
            const rt = count(s, 'return_t', RETURN_TIERS.length);
            glow(g, bx, by, r * 1.8, C.gold, 0.3);
            disc(g, bx, by, r, lin(g, bx - r, by - r, bx + r, by + r, rt > 0 ? C.goldLight : '#d9a85a', rt > 0 ? C.goldDark : '#6a4a22'));
            rr(g, bx - 10, by - r - 6, 20, 8, 3, rt > 0 ? C.gold : '#8a6a3a');
            const ap = Math.min(5, lvl(s, 'appraise'));
            for (let i = 0; i < ap; i++) gem(g, bx - 12 + i * 6, by - r - 10 - (i % 2) * 4, 4, [C.azure, C.rose, C.teal, C.violet, C.gold][i]);
            coin(g, bx - r * 0.3, by + r * 0.2, Math.max(4, r * 0.22));
            if (Math.floor(clock * 2) % 2 === 0) sparkle(g, bx + r * 0.5, by - r * 0.5, 5, '#ffffff');
          }
        }
        const falls = s.stats.falls || 0;
        if (seenFalls >= 0 && falls > seenFalls) bits.add(TX + TW / 2, 110, 36, { color: [C.steel, C.ice, C.rose], speed: 190, up: 40, size: 4, life: 1 });
        seenFalls = falls;
        const rets = s.stats.returns || 0;
        if (seenReturns >= 0 && rets > seenReturns) bits.add(W - 96, H - 60, 18, { color: [C.gold, C.goldLight, '#ffffff'], speed: 120, up: 90, size: 3, glow: true });
        seenReturns = rets;
        bits.draw(g, dt);
        if (s.fell > 0) {
          g.fillStyle = alpha(C.rose, Math.min(0.25, s.fell * 0.2));
          g.fillRect(0, 0, W, H);
        }
      },
    };
  },
};

export default game;

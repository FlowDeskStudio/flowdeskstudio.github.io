// 融合ゲーム（ボール落とし × クリッカー）：ジャグリング。落ちてくる玉を、手に届く瞬間に受けて投げ返す。
// ぴったりで受けると 3 倍で連続記録が伸び、連続が長いほど稼げる。外すと記録は 0 に戻る。
// 相棒（自動）は落とさず受けてくれるが、ぴったりにはならず、記録は少しずつ減る。腕で稼ぐか、任せて稼ぐか。
// うまく受けるほど観客が沸いて全体が伸び、連続の節目では決め技が出る。玉の改良、喝采で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, lin, rr, disc, line, poly, text, tag, glow, sparkle, meter, stage, pawpaw, Bits, tier, artOn } from '../ui/draw.js';
import { juggleArtReady, drawJuggle } from './juggle_art.js';

const GOOD = 0.2; // 手に届く瞬間（位相 1）から、この幅までは「受けた」
const LATE = 1 + GOOD; // これを過ぎると落とす
const Q = { perfect: 3, good: 1, miss: 0.2 };
// 観客：うまく受けると沸き、放っておくと冷める。沸いているほど全体が伸びる（最大 3 倍）
const CROWD = { perfect: 3, good: 1, drain: 0.5, cool: 0.02, max: 100 };
const TRICK_EVERY = 5; // 連続がこの数の倍数に届くたびに決め技
const TRICK_PAY = 5; // 決め技：連続の数 × これだけの回数ぶんの拍手

// 改良（1 回きり）
const BALL_TIERS = [{ own: 10, cost: 250 }, { own: 50, cost: 37500 }, { own: 150, cost: 3.75e7 }];
const PERFECT_TIERS = [{ n: 50, cost: 3000 }, { n: 500, cost: 3e5 }, { n: 5000, cost: 3e7 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'ovationpower');
const cycle = (s) => 1.6 / (1 + 0.08 * lvl(s, 'tempo')); // 1 投げにかかる秒数
const perfectWin = (s) => 0.06 + 0.01 * lvl(s, 'focus') + 0.01 * treeLvl(s, 'widewindow');
const streakCap = (s) => 10 + 5 * lvl(s, 'nerve');
const streakFloor = (s) => 5 * treeLvl(s, 'keepstreak'); // 相棒が受けても、連続はここまでしか減らない
const hasAuto = (s) => lvl(s, 'partner') > 0;
const crowdMult = (s) => 1 + (2 * s.crowd) / CROWD.max;
// 観客の沸きを除いた、1 回受けるごとの拍手
const base = (s, ctx) => {
  const n = lvl(s, 'ball');
  return N(n * milestoneMult(n) * 2 ** count(s, 'ball_t', BALL_TIERS.length) * 2 ** count(s, 'perfect_t', PERFECT_TIERS.length))
    .mul(Num.pow(1.15, lvl(s, 'flair'))).mul(Num.pow(1.15, treeLvl(s, 'encore'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
};
const streakMult = (s) => 1 + 0.1 * Math.min(s.streak, streakCap(s));
// 相棒が 1 回受けるごとに観客へ足す量（ツリー「見せ上手」で増える）
const partnerCheer = (s) => CROWD.good + 2 * treeLvl(s, 'showman');
// 相棒任せで落ち着く観客の沸き
const crowdSteady = (s) => Math.max(0, Math.min(CROWD.max, (partnerCheer(s) / cycle(s) - CROWD.drain) / CROWD.cool));

function cheer(s, amount) {
  s.crowd = Math.min(CROWD.max, s.crowd + amount);
  if (s.crowd >= CROWD.max) s.stats.packed = 1;
}

// 直近に計算が進んだ時刻。画面とクリック判定は、ここからの経過を足してなめらかにする
let stamp = 0;
const phaseNow = (s) => s.phase + (performance.now() - stamp) / 1000 / cycle(s);

function settle(s, ctx, q) {
  let got = base(s, ctx).mul(streakMult(s) * Q[q] * crowdMult(s));
  let trick = false;
  if (q === 'perfect') {
    s.streak = Math.min(streakCap(s), s.streak + 1);
    s.stats.perfects = (s.stats.perfects || 0) + 1;
    cheer(s, CROWD.perfect);
    // 決め技：連続の節目で、まとまった拍手
    if (s.streak % TRICK_EVERY === 0) {
      trick = true;
      s.stats.tricks = (s.stats.tricks || 0) + 1;
      got = got.add(base(s, ctx).mul(s.streak * TRICK_PAY * crowdMult(s)));
    }
  } else if (q === 'good') {
    cheer(s, CROWD.good);
  } else {
    s.streak = 0;
  }
  if (s.streak > (s.stats.best || 0)) s.stats.best = s.streak;
  earn(s, got);
  s.phase = 0;
  stamp = performance.now();
  return { got, trick };
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('juggle.up.ball.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'juggle',
  kind: 'fusion',
  parents: ['clicker', 'drop'],
  icon: '🤹',
  ppPer,

  // 玉 1 つから始まる。phase は投げてからの進み（1 で手に届く）、crowd は観客の沸き（0〜100）
  newState: () => ({ ...baseState(), up: { ball: 1 }, phase: 0, streak: 0, best: 0, crowd: 0 }),

  upgrades: [
    { id: 'ball', base: 12, r: 1.15, gen: true, val: (s, ctx) => fmt(base(s, ctx), 1) },
    { id: 'flair', base: 200, r: 1.4 },
    { id: 'nerve', base: 150, r: 2.5, max: 18, val: (s) => String(streakCap(s)) },
    { id: 'focus', base: 300, r: 2, max: 8 },
    { id: 'tempo', base: 400, r: 1.8, max: 15, val: (s) => cycle(s).toFixed(2) },
    { id: 'partner', base: 1200, r: 1, max: 1, show: (s) => s.life.gte(200) || s.amt.gte(1200) },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('ball_t', BALL_TIERS, 'c.tier.n', 'juggle.tier.ball', (s, tier) => lvl(s, 'ball') >= tier.own),
    ...tierUp('perfect_t', PERFECT_TIERS, 'juggle.perfecttier.n', 'juggle.tier.perfect', (s, tier) => (s.stats.perfects || 0) >= tier.n),
  ],

  // 喝采で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'widewindow', base: 2, r: 2.5, max: 4 },
    { id: 'keepstreak', base: 3, r: 3, max: 3 },
    { id: 'showman', base: 5, r: 3, max: 3 },
    { id: 'ovationpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'encore', base: 20, r: 1.7, max: 20, req: { ovationpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[10, 100, 1000, 10000].map((v) => ({ id: `perfects${v}`, type: 'perfects', v, done: (s) => (s.stats.perfects || 0) >= v })),
    ...[10, 25, 50, 100].map((v) => ({ id: `streak${v}`, type: 'streak', v, done: (s) => (s.stats.best || 0) >= v })),
    ...[10, 100].map((v) => ({ id: `tricks${v}`, type: 'tricks', v, done: (s) => (s.stats.tricks || 0) >= v })),
    { id: 'packed', type: 'packed', v: 100, done: (s) => !!s.stats.packed },
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'jballs', v, done: (s) => lvl(s, 'ball') >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「持ち玉」のぶんの玉を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.ball = Math.max(lvl(s, 'ball'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    s.phase += dt / cycle(s);
    stamp = performance.now();
    if (!hasAuto(s)) {
      // 観客は冷めていく
      s.crowd = Math.max(0, s.crowd - (CROWD.drain + CROWD.cool * s.crowd) * dt);
      // 受けなければ落ちる。記録は 0 に戻り、次の玉が上がる
      if (s.phase >= LATE) {
        s.streak = 0;
        s.phase %= LATE;
      }
      return;
    }
    // 相棒は手に届いた瞬間に受ける。記録は 1 ずつ減る
    let throws = Math.floor(s.phase);
    s.phase -= throws;
    const b = base(s, ctx);
    const floor = Math.min(streakFloor(s), streakCap(s));
    if (dt > 5) {
      // 長い経過：観客は相棒任せの落ち着く先へ、記録は下限まで下がったものとして集計する
      s.crowd = crowdSteady(s);
      s.streak = Math.min(s.streak, floor);
      earn(s, b.mul(throws * streakMult(s) * crowdMult(s)));
      return;
    }
    s.crowd = Math.max(0, s.crowd - (CROWD.drain + CROWD.cool * s.crowd) * dt);
    for (; throws > 0; throws--) {
      earn(s, b.mul(streakMult(s) * crowdMult(s)));
      if (s.streak > floor) s.streak--;
      cheer(s, partnerCheer(s));
    }
  },

  rate: (s, ctx) => (hasAuto(s) ? base(s, ctx).mul((1 + 0.1 * Math.min(streakFloor(s), streakCap(s))) * (1 + (2 * crowdSteady(s)) / CROWD.max)).div(cycle(s)) : ZERO),

  // 受ける。手に届く瞬間との近さで出来が決まる
  click(s, ctx) {
    s.clicks++;
    const d = Math.abs(phaseNow(s) - 1);
    const q = d <= perfectWin(s) ? 'perfect' : d <= GOOD ? 'good' : 'miss';
    const r = settle(s, ctx, q);
    if (s.streak > s.best) s.best = s.streak;
    return { q, got: r.got, trick: r.trick };
  },

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(1e5).pow(0.2).floor();
  },

  // 絵：夜の舞台。左手から右手へ実を投げ、手に届く瞬間に受ける。玉の数、華、度胸、集中、テンポ、相棒が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 250;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const streak = h('div', { class: 'depth' });
    const crowdBar = h('div', { class: 'bar wide' }, h('i'));
    const crowdTxt = h('div', { class: 'sub' });
    const btn = h('button', { class: 'bigbtn' }, t('juggle.catch'));
    const wrap = h('div', { class: 'playbox' }, streak, cv, h('div', { class: 'crowd' }, crowdTxt, crowdBar), btn);
    let flash = null; // { q, age, trick }
    const bits = new Bits();
    let clock = 0;
    const X0 = 130;
    const X1 = W - 130;
    const HAND = H - 62;
    const act = (ev) => {
      const r = game.click(api.s(), api.ctx());
      flash = { q: r.q, age: 0, trick: r.trick };
      if (r.q === 'perfect' || r.trick) bits.add(X1, HAND, r.trick ? 30 : 12, { color: [C.gold, C.goldLight, '#ffffff'], speed: 150, up: 90, size: 3, glow: true });
      floatText(wrap, ev, '+' + fmt(r.got, 1), r.trick ? 'big' : '');
      se(r.trick ? 'bonus' : r.q === 'perfect' ? 'chime' : 'toss');
    };
    cv.addEventListener('pointerdown', act);
    btn.addEventListener('pointerdown', act);
    el.append(wrap);

    const hand = (x, y, gold) => {
      rr(g, x - 16, y + 16, 32, 7, 3.5, gold ? lin(g, 0, y + 16, 0, y + 23, C.goldLight, C.goldDark) : lin(g, 0, y + 16, 0, y + 23, C.ivory, C.steel));
      rr(g, x - 3, y + 23, 6, 16, 2, gold ? C.goldDark : C.steelDark);
    };

    return {
      update() {
        const s = api.s();
        setText(streak, t('juggle.streak', { v: s.streak, max: streakCap(s), m: streakMult(s).toFixed(1) }));
        streak.dataset.st = s.streak >= streakCap(s) ? 'good' : '';
        crowdBar.firstChild.style.width = `${s.crowd}%`;
        setText(crowdTxt, t('juggle.crowd', { v: Math.round(s.crowd), m: crowdMult(s).toFixed(2) }));
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const p = Math.min(LATE + 0.1, phaseNow(s));
        const heat = s.crowd / CROWD.max;
        const pt = count(s, 'perfect_t', PERFECT_TIERS.length);
        // 絵は 2 通り：素材を使う描き方（juggle_art.js）と、図形だけの旧い描き方（else の中）
        if (artOn('juggle') && juggleArtReady()) {
          drawJuggle(g, {
            W, H, X0, X1, HAND, clock, p, heat, trim: pt, lamps: Math.min(20, streakCap(s) / 5), streak: s.streak, win: perfectWin(s),
            partner: hasAuto(s), tempo: lvl(s, 'tempo'), fruitTier: count(s, 'ball_t', BALL_TIERS.length), extra: tier(lvl(s, 'ball'), 6) - 1,
            flair: Math.min(10, lvl(s, 'flair')), label: fmt(lvl(s, 'ball')),
            arc: (q) => [X0 + (X1 - X0) * Math.min(1, q), q <= 1 ? HAND - 150 * 4 * q * (1 - q) : HAND + (q - 1) * 260],
          });
        } else {
        // 舞台：幕、床、照明（客席が沸くほど明るい）
        stage(g, W, H, { top: '#16267a', bottom: '#0b1438', horizon: H - 38, floor: '#1a2050', floorEnd: C.ink });
        for (const side of [0, 1]) {
          const x0 = side ? W - 54 : 0;
          g.fillStyle = lin(g, x0, 0, x0 + 54, 0, side ? '#1f3fae' : '#0e1a4a', side ? '#0e1a4a' : '#1f3fae');
          g.fillRect(x0, 0, 54, H - 38);
          for (let i = 0; i < 4; i++) rr(g, x0 + 6 + i * 13, 0, 2, H - 38, 0, alpha(C.ink, 0.25));
        }
        rr(g, 0, 0, W, 12, 0, lin(g, 0, 0, 0, 12, '#2f55d4', '#16267a'));
        for (let i = 0; i < 12; i++) poly(g, [i * 40, 12, i * 40 + 40, 12, i * 40 + 20, 24], '#1f3fae');
        rr(g, 0, H - 38, W, 1.5 + pt, 0, C.gold);
        for (const lx of [150, W - 150]) {
          g.fillStyle = lin(g, 0, 12, 0, H - 38, alpha(C.goldLight, 0.08 + heat * 0.12), alpha(C.goldLight, 0));
          g.beginPath();
          g.moveTo(lx - 8, 12);
          g.lineTo(lx + 8, 12);
          g.lineTo(W / 2 + (lx < W / 2 ? 90 : -90) + 70, H - 38);
          g.lineTo(W / 2 + (lx < W / 2 ? 90 : -90) - 70, H - 38);
          g.fill();
        }
        // 度胸：連続の上限まで、舞台の上に灯が並ぶ。いまの連続のぶんが点く
        const cap2 = streakCap(s);
        const lamps = Math.min(20, cap2 / 5);
        for (let i = 0; i < lamps; i++) {
          const on = s.streak >= (i + 1) * 5;
          const lx = W / 2 + (i - (lamps - 1) / 2) * 14;
          if (on) glow(g, lx, 34, 8, C.gold, 0.7);
          disc(g, lx, 34, 2.6, on ? C.goldLight : alpha(C.ice, 0.2));
        }
        // 受ける位置：外の輪が「受けられる」、内の金の輪が「ぴったり」（集中で太くなる）
        const win = perfectWin(s);
        disc(g, X1, HAND, 26, null, alpha(C.ice, 0.3), 1.2);
        disc(g, X1, HAND, 15, null, C.gold, 2 + win * 60);
        hand(X0, HAND, false);
        hand(X1, HAND, hasAuto(s));
        // テンポ：左のメトロノーム。段が上がるほど速く振れる
        const tp = lvl(s, 'tempo');
        if (tp > 0) {
          const mx = 78;
          const my = H - 40;
          poly(g, [mx - 10, my, mx + 10, my, mx + 4, my - 34, mx - 4, my - 34], lin(g, 0, my - 34, 0, my, '#3a4a8a', '#1a2050'));
          const a = Math.sin((p * Math.PI * 2)) * 0.5;
          line(g, [mx, my - 4, mx + Math.sin(a) * 30, my - 4 - Math.cos(a) * 30], C.gold, 1.4);
          disc(g, mx + Math.sin(a) * 20, my - 4 - Math.cos(a) * 20, 3, C.goldLight);
          tag(g, `Lv ${tp}`, mx, my - 44, { size: 8.5 });
        }
        // 玉：数が増えるほど、控えの実が弧に並ぶ。改良で金の実になる
        const bt = count(s, 'ball_t', BALL_TIERS.length);
        const tone = bt >= 3 ? 'gold' : bt >= 1 ? 'ripe' : 'green';
        const extra = tier(lvl(s, 'ball'), 6) - 1;
        const arc = (q) => [X0 + (X1 - X0) * Math.min(1, q), q <= 1 ? HAND - 150 * 4 * q * (1 - q) : HAND + (q - 1) * 260];
        for (let i = 1; i <= extra; i++) {
          const q = (p + i / (extra + 1)) % 1;
          const [ex, ey] = arc(q);
          g.globalAlpha = 0.45;
          pawpaw(g, ex, ey, 18, { tone, rot: clock * 4 + i });
          g.globalAlpha = 1;
        }
        // 華：実のうしろに光の尾が伸びる
        const fl = Math.min(10, lvl(s, 'flair'));
        for (let i = 1; i <= fl; i++) {
          const [tx, ty] = arc(Math.max(0, p - i * 0.022));
          disc(g, tx, ty, 5 * (1 - i / (fl + 1)), alpha(C.goldLight, 0.45 * (1 - i / (fl + 1))));
        }
        const [x, y] = arc(p);
        glow(g, x, y, 26, C.gold, 0.35 + heat * 0.3);
        pawpaw(g, x, y, 32, { tone, rot: clock * 5 });
        tag(g, `×${fmt(lvl(s, 'ball'))}`, X0, HAND - 14, { size: 9 });
        // 客席：沸くほど頭が増えて、よく弾む
        const heads = Math.round(heat * 22);
        for (let i = 0; i < heads; i++) {
          const hx = 12 + ((i * 7) % 22) * ((W - 24) / 21);
          const hy = H - 2 - Math.abs(Math.sin(clock * (4 + (i % 3)) + i)) * (3 + heat * 7);
          g.fillStyle = [C.navy, '#22368a', C.royal, '#1a2c7c'][i % 4];
          g.beginPath();
          g.arc(hx, hy, 10, Math.PI, 0);
          g.closePath();
          g.fill();
          line(g, [hx - 7, hy - 7, hx, hy - 10, hx + 7, hy - 7], alpha(C.sky, 0.5), 1);
        }
        meter(g, W / 2 - 60, H - 8, 120, heat, C.gold, 3);
        }
        bits.draw(g, dt);
        if (flash) {
          flash.age += dt;
          g.globalAlpha = Math.max(0, 1 - flash.age / 0.7);
          if (flash.q === 'perfect' || flash.trick) sparkle(g, W / 2, 64, 30 * (1 - flash.age / 0.7), C.goldLight, 0.5);
          text(g, t(flash.trick ? 'juggle.q.trick' : `juggle.q.${flash.q}`), W / 2, 72 - flash.age * 14, flash.trick ? 24 : 20, flash.q === 'perfect' ? C.goldLight : flash.q === 'good' ? C.ivory : C.rose, 'center', 800);
          g.globalAlpha = 1;
          if (flash.age > 0.7) flash = null;
        }
      },
    };
  },
};

export default game;

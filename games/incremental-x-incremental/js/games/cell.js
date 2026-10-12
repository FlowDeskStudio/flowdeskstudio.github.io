// 基本ゲーム7：細胞増殖。培養皿の細胞は、少ないうちは倍々に増え、満杯に近づくと増えなくなる。
// いちばんよく増えるのは半分くらいのとき。採りすぎると増える元手がなくなり、採らなければ満杯で止まる。
// 「増える分だけ採る」頃合いを保つ遊び。
// ちょうどよい量を保っていると変異が起き、2 つの性質からどちらかを選んで伸ばす。改良、株で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, tag, glow, sparkle, stage, Bits, tier, artOn } from '../ui/draw.js';
import { cellArtReady, drawCell } from './cell_art.js';

const MIN = 0.002; // 採りつくしても、わずかに残る（絶滅はしない）
const TAKE = 0.3; // 手で採る割合
const DOTS = 140;

// 変異で伸びる性質
const TRAITS = ['growth', 'size', 'dense', 'yield'];
const TRAIT_STEP = { growth: 0.15, size: 0.2, dense: 0.15, yield: 0.1 };
const MUT_BASE = 90; // 最初の変異までに、ちょうどよい量を保つ秒数
const mut = (s, k) => s.mut[k] || 0;
const mutCount = (s) => TRAITS.reduce((a, k) => a + mut(s, k), 0);
const mutEvery = (s) => MUT_BASE * 1.25 ** mutCount(s) * 0.9 ** treeLvl(s, 'fastmut');
// 次に選べる 2 つの性質（変異のたびに組み合わせが巡る）
const offerOf = (n) => [TRAITS[n % 4], TRAITS[(n + 1 + (Math.floor(n / 4) % 3)) % 4]];
// ちょうどよい量の幅（ツリーで広がる）
const goodLo = (s) => 0.4 - 0.02 * treeLvl(s, 'widezone');
const goodHi = (s) => 0.65 + 0.03 * treeLvl(s, 'widezone');
const inGood = (s, x = s.x) => x >= goodLo(s) && x <= goodHi(s);

// 改良（1 回きり）
const FLASK_TIERS = [{ own: 10, cost: 250 }, { own: 50, cost: 37500 }, { own: 150, cost: 3.75e7 }];
const MUT_TIERS = [{ n: 5, cost: 3000 }, { n: 15, cost: 3e5 }, { n: 30, cost: 3e7 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'strainpower');
// 細胞の量は「皿に対する割合 x（0〜1）」で持ち、皿の大きさは倍率として実入りへ掛ける
const growth = (s) => 0.08 * (1 + 0.1 * lvl(s, 'medium')) * (1 + TRAIT_STEP.growth * mut(s, 'growth')); // 少ないときに 1 秒で増える割合
const capacity = (s) => {
  const n = lvl(s, 'flask');
  return N(100 * n * milestoneMult(n) * 2 ** count(s, 'flask_t', FLASK_TIERS.length) * (1 + TRAIT_STEP.dense * mut(s, 'dense')))
    .mul(Num.pow(1.15, lvl(s, 'broth'))).mul(Num.pow(1.15, treeLvl(s, 'bioreactor')));
};
const valMult = (s, ctx) => Num.pow(1.15, lvl(s, 'enzyme')).mul(2 ** count(s, 'mut_t', MUT_TIERS.length) * (1 + TRAIT_STEP.size * mut(s, 'size')))
  .mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const hasAuto = (s) => lvl(s, 'harvester') > 0;
const pull = (s) => (hasAuto(s) ? (growth(s) * s.h) / 100 : 0); // 自動採取が 1 秒に採る割合
const autoYield = (s) => 1 + TRAIT_STEP.yield * mut(s, 'yield'); // 自動採取の採れ高

function pick(s, k) {
  if (!s.offer) return false;
  const [a, b] = offerOf(s.stats.muts || 0);
  if (k !== a && k !== b) return false;
  s.mut[k] = mut(s, k) + 1;
  s.stats.muts = (s.stats.muts || 0) + 1;
  s.offer = false;
  s.mutIn = mutEvery(s);
  return true;
}

const tierUp = (base, prefix, tiers, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr('c.tier.n', { g: tr(`cell.up.${base}.n`), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'cell',
  kind: 'base',
  icon: '🧫',
  ppPer,
  keep: ['h'],
  unlock: { choice: true },

  // フラスコ 1 本から始まる。h は自動採取の強さ（増える速さに対する %）、mut は今回の周で伸ばした性質
  newState: () => ({ ...baseState(), up: { flask: 1 }, x: MIN, h: 50, mut: {}, mutIn: MUT_BASE, offer: false }),

  upgrades: [
    { id: 'flask', base: 12, r: 1.15, gen: true, val: (s) => fmt(capacity(s)) },
    { id: 'broth', base: 100, r: 1.7 },
    { id: 'medium', base: 150, r: 1.5, max: 30, val: (s) => (growth(s) * 100).toFixed(1) },
    { id: 'enzyme', base: 200, r: 2.2 },
    { id: 'harvester', base: 800, r: 1, max: 1, show: (s) => s.life.gte(150) || s.amt.gte(800) },
    ...tierUp('flask', 'flask_t', FLASK_TIERS, 'cell.tier.flask', (s, tier) => lvl(s, 'flask') >= tier.own),
    ...tierUp('enzyme', 'mut_t', MUT_TIERS, 'cell.tier.mut', (s, tier) => (s.stats.muts || 0) >= tier.n),
  ],

  // 株で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'fastmut', base: 2, r: 2.5, max: 5 },
    { id: 'widezone', base: 3, r: 2.5, max: 5 },
    { id: 'instinct', base: 15, max: 1, req: { fastmut: 2 } },
    { id: 'strainpower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'bioreactor', base: 20, r: 1.7, max: 20, req: { strainpower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[5, 25, 100].map((v) => ({ id: `muts${v}`, type: 'muts', v, done: (s) => (s.stats.muts || 0) >= v })),
    { id: 'traits', type: 'traits', v: 3, done: (s) => TRAITS.every((k) => mut(s, k) >= 3) },
    ...[600, 3600].map((v) => ({ id: `steady${v}`, type: 'steady', v: v / 60, done: (s) => (s.stats.good || 0) >= v })),
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'flasks', v, done: (s) => lvl(s, 'flask') >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「種菌」のぶんのフラスコを持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.flask = Math.max(lvl(s, 'flask'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    const r = growth(s);
    const hh = pull(s);
    // 直近は細かく追い、長い経過の残りは落ち着く先の量で集計する
    const fine = Math.min(dt, 120);
    const n = Math.max(1, Math.min(240, Math.ceil(fine / 0.5)));
    const step = fine / n;
    let taken = 0;
    let good = 0;
    for (let i = 0; i < n; i++) {
      // 増え方 dx/dt = r·x·(1 - x) - h·x を、採取ぶんを除いた形で解く
      const k = r - hh;
      const cap = k > 0 ? k / r : 0;
      const next = cap > 0 ? cap / (1 + (cap / s.x - 1) * Math.exp(-k * step)) : s.x * Math.exp(k * step);
      taken += hh * ((s.x + next) / 2) * step;
      s.x = Math.max(MIN, next);
      if (inGood(s)) good += step;
    }
    if (dt > fine) {
      const steady = hh < r ? 1 - hh / r : MIN;
      s.x = Math.max(MIN, steady);
      taken += hh * steady * (dt - fine);
      if (inGood(s)) good += dt - fine;
    }
    if (taken > 0) earn(s, capacity(s).mul(valMult(s, ctx)).mul(taken * autoYield(s)));

    // 変異：ちょうどよい量を保った時間がたまると起きる。選ぶまで次は進まない
    s.stats.good = (s.stats.good || 0) + good;
    if (!s.offer) {
      s.mutIn -= good;
      if (s.mutIn <= 0) s.offer = true;
    }
    // 本能：出た 2 つのうち、伸びていないほうを自動で選ぶ。長い経過のあいだは続けて何度も起きる
    for (let i = 0; i < 50 && s.offer && treeLvl(s, 'instinct') > 0; i++) {
      const carry = s.mutIn;
      const [a, b] = offerOf(s.stats.muts || 0);
      pick(s, mut(s, a) <= mut(s, b) ? a : b);
      s.mutIn += carry;
      if (s.mutIn <= 0) s.offer = true;
    }
  },

  rate: (s, ctx) => capacity(s).mul(valMult(s, ctx)).mul(pull(s) * s.x * autoYield(s)),

  // 手で 3 割を採る
  click(s, ctx) {
    s.clicks++;
    const got = capacity(s).mul(valMult(s, ctx)).mul(s.x * TAKE);
    s.x = Math.max(MIN, s.x * (1 - TAKE));
    earn(s, got);
    return got;
  },

  pick,
  offer: (s) => (s.offer ? offerOf(s.stats.muts || 0) : null),

  prestigeTotal(s) {
    if (s.life.lt(1e6)) return ZERO;
    return s.life.div(1e6).pow(0.2).floor();
  },

  // 絵：研究室の培養皿。細胞が増えたり減ったりする。フラスコ、培養液、培地、酵素、採取機が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 280;
    const CX = 150;
    const CY = 140;
    const R = 116;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const dots = Array.from({ length: DOTS }, (_, i) => {
      const a = i * 2.39996;
      const rad = Math.sqrt((i + 0.5) / DOTS) * (R - 24);
      return [CX + Math.cos(a) * rad, CY + Math.sin(a) * rad, 4.4 + (i % 3)];
    });
    const status = h('div', { class: 'depth' });
    const amount = h('div', { class: 'sub' });
    const btn = h('button', { class: 'bigbtn' }, t('cell.take'));
    const hTxt = h('span', { class: 'blowtxt' });
    const setH = (d) => () => {
      const s = api.s();
      s.h = Math.max(0, Math.min(95, s.h + d));
    };
    const ctrl = h('div', { class: 'blowctl' }, h('button', { class: 'mini', onclick: setH(-5) }, '−'), hTxt, h('button', { class: 'mini', onclick: setH(5) }, '＋'));
    const mutBar = h('div', { class: 'bar wide' }, h('i'));
    const mutTxt = h('div', { class: 'sub' });
    const choices = [0, 1].map(() => h('button', { class: 'btn primary' }));
    const choiceRow = h('div', { class: 'row center' }, choices);
    choices.forEach((b, i) => b.addEventListener('click', () => {
      const o = game.offer(api.s());
      if (o && pick(api.s(), o[i])) se('bonus');
    }));
    const traits = h('div', { class: 'sub' });
    const mutBox = h('div', { class: 'orderbox' }, mutTxt, mutBar, choiceRow, traits);
    const wrap = h('div', { class: 'playbox' }, status, cv, amount, btn, ctrl, mutBox);
    const take = (ev) => {
      floatText(wrap, ev, '+' + fmt(game.click(api.s(), api.ctx()), 1));
      se('glass');
    };
    btn.addEventListener('pointerdown', take);
    cv.addEventListener('pointerdown', take);
    el.append(wrap);
    const bits = new Bits();
    const HUES = [C.teal, C.leaf, C.sky, C.violet, C.rose, C.amber];
    let clock = 0;
    let shown = 0; // 見せている細胞の数（増減をなめらかに追う）

    // フラスコ：培養液の段が上がるほど、中身が増えて色が濃くなる
    const flask = (x, y, sz, fill, col, caps) => {
      g.save();
      g.beginPath();
      g.moveTo(x - sz * 0.16, y - sz);
      g.lineTo(x + sz * 0.16, y - sz);
      g.lineTo(x + sz * 0.16, y - sz * 0.55);
      g.lineTo(x + sz * 0.5, y);
      g.lineTo(x - sz * 0.5, y);
      g.lineTo(x - sz * 0.16, y - sz * 0.55);
      g.closePath();
      g.fillStyle = alpha(C.ice, 0.12);
      g.fill();
      g.clip();
      g.fillStyle = lin(g, 0, y - sz * fill * 0.7, 0, y, mix(col, '#ffffff', 0.3), col);
      g.fillRect(x - sz, y - sz * 0.7 * fill, sz * 2, sz);
      g.restore();
      line(g, [x - sz * 0.16, y - sz, x - sz * 0.16, y - sz * 0.55, x - sz * 0.5, y, x + sz * 0.5, y, x + sz * 0.16, y - sz * 0.55, x + sz * 0.16, y - sz], alpha(C.ice, 0.7), 1);
      rr(g, x - sz * 0.22, y - sz - 2, sz * 0.44, 3, 1, caps > 0 ? C.gold : C.steel);
    };

    return {
      update() {
        const s = api.s();
        const key = s.x < 0.25 ? 'low' : s.x < goodLo(s) ? 'rising' : s.x <= goodHi(s) ? 'good' : s.x <= 0.88 ? 'crowded' : 'full';
        setText(status, t(`cell.st.${key}`));
        status.dataset.st = key === 'good' ? 'good' : key === 'low' || key === 'full' ? 'hot' : '';
        setText(amount, t('cell.amount', { v: fmt(capacity(s).mul(s.x)), max: fmt(capacity(s)), p: Math.round(s.x * 100) }));
        ctrl.hidden = !hasAuto(s);
        setText(hTxt, t('cell.auto', { v: s.h }));
        const o = game.offer(s);
        mutBox.classList.toggle('active', !!o);
        choiceRow.hidden = !o;
        mutBar.hidden = !!o;
        if (o) {
          setText(mutTxt, t('cell.mutPick'));
          choices.forEach((b, i) => setText(b, t(`cell.trait.${o[i]}`, { v: Math.round(TRAIT_STEP[o[i]] * 100) })));
        } else {
          setText(mutTxt, t(key === 'good' ? 'cell.mutWait' : 'cell.mutPaused', { t: fmtTime(Math.ceil(Math.max(0, s.mutIn))) }));
          mutBar.firstChild.style.width = `${Math.max(0, Math.min(100, (1 - s.mutIn / mutEvery(s)) * 100))}%`;
        }
        setText(traits, mutCount(s) ? TRAITS.filter((k) => mut(s, k)).map((k) => `${t(`cell.trait.${k}.n`)} ${mut(s, k)}`).join(' ／ ') : '');
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const good = inGood(s);
        const col = HUES[mutCount(s) % HUES.length];
        const col2 = HUES[(mutCount(s) + 1) % HUES.length];
        // 絵は 2 通り：描き込んだ描き方（cell_art.js）と、簡素な旧い描き方（この下）
        if (artOn('cell') && cellArtReady()) {
          const want = Math.max(1, Math.round(s.x * DOTS));
          if (shown - want > DOTS * 0.08) {
            for (let i = want; i < Math.min(shown, want + 24); i++) bits.add(dots[i][0], dots[i][1], 1, { color: col, size: 3.4, speed: 90, life: 0.6, to: [CX, H + 20], glow: true });
            shown = want;
          }
          shown += Math.sign(want - shown) * Math.min(Math.abs(want - shown), Math.max(1, dt * 60));
          drawCell(g, {
            W, H, CX, CY, R, clock, dots, n: Math.min(DOTS, Math.round(shown)), col, col2, good, x: s.x, lo: goodLo(s), hi: goodHi(s),
            med: lvl(s, 'medium'), enz: lvl(s, 'enzyme'), big: 1 + Math.min(0.5, mut(s, 'size') * 0.05), auto: hasAuto(s), pull: s.h,
            flasks: fmt(lvl(s, 'flask')), flaskShown: tier(lvl(s, 'flask'), 8), flaskTier: count(s, 'flask_t', FLASK_TIERS.length),
            broth: Math.min(1, 0.25 + lvl(s, 'broth') * 0.05), offer: s.offer,
          });
          bits.draw(g, dt);
          return;
        }
        stage(g, W, H, { top: '#16267a', bottom: C.ink });
        // 培養皿：培地の段が上がるほど、底が明るく、泡が増える
        const med = lvl(s, 'medium');
        glow(g, CX, CY, R + 40, good ? C.gold : C.azure, 0.3);
        disc(g, CX, CY, R, lin(g, CX - R, CY - R, CX + R, CY + R, '#1c2f86', '#070d26'), alpha(C.ice, 0.55), 1.5);
        disc(g, CX, CY, R - 16, alpha(col, 0.06 + Math.min(0.14, med * 0.006)));
        for (let i = 0; i < Math.min(14, med); i++) {
          const a = i * 1.7 + clock * 0.2;
          const rad = (R - 30) * ((i * 37) % 100) / 100;
          const up = (clock * 0.4 + i * 0.13) % 1;
          disc(g, CX + Math.cos(a) * rad, CY + Math.sin(a) * rad - up * 8, 1.2 + up * 1.6, null, alpha(C.ice, 0.4 * (1 - up)), 0.8);
        }
        // ふちの目盛り：金の帯が「ちょうどよい量」、明るい弧がいまの量
        const ang = (v) => -Math.PI / 2 + v * Math.PI * 2;
        g.lineCap = 'butt';
        g.lineWidth = 6;
        g.strokeStyle = alpha(C.ice, 0.12);
        g.beginPath();
        g.arc(CX, CY, R - 8, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = alpha(C.gold, 0.55);
        g.beginPath();
        g.arc(CX, CY, R - 8, ang(goodLo(s)), ang(goodHi(s)));
        g.stroke();
        g.lineWidth = 2.4;
        g.lineCap = 'round';
        g.strokeStyle = good ? C.goldLight : C.rose;
        g.beginPath();
        g.arc(CX, CY, R - 8, ang(0), ang(Math.min(1, s.x)));
        g.stroke();
        const ea = ang(Math.min(1, s.x));
        disc(g, CX + Math.cos(ea) * (R - 8), CY + Math.sin(ea) * (R - 8), 4, '#ffffff');
        // 細胞：変異を重ねると色が移り、「大型化」で粒が大きくなる。酵素でつやが出る
        const target = Math.max(1, Math.round(s.x * DOTS));
        if (shown - target > DOTS * 0.08) {
          for (let i = target; i < Math.min(shown, target + 24); i++) bits.add(dots[i][0], dots[i][1], 1, { color: col, size: 3.4, speed: 90, life: 0.6, to: [CX, H + 20], glow: true });
          shown = target;
        }
        shown += Math.sign(target - shown) * Math.min(Math.abs(target - shown), Math.max(1, dt * 60));
        const n = Math.min(DOTS, Math.round(shown));
        const big = 1 + Math.min(0.5, mut(s, 'size') * 0.05);
        const enz = lvl(s, 'enzyme');
        for (let i = 0; i < n; i++) {
          const born = i >= n - 3 ? 0.6 + 0.4 * Math.abs(Math.sin(clock * 6 + i)) : 1;
          const x = dots[i][0] + Math.sin(clock * 1.3 + i * 1.7) * 2.2;
          const y = dots[i][1] + Math.cos(clock * 1.1 + i * 2.3) * 2.2;
          const r = dots[i][2] * born * big * (1 + Math.sin(clock * 2.4 + i) * 0.06);
          disc(g, x, y, r, alpha(i % 4 === 0 ? col2 : col, 0.5), alpha(i % 4 === 0 ? col2 : col, 0.95), 1);
          disc(g, x + r * 0.2, y + r * 0.15, r * 0.34, alpha(C.ink, 0.45));
          if (enz > 0 && i % Math.max(2, 9 - Math.floor(enz / 3)) === 0) disc(g, x - r * 0.35, y - r * 0.35, r * 0.22, alpha('#ffffff', 0.85));
        }
        // 採取機：皿のふちを回る腕。採る割合が高いほど速い
        if (hasAuto(s)) {
          const a = clock * (0.3 + s.h * 0.02);
          const ax = CX + Math.cos(a) * (R - 26);
          const ay = CY + Math.sin(a) * (R - 26);
          line(g, [CX + Math.cos(a) * (R + 4), CY + Math.sin(a) * (R + 4), ax, ay], C.gold, 2);
          disc(g, CX + Math.cos(a) * (R + 4), CY + Math.sin(a) * (R + 4), 4, C.goldLight);
          disc(g, ax, ay, 6, alpha(C.gold, 0.25), C.goldLight, 1.4);
        }
        // 右の棚：フラスコ。本数で数、ふたの色で改良、中身で培養液
        const fl = lvl(s, 'flask');
        const shownFl = tier(fl, 8);
        const ft = count(s, 'flask_t', FLASK_TIERS.length);
        const broth = Math.min(1, 0.25 + lvl(s, 'broth') * 0.05);
        rr(g, 292, 150, 176, 3, 1, alpha(C.gold, 0.7));
        rr(g, 292, 234, 176, 3, 1, alpha(C.gold, 0.7));
        for (let i = 0; i < shownFl; i++) {
          const row = Math.floor(i / 4);
          flask(314 + (i % 4) * 42, row ? 234 : 150, 44, broth * (0.85 + 0.15 * Math.sin(clock * 1.5 + i)), mix(col, C.azure, 0.3), ft);
        }
        tag(g, `×${fmt(fl)}`, 380, 26, { size: 10 });
        // 酵素：棚の上のスポイトから、金のしずくが落ちる
        if (enz > 0) {
          rr(g, 438, 40, 6, 26, 2, alpha(C.ice, 0.5));
          rr(g, 436, 34, 10, 8, 3, C.gold);
          const d = (clock * 0.8) % 1;
          disc(g, 441, 68 + d * 24, 2.2 * (1 - d * 0.5), C.goldLight);
          tag(g, `Lv ${enz}`, 441, 22, { size: 8.5 });
        }
        if (s.offer && Math.floor(clock * 2) % 2 === 0) sparkle(g, CX + R - 20, CY - R + 20, 9, C.goldLight);
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

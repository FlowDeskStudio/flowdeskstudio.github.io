// 基本ゲーム2：採掘。岩盤を壊して深く潜るほど、硬く、実入りも良くなる。
// 10 層ごとの鉱脈、50 層ごとの大鉱脈と地層の移り変わり、発破、道具の改良、原石で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt, fmtTime } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, poly, text, tag, glow, gem, sparkle, meter, stage, Bits, tier, calm, artOn } from '../ui/draw.js';
import { miningArtReady, drawMining } from './mining_art.js';

const ZONE = 50; // 地層 1 つの厚さ
const ZONES = 8; // 名前のある地層の数（その先は「深層」）
// 10 層ごとに鉱脈、50 層ごとに大鉱脈（どちらも硬いが実入りが大きい）
const isVein = (d) => d % 10 === 9;
const isMother = (d) => d % ZONE === ZONE - 1;
const zoneOf = (d) => Math.floor(d / ZONE);
const hpAt = (d) => N(10).mul(Num.pow(1.18, d)).mul(isMother(d) ? 20 : isVein(d) ? 5 : 1);
// 実入りの伸びは、深さ 100 から先でゆるやかになる（深い所ほど他のゲームより伸びすぎるのを抑える）
const BEND = 100;
const rewardAt = (d) => N(3).mul(Num.pow(1.13, Math.min(d, BEND))).mul(Num.pow(1.09, Math.max(0, d - BEND))).mul(isMother(d) ? 30 : isVein(d) ? 10 : 1);

// 改良（1 回きり）
const DRILL_TIERS = [{ own: 10, cost: 500 }, { own: 50, cost: 75000 }, { own: 150, cost: 7.5e7 }];
const PICK_TIERS = [{ clicks: 100, cost: 500 }, { clicks: 1000, cost: 50000 }, { clicks: 10000, cost: 5e6 }];
const VEIN_UPS = [1, 3, 6, 10, 15, 25]; // 今回の周で鉱脈を掘り抜いた回数
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

// 発破：ドリル 30 秒ぶんを一度に掘る
const DYN = { sec: 30, cd: 60 };
const dynCd = (s) => DYN.cd * 0.9 ** treeLvl(s, 'dyncool');
const dynSec = (s) => DYN.sec * (1 + 0.2 * treeLvl(s, 'dynpower'));
const hasAutoDyn = (s) => treeLvl(s, 'autodyn') > 0;

const ppPer = (s) => 0.15 + 0.03 * treeLvl(s, 'gempower');
// 鉱脈の知恵：クリックとドリルの両方に効く
const lore = (s) => 1.3 ** count(s, 'vein', VEIN_UPS.length);

function dps(s) {
  const n = lvl(s, 'drill');
  return N(n * milestoneMult(n) * 2 ** count(s, 'drill_t', DRILL_TIERS.length) * lore(s))
    .mul(Num.pow(1.25, lvl(s, 'motor'))).mul(Num.pow(1.15, treeLvl(s, 'deepdrill')))
    .mul(ppMult(s, ppPer(s)));
}

function clickDmg(s) {
  return Num.pow(1.25, lvl(s, 'pick')).mul(2 ** count(s, 'pick_t', PICK_TIERS.length) * lore(s)).mul(ppMult(s, ppPer(s))).add(dps(s).mul(0.1));
}

// 地層を初めて抜けるたびに、鉱石の量が永続で +10%
const zoneBonus = (s) => 1 + 0.1 * Math.max(s.stats.zones || 0, Math.floor(s.best / ZONE));

function valMult(s, ctx) {
  return Num.pow(1.15, lvl(s, 'sieve')).mul(zoneBonus(s)).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
}

function breakLayer(s, ctx) {
  const d = s.depth;
  const rich = isVein(d) ? 1.5 ** treeLvl(s, 'veinrich') : 1;
  const got = rewardAt(d).mul(valMult(s, ctx)).mul(rich);
  earn(s, got);
  if (isVein(d)) {
    s.veins++;
    s.stats.veins = (s.stats.veins || 0) + 1;
  }
  if (isMother(d)) s.stats.zones = Math.max(s.stats.zones || 0, zoneOf(d) + 1);
  s.depth++;
  if (s.depth > s.best) s.best = s.depth;
  if (s.depth > (s.stats.deepest || 0)) s.stats.deepest = s.depth;
  s.hp = hpAt(s.depth);
  return got;
}

// まとまった採掘力をぶつける。余りは次の層へ持ち越す
function dig(s, dmg, ctx) {
  let got = ZERO;
  for (let i = 0; i < 500 && dmg.gte(s.hp); i++) {
    dmg = dmg.sub(s.hp);
    got = got.add(breakLayer(s, ctx));
  }
  if (dmg.lt(s.hp)) s.hp = s.hp.sub(dmg);
  return got;
}

function blast(s, ctx) {
  if (s.dyn > 0) return null;
  s.dyn = dynCd(s);
  s.stats.dyn = (s.stats.dyn || 0) + 1;
  return dig(s, dps(s).mul(dynSec(s)).add(clickDmg(s).mul(5)), ctx);
}

const tierUp = (base, prefix, tiers, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr('c.tier.n', { g: tr(`mining.up.${base}.n`), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'mining',
  kind: 'base',
  icon: '⛏️',
  iconImg: 'rock',
  ppPer,
  keep: ['best'],
  unlock: { life: { clicker: 3000 }, cost: { clicker: 2000 } },

  // veins は今回の周で掘り抜いた鉱脈の数、dyn は発破が次に使えるまでの秒数
  newState: () => ({ ...baseState(), depth: 0, hp: hpAt(0), best: 0, veins: 0, dyn: 0 }),

  upgrades: [
    { id: 'pick', base: 10, r: 1.6, val: (s) => fmt(clickDmg(s), 1) },
    { id: 'drill', base: 25, r: 1.15, gen: true, val: (s) => fmt(dps(s), 1) },
    { id: 'motor', base: 250, r: 1.6, show: (s) => lvl(s, 'drill') >= 5 },
    { id: 'sieve', base: 100, r: 1.8 },
    ...tierUp('drill', 'drill_t', DRILL_TIERS, 'mining.tier.drill', (s, tier) => lvl(s, 'drill') >= tier.own),
    ...tierUp('pick', 'pick_t', PICK_TIERS, 'mining.tier.pick', (s, tier) => s.clicks >= tier.clicks),
    ...VEIN_UPS.map((need, i) => ({
      id: `vein${i}`,
      base: 400 * 25 ** i,
      r: 1,
      max: 1,
      once: true,
      show: (s) => s.veins >= need,
      name: (tr) => tr('mining.lore.n', { k: ROMAN[i] }),
      desc: (tr) => tr('mining.lore.d'),
    })),
  ],

  // 原石で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 2, max: 5 },
    { id: 'dynpower', base: 1, r: 2, max: 5 },
    { id: 'dyncool', base: 2, r: 2, max: 5 },
    { id: 'autodyn', base: 15, max: 1, req: { dyncool: 2 } },
    { id: 'veinrich', base: 3, r: 2, max: 5 },
    { id: 'gempower', base: 5, r: 2.5, max: 5 },
    // 先の長い枝
    { id: 'deepdrill', base: 10, r: 1.6, max: 20, req: { gempower: 1 } },
  ],

  achievements: [
    ...[10, 25, 50, 100, 150, 200, 300, 400, 500].map((v) => ({ id: `depth${v}`, type: 'depth', v, done: (s) => Math.max(s.stats.deepest || 0, s.best) >= v })),
    ...[10, 50, 200].map((v) => ({ id: `veins${v}`, type: 'veins', v, done: (s) => (s.stats.veins || 0) >= v })),
    ...[1e3, 1e6, 1e9, 1e12].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[100, 1000, 10000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[10, 100].map((v) => ({ id: `dyn${v}`, type: 'dyn', v, done: (s) => (s.stats.dyn || 0) >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「近道」のぶんだけ深い所から始める
  onReset(s) {
    const d = 10 * treeLvl(s, 'start');
    if (d > s.depth) {
      // 飛ばした層で掘れたはずの鉱石を持って始める（道具を買えないと、深い層では手が出ない）
      let ore = ZERO;
      for (let i = s.depth; i < d; i++) ore = ore.add(rewardAt(i));
      earn(s, ore.mul(ppMult(s, ppPer(s))));
      s.depth = d;
      s.hp = hpAt(d);
    }
  },

  // 表示の有無に関係なく、経過時間から層を進める
  tick(s, dt, ctx) {
    let d = dps(s);
    const span = dt;
    if (hasAutoDyn(s) && d.m !== 0) {
      // 自動の発破。長い経過は、ならした上乗せとして扱う
      if (dt > 5) d = d.mul(1 + dynSec(s) / dynCd(s)).add(clickDmg(s).mul(5 / dynCd(s)));
      else if (s.dyn <= 0) blast(s, ctx);
    }
    s.dyn = Math.max(0, s.dyn - span);
    if (d.m === 0) return;
    for (let i = 0; i < 3000 && dt > 0; i++) {
      const need = s.hp.div(d).toNumber();
      if (need <= dt) {
        dt -= need;
        breakLayer(s, ctx);
      } else {
        s.hp = s.hp.sub(d.mul(dt));
        dt = 0;
      }
    }
  },

  rate(s, ctx) {
    const d = dps(s);
    if (d.m === 0) return ZERO;
    return rewardAt(s.depth).mul(valMult(s, ctx)).mul(d).div(hpAt(s.depth));
  },

  click(s, ctx) {
    s.clicks++;
    s.hp = s.hp.sub(clickDmg(s));
    return s.hp.lte(0) ? breakLayer(s, ctx) : null;
  },

  blast,

  prestigeTotal(s) {
    if (s.best < 25) return ZERO;
    return N(Math.floor((s.best / 25) ** 2));
  },

  // 絵：地層の断面。まんなかの立坑を掘り下げる。つるはし、ドリル、ふるい、鉱脈の知恵が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 300;
    const LH = 58; // 1 層の高さ
    const TOP = 112; // いま掘っている層の上端
    const SX = 150; // 立坑の左端
    const SW = 170;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const zone = h('div', { class: 'zone' });
    const depth = h('div', { class: 'depth' });
    const bar = h('div', { class: 'bar' }, h('i'));
    const hpTxt = h('div', { class: 'sub' });
    const dynBtn = h('button', { class: 'bigbtn fire' });
    const info = h('div', { class: 'sub' });
    const wrap = h('div', { class: 'playbox' }, h('div', { class: 'row center' }, zone, depth), cv, bar, hpTxt, dynBtn, info);
    const bits = new Bits();
    const STRATA = ['#2c4a8a', '#3b4c7c', '#4a3f86', '#2c5c80', '#5a3f7c', '#2a6468', '#63465e', '#383a70'];
    const strata = (d) => {
      if (isMother(d)) return '#d9b45a';
      if (isVein(d)) return '#a8842f';
      const z = zoneOf(d);
      return z < STRATA.length ? STRATA[z] : mix('#2c4a8a', '#5a3f7c', ((z * 47) % 100) / 100);
    };
    let clock = 0;
    let scroll = 0; // 層を抜いた直後、画面を上へ送るぶん
    let seen = -1;
    let hit = 0;
    let flash = 0;
    let topY = TOP;
    cv.addEventListener('pointerdown', (ev) => {
      const s = api.s();
      const col = strata(s.depth);
      const got = game.click(s, api.ctx());
      hit = 0.18;
      bits.add(SX + SW / 2 - 30, topY, 6, { color: [mix(col, '#ffffff', 0.4), C.ice, C.gold], speed: 130, up: 70, size: 2.6, life: 0.4 });
      if (got) floatText(wrap, ev, '+' + fmt(got, 1));
      se('pick');
    });
    dynBtn.addEventListener('pointerdown', (ev) => {
      const got = blast(api.s(), api.ctx());
      if (got === null) return;
      flash = 0.3;
      bits.add(SX + SW / 2, TOP + LH, 34, { color: [C.amber, C.gold, '#ffffff'], speed: 240, up: 120, size: 4, glow: true });
      bits.add(SX + SW / 2, TOP + LH, 8, { color: [C.steel, C.ice], speed: 70, up: 40, gravity: -30, size: 20, life: 1.2, fx: 'smoke' });
      bits.add(SX + SW / 2, TOP + LH, 6, { color: [C.amber, C.goldLight], speed: 50, gravity: 0, size: 22, life: 0.3, fx: 'spark' });
      floatText(wrap, ev, `+${fmt(got, 1)}`, 'big');
      se('boom');
    });
    el.append(wrap);

    // ドリル：改良が進むほど金の帯が増え、モーターを積むほど速く震える
    const drill = (x, y, i, tiers, motor) => {
      const j = Math.sin(clock * (26 + motor * 3) + i * 2) * (1.2 + Math.min(1.2, motor * 0.1));
      rr(g, x - 6, y - 30 + j, 12, 16, 3, lin(g, x - 6, 0, x + 6, 0, C.sky, C.royal));
      for (let k = 0; k < tiers; k++) rr(g, x - 6, y - 27 + k * 4 + j, 12, 1.6, 0, C.gold);
      poly(g, [x - 5, y - 14 + j, x + 5, y - 14 + j, x, y + j], lin(g, x - 5, 0, x + 5, 0, C.ice, C.steelDark));
      line(g, [x - 3, y - 10 + j, x + 2, y - 8 + j, x - 1.5, y - 5 + j, x + 1, y - 3 + j], alpha(C.ink, 0.5), 0.8);
      if (motor > 0) glow(g, x, y - 22 + j, 9, C.amber, 0.5);
    };
    const pickaxe = (x, y, tiers, swing) => {
      g.save();
      g.translate(x, y);
      g.rotate(-0.9 + swing * 1.3);
      rr(g, -1.6, -30, 3.2, 32, 1.5, '#8a6a3a');
      const head = [C.steel, C.sky, C.gold, C.goldLight][Math.min(3, tiers)];
      g.strokeStyle = head;
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-14, -24);
      g.quadraticCurveTo(0, -36, 14, -24);
      g.stroke();
      g.restore();
    };

    return {
      update() {
        const s = api.s();
        const vein = isVein(s.depth);
        const mother = isMother(s.depth);
        const z = zoneOf(s.depth);
        setText(zone, z < ZONES ? t(`mining.zone.${z}`) : t('mining.zone.deep', { v: z - ZONES + 1 }));
        setText(depth, t(mother ? 'mining.depthMother' : vein ? 'mining.depthVein' : 'mining.depth', { v: s.depth + 1 }));
        const full = hpAt(s.depth);
        bar.firstChild.style.width = `${Math.max(0, Math.min(100, s.hp.div(full).toNumber() * 100))}%`;
        setText(hpTxt, `${fmt(s.hp.max(ZERO), 1)} / ${fmt(full, 1)}`);
        const ready = s.dyn <= 0;
        dynBtn.disabled = !ready;
        setText(dynBtn, ready ? t('mining.dyn') : t('mining.dynWait', { t: fmtTime(Math.ceil(s.dyn)) }));
        setText(info, t('mining.info', { v: s.veins, z: Math.round((zoneBonus(s) - 1) * 100) }));
      },
      frame(dt) {
        clock += dt;
        hit = Math.max(0, hit - dt);
        flash = Math.max(0, flash - dt);
        const s = api.s();
        if (seen >= 0 && s.depth > seen) {
          const n = s.depth - seen;
          scroll = Math.min(LH * 3, scroll + LH * Math.min(n, 3));
          bits.add(SX + SW / 2, TOP + LH, Math.min(30, 8 + n * 4), { color: [mix(strata(seen), '#ffffff', 0.35), C.gold, C.ice], speed: 170, up: 80, size: 3.4 });
        } else if (s.depth < seen) scroll = 0;
        seen = s.depth;
        scroll *= Math.exp(-dt * 9);
        if (scroll < 0.3) scroll = 0;
        const frac = Math.max(0, Math.min(1, s.hp.div(hpAt(s.depth)).toNumber()));
        // 絵は 2 通り：素材を使う描き方（mining_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('mining') && miningArtReady()) {
          const n = lvl(s, 'drill');
          topY = drawMining(g, {
            W, H, LH, TOP, SX, SW, depth: s.depth, frac, scroll, hit, clock, strata, isVein, isMother,
            drills: n, drillShown: tier(n, 6), drillLabel: fmt(n), drillTier: count(s, 'drill_t', DRILL_TIERS.length), motor: lvl(s, 'motor'),
            pick: lvl(s, 'pick'), pickTier: count(s, 'pick_t', PICK_TIERS.length), sieve: lvl(s, 'sieve'),
            wise: count(s, 'vein', VEIN_UPS.length), dynReady: s.dyn <= 0, dynFrac: 1 - s.dyn / dynCd(s),
          });
          bits.draw(g, dt);
          if (flash > 0 && !calm()) {
            g.fillStyle = alpha('#fff6d6', Math.min(0.7, flash * 2.4));
            g.fillRect(0, 0, W, H);
          }
          return;
        }
        g.clearRect(0, 0, W, H);
        // 地層の断面。掘った所は暗い立坑になる
        for (let r = -4; r <= 4; r++) {
          const d = s.depth + r;
          const y = TOP + r * LH + scroll;
          if (y > H || y + LH < 0) continue;
          if (d < 0) {
            g.save();
            g.beginPath();
            g.rect(0, y, W, LH + 1);
            g.clip();
            g.translate(0, y);
            stage(g, W, LH + 1, { top: C.royal, bottom: C.navy, stars: d === -1 ? 0 : 12, t: clock });
            g.restore();
            if (d === -1) {
              rr(g, 0, y + LH - 7, W, 8, 0, lin(g, 0, y + LH - 7, 0, y + LH + 1, C.leaf, C.leafDark));
              // やぐら
              line(g, [SX + 30, y + LH - 7, SX + SW / 2, y + 8, SX + SW - 30, y + LH - 7], C.gold, 2);
              line(g, [SX + 50, y + 32, SX + SW - 50, y + 32, SX + 38, y + LH - 20, SX + SW - 38, y + LH - 20], alpha(C.gold, 0.7), 1.4);
              disc(g, SX + SW / 2, y + 10, 5, C.ink, C.goldLight, 1.6);
            }
            continue;
          }
          const special = isVein(d);
          const col = strata(d);
          g.fillStyle = lin(g, 0, y, 0, y + LH, mix(col, '#ffffff', 0.08), mix(col, C.ink, 0.35));
          g.fillRect(0, y, W, LH + 1);
          g.fillStyle = alpha(C.ink, 0.3);
          g.fillRect(0, y + LH - 2, W, 2);
          // 地層に埋まった石（鉱脈の層は金の粒）
          for (let k = 0; k < 7; k++) {
            const side = k % 2;
            const px = (side ? SX + SW + 12 : 36) + ((d * 37 + k * 53) % 110);
            const py = y + 10 + ((d * 17 + k * 29) % (LH - 20));
            const sz = 3 + ((d + k * 7) % 5);
            if (special) {
              gem(g, px, py, sz + 1, isMother(d) ? '#ffffff' : C.goldLight);
              if ((k + Math.floor(clock * 2)) % 5 === 0) sparkle(g, px + 3, py - 3, 4, '#ffffff', 0.9);
            } else {
              g.fillStyle = alpha(k % 3 ? '#ffffff' : C.ink, k % 3 ? 0.1 : 0.22);
              g.beginPath();
              g.ellipse(px, py, sz * 1.6, sz, (d + k) % 3, 0, Math.PI * 2);
              g.fill();
            }
          }
          tag(g, String(d + 1), 20, y + LH / 2, { size: 9.5, color: special ? C.goldLight : C.ice, line: special ? alpha(C.gold, 0.6) : alpha(C.ice, 0.2) });
          // 立坑
          const dug = r < 0 ? LH + 1 : r === 0 ? (1 - frac) * LH : 0;
          if (dug > 0) {
            g.fillStyle = lin(g, SX, 0, SX + SW, 0, '#050a1c', '#0a1233', '#050a1c');
            g.fillRect(SX, y, SW, dug);
          }
          if (r === 0) {
            topY = y + dug;
            // いま掘っている岩：明るく浮かせて、ひびを入れる
            g.fillStyle = lin(g, 0, topY, 0, y + LH, alpha('#ffffff', 0.22), alpha('#ffffff', 0.04));
            g.fillRect(SX, topY, SW, LH - dug);
            rr(g, SX, topY, SW, 2, 0, special ? C.goldLight : C.ice);
            const cracks = Math.floor((1 - frac) * 5);
            for (let k = 0; k < cracks; k++) {
              const cx = SX + 24 + k * 30;
              line(g, [cx, topY + 2, cx + 5, topY + 10, cx - 3, topY + 17, cx + 4, topY + 26].map((v, i) => (i % 2 ? Math.min(v, y + LH - 2) : v)), alpha(C.ink, 0.55), 1.2);
            }
          }
        }
        // 立坑の壁、はしご、鉱脈の知恵（壁に生える結晶）
        const shaftTop = Math.max(0, TOP - s.depth * LH + scroll);
        line(g, [SX, shaftTop, SX, topY], alpha(C.gold, 0.6), 1.2);
        line(g, [SX + SW, shaftTop, SX + SW, topY], alpha(C.gold, 0.6), 1.2);
        g.strokeStyle = alpha(C.gold, 0.75);
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(SX + 9, shaftTop);
        g.lineTo(SX + 9, topY);
        g.moveTo(SX + 21, shaftTop);
        g.lineTo(SX + 21, topY);
        for (let y = shaftTop + (scroll % 12); y < topY - 2; y += 12) {
          g.moveTo(SX + 9, y);
          g.lineTo(SX + 21, y);
        }
        g.stroke();
        const wise = count(s, 'vein', VEIN_UPS.length);
        for (let i = 0; i < wise; i++) {
          const side = i % 2;
          const cy = topY - 16 - Math.floor(i / 2) * 26;
          if (cy < shaftTop + 6) break;
          const cx = side ? SX + SW - 5 : SX + 30;
          glow(g, cx, cy, 16, C.teal, 0.45 + 0.15 * Math.sin(clock * 2 + i));
          gem(g, cx, cy, 6, C.teal);
        }
        // ふるい：立坑の口で鉱石をふるう。段が上がるほど網が増え、金の粒がよく落ちる
        const sv = lvl(s, 'sieve');
        if (sv > 0 && topY - shaftTop > 46) {
          const y = Math.max(shaftTop + 10, 12);
          const x = SX + SW - 46;
          const sh = Math.sin(clock * 9) * 1.5;
          const nets = Math.min(3, 1 + Math.floor(sv / 8));
          for (let k = 0; k < nets; k++) {
            rr(g, x + sh * (k % 2 ? -1 : 1), y + k * 7, 36, 4, 1, alpha(C.gold, 0.9));
            for (let m = 0; m < 6; m++) rr(g, x + 3 + m * 5.6 + sh * (k % 2 ? -1 : 1), y + k * 7 + 1, 2, 2, 0, C.ink);
          }
          if (Math.random() < dt * (4 + sv)) bits.add(x + 6 + Math.random() * 24, y + nets * 7, 1, { color: [C.gold, C.goldLight], speed: 10, angle: Math.PI / 2, spread: 0.3, gravity: 200, life: 0.5, size: 1.6 });
          tag(g, `Lv ${sv}`, x + 18, y + nets * 7 + 12, { size: 8.5 });
        }
        // ドリル：台数が増えるほど並ぶ
        const n = lvl(s, 'drill');
        const shown = tier(n, 6);
        const dt3 = count(s, 'drill_t', DRILL_TIERS.length);
        for (let i = 0; i < shown; i++) drill(SX + SW / 2 + 14 + i * 13, topY, i, dt3, lvl(s, 'motor'));
        if (n > 0) tag(g, `×${fmt(n)}`, SX + SW / 2 + 14 + (shown - 1) * 6.5, Math.max(12, topY - 40), { size: 9.5 });
        // つるはし：改良で刃が鉄 → 青 → 金になる
        pickaxe(SX + SW / 2 - 36, topY - 2, count(s, 'pick_t', PICK_TIERS.length), hit > 0 ? 1 - hit / 0.18 : 1);
        tag(g, `Lv ${lvl(s, 'pick')}`, SX + SW / 2 - 44, Math.max(12, topY - 40), { size: 8.5, color: C.ice, line: alpha(C.ice, 0.25) });
        // 発破の支度（右上）：使えるときは導火線に火がつく
        const ready = s.dyn <= 0;
        const bx = W - 34;
        for (let k = 0; k < 3; k++) rr(g, bx - 9 + k * 6.5, 14, 5.5, 18, 1.5, lin(g, 0, 14, 0, 32, ready ? '#f08a4a' : C.steel, ready ? '#a8402f' : C.steelDark));
        rr(g, bx - 10, 20, 21, 3, 0, alpha(C.ink, 0.6));
        line(g, [bx, 14, bx + 3, 8, bx + 8, 7], C.ice, 1);
        if (ready) {
          sparkle(g, bx + 8, 7, 4 + Math.sin(clock * 14) * 1.5, C.goldLight);
          glow(g, bx + 8, 7, 12, C.amber, 0.7);
        } else meter(g, bx - 12, 37, 25, 1 - s.dyn / dynCd(s), C.amber, 3);
        bits.draw(g, dt);
        if (flash > 0 && !calm()) {
          g.fillStyle = alpha('#fff6d6', Math.min(0.7, flash * 2.4));
          g.fillRect(0, 0, W, H);
        }
      },
    };
  },
};

export default game;

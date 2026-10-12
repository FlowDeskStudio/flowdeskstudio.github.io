// 融合ゲーム（農業 × 細胞増殖）：品種改良。同じ等級の苗が 2 つそろうと、掛け合わさって 1 つ上の等級になる。
// 畝が埋まると新しい苗を植えられない。畝を増やすか、いちばん上の品種を出荷して場所を空けるかを選ぶ。
// 苗の総量を「等級 1 の苗で何本ぶんか」という 1 つの数で持つと、その 2 進数の各桁がそのまま畝に並ぶ苗になる。
// 育て方（促成・熟成）の切り替え、初めて届いた等級が残る品種図鑑、苗床の改良、原種で伸ばす転生ツリー、実績を持つ。
import { Num, N, ZERO } from '../core/num.js';
import { baseState, earn, lvl, milestoneMult, ppMult, treeLvl } from '../core/engine.js';
import { fmt } from '../core/format.js';
import { t } from '../core/i18n.js';
import { se } from '../core/audio.js';
import { h, setText, floatText } from '../ui/dom.js';
import { C, makeCanvas, alpha, mix, lin, rr, disc, line, poly, text, tag, glow, sparkle, stage, Bits, tier, artOn } from '../ui/draw.js';
import { breedArtReady, drawBreed } from './breed_art.js';

const GROW = 4; // 等級が 1 つ上がるごとの稼ぎの倍率（2 本ぶんで 4 倍なので、掛け合わせるほど得）
const SHIP_SEC = 30; // 出荷すると、その苗の稼ぎ何秒ぶんをまとめて受け取るか
// 育て方。spawn は植える速さ、ship は出荷で受け取る量、need は解放に要る累計
const MODES = [
  { id: 'std', spawn: 1, ship: 1, need: 0 },
  { id: 'rush', spawn: 2, ship: 0.5, need: 3000 },
  { id: 'aged', spawn: 0.5, ship: 3, need: 3000 },
];

// 改良（1 回きり）
const BED_TIERS = [{ own: 10, cost: 300 }, { own: 50, cost: 45000 }, { own: 150, cost: 4.5e7 }];
const SHIP_TIERS = [{ n: 10, cost: 5000 }, { n: 100, cost: 5e6 }, { n: 1000, cost: 5e9 }];
const ROMAN = ['I', 'II', 'III'];
const count = (s, prefix, n) => Array.from({ length: n }, (_, i) => lvl(s, `${prefix}${i}`)).reduce((a, b) => a + b, 0);

const ppPer = (s) => 0.1 + 0.02 * treeLvl(s, 'racepower');
const mode = (s) => MODES[s.mode] || MODES[0];
const rows = (s) => 4 + lvl(s, 'row') + treeLvl(s, 'freerow');
const cap = (s) => 2 ** rows(s) - 1;
const unit = (s) => 2 ** lvl(s, 'stock'); // 植える苗 1 本が、等級 1 の何本ぶんか
const perSec = (s) => {
  const n = lvl(s, 'bed');
  return 0.5 * n * milestoneMult(n) * 2 ** count(s, 'bed_t', BED_TIERS.length) * unit(s) * mode(s).spawn;
};
// 品種図鑑：これまでに届いたいちばん高い等級ごとに、品種の量が永続で増える
const codex = (s) => 1 + (0.05 + 0.01 * treeLvl(s, 'codexpower')) * (s.stats.top || 0);
const valMult = (s, ctx) => Num.pow(1.15, lvl(s, 'label')).mul(2 ** count(s, 'ship_t', SHIP_TIERS.length) * codex(s))
  .mul(Num.pow(1.15, treeLvl(s, 'arboretum'))).mul(ppMult(s, ppPer(s))).mul(ctx.mult);
const shipSec = (s) => SHIP_SEC * mode(s).ship * (1 + 0.25 * treeLvl(s, 'shipbonus'));
const hasAuto = (s) => lvl(s, 'shipper') > 0;
// 畝に並ぶ苗の等級（0 始まり）を上から順に
function tiles(m) {
  const out = [];
  for (let g = Math.floor(Math.log2(Math.max(1, m))); g >= 0; g--) if (Math.floor(m / 2 ** g) % 2) out.push(g);
  return out;
}
const income = (m) => tiles(Math.floor(m)).reduce((a, g) => a + GROW ** g, 0);
const top = (m) => (m >= 1 ? Math.floor(Math.log2(m)) : -1);

function ship(s, ctx) {
  const g = top(Math.floor(s.m));
  if (g < 0) return null;
  const got = valMult(s, ctx).mul(GROW ** g * shipSec(s));
  earn(s, got);
  s.m -= 2 ** g;
  s.stats.ships = (s.stats.ships || 0) + 1;
  return got;
}

// m を dt 秒ぶん増やしながら、その間の稼ぎ（毎秒ぶんの合計）を返す
function grow(s, dt) {
  const n = Math.max(1, Math.min(40, Math.ceil(dt / 0.5)));
  const step = dt / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    s.m = Math.min(cap(s), s.m + perSec(s) * step);
    sum += income(s.m) * step;
  }
  // 図鑑に載る等級（1 始まり）
  const g = top(Math.floor(s.m)) + 1;
  if (g > (s.stats.top || 0)) s.stats.top = g;
  return sum;
}

const tierUp = (prefix, tiers, nameKey, key, show) => tiers.map((tier, i) => ({
  id: `${prefix}${i}`,
  base: tier.cost,
  r: 1,
  max: 1,
  once: true,
  show: (s) => show(s, tier),
  name: (tr) => tr(nameKey, { g: tr('breed.up.bed.n'), k: ROMAN[i] }),
  desc: (tr) => tr(key),
}));

const game = {
  id: 'breed',
  kind: 'fusion',
  parents: ['farm', 'cell'],
  icon: '🌿',
  ppPer,
  keep: ['mode'],

  // 苗床 1 つから始まる。m は苗の総量（等級 1 の苗で何本ぶんか）
  newState: () => ({ ...baseState(), up: { bed: 1 }, m: 0, mode: 0 }),

  upgrades: [
    { id: 'bed', base: 15, r: 1.15, gen: true, val: (s) => fmt(perSec(s), 1) },
    { id: 'row', base: 100, r: 1000, max: 44, val: (s) => String(rows(s)) },
    { id: 'stock', base: 300, r: 60, max: 50, val: (s) => String(lvl(s, 'stock') + 1) },
    { id: 'label', base: 250, r: 2.6 },
    { id: 'shipper', base: 5000, r: 1, max: 1, show: (s) => lvl(s, 'row') >= 2 },
    { id: 'giveback', base: 10000, r: 10, max: 10, show: (s) => s.life.gte(2000) },
    ...tierUp('bed_t', BED_TIERS, 'c.tier.n', 'breed.tier.bed', (s, tier) => lvl(s, 'bed') >= tier.own),
    ...tierUp('ship_t', SHIP_TIERS, 'breed.shiptier.n', 'breed.tier.ship', (s, tier) => (s.stats.ships || 0) >= tier.n),
  ],

  // 原種で買う、消えない強化
  tree: [
    { id: 'start', base: 1, r: 3, max: 4 },
    { id: 'shipbonus', base: 2, r: 2.5, max: 5 },
    { id: 'codexpower', base: 3, r: 2.5, max: 5 },
    { id: 'freerow', base: 8, r: 5, max: 3 },
    { id: 'racepower', base: 10, r: 4, max: 5 },
    // 先の長い枝
    { id: 'arboretum', base: 20, r: 1.7, max: 20, req: { racepower: 1 } },
  ],

  achievements: [
    ...[1e3, 1e6, 1e9, 1e12, 1e15, 1e18].map((v) => ({ id: `life${v}`, type: 'life', v, done: (s) => s.life.gte(v) })),
    ...[5, 10, 15, 20, 25, 30].map((v) => ({ id: `grade${v}`, type: 'grade', v, done: (s) => (s.stats.top || 0) >= v })),
    ...[10, 100, 1000].map((v) => ({ id: `ships${v}`, type: 'ships', v, done: (s) => (s.stats.ships || 0) >= v })),
    ...[50, 100, 200].map((v) => ({ id: `own${v}`, type: 'beds', v, done: (s) => lvl(s, 'bed') >= v })),
    ...[100, 1000].map((v) => ({ id: `clicks${v}`, type: 'clicks', v, done: (s) => s.clicks >= v })),
    ...[1, 5].map((v) => ({ id: `prestige${v}`, type: 'prestige', v, done: (s) => s.prestiges >= v })),
  ],

  // 転生や総転生のあと：ツリー「株分け」のぶんの苗床を持って始める
  onReset(s) {
    const n = 5 * treeLvl(s, 'start');
    if (n > 0) s.up.bed = Math.max(lvl(s, 'bed'), n);
  },

  tick(s, dt, ctx) {
    if (!(dt > 0)) return;
    const v = valMult(s, ctx);
    if (!hasAuto(s)) {
      earn(s, v.mul(grow(s, dt)));
      return;
    }
    // 出荷係：畝が埋まったら、いちばん上を出荷して植え続ける
    // 埋まるのがとても速いときは、1 周ずつ回さずにまとめて集計する（下の「長い経過の残り」と同じ式）
    const quick = 2 ** (rows(s) - 1) / perSec(s);
    if (quick * 20 < dt) {
      const top2 = rows(s) - 1;
      earn(s, v.mul(GROW ** top2 * shipSec(s) + income(cap(s) * 0.75) * quick).mul(dt / quick));
      s.stats.ships = (s.stats.ships || 0) + Math.floor(dt / quick);
      s.m = cap(s) * 0.75;
      if (top2 + 1 > (s.stats.top || 0)) s.stats.top = top2 + 1;
      return;
    }
    for (let i = 0; i < 300 && dt > 0; i++) {
      const fill = Math.max(0, (cap(s) - s.m) / perSec(s));
      const span = Math.min(dt, fill);
      if (span > 0) earn(s, v.mul(grow(s, span)));
      dt -= span;
      if (s.m >= cap(s) && dt > 0) ship(s, ctx);
    }
    // 長い経過の残りは、1 周（埋まるまで）あたりの出荷でまとめて集計する
    if (dt > 0) {
      const g = rows(s) - 1;
      const cycle = 2 ** g / perSec(s);
      earn(s, v.mul(GROW ** g * shipSec(s) + income(cap(s) * 0.75) * cycle).mul(dt / cycle));
      s.stats.ships = (s.stats.ships || 0) + Math.floor(dt / cycle);
    }
  },

  // 司令室に出す「手を入れてほしい状態」。自動にしていれば出さない
  attention: (s) => (!hasAuto(s) && s.m >= cap(s) ? 'full' : null),
  rate: (s, ctx) => valMult(s, ctx).mul(income(s.m)),

  // 手で 1 本植える
  click(s) {
    s.clicks++;
    s.m = Math.min(cap(s), s.m + unit(s));
  },

  ship,
  full: (s) => s.m >= cap(s),
  setMode(s, i) {
    if (MODES[i] && s.life.gte(MODES[i].need)) s.mode = i;
  },

  prestigeTotal(s) {
    if (s.life.lt(1e5)) return ZERO;
    return s.life.div(1e5).pow(0.2).floor();
  },

  // 絵：夜の温室。鉢が並び、同じ等級が 2 つそろうと 1 つ上の等級になる。苗床、畝、台木、ラベル、出荷係が絵に出る。
  mount(el, api) {
    const W = 480;
    const H = 250;
    const FX = 100; // 鉢の並ぶ範囲
    const FY = 40;
    const FW = W - FX - 14;
    const FH = H - FY - 16;
    const { cv, g } = makeCanvas(W, H, 'scene');
    const status = h('div', { class: 'depth' });
    const plant = h('button', { class: 'bigbtn' }, t('breed.plant'));
    const shipBtn = h('button', { class: 'bigbtn fire' }, t('breed.ship'));
    const preview = h('div', { class: 'sub' });
    const codexEl = h('div', { class: 'sub' });
    const auto = h('div', { class: 'sub' }, t('breed.auto'));
    const chips = MODES.map((m, i) => ({ m, i, chip: h('button', { class: 'mini', onclick: () => game.setMode(api.s(), i) }, t(`breed.mode.${m.id}`)) }));
    const wrap = h('div', { class: 'playbox' }, status, cv, preview, h('div', { class: 'row' }, plant, shipBtn),
      h('div', { class: 'row wrap center' }, chips.map((x) => x.chip)), auto, codexEl);
    const bits = new Bits();
    let clock = 0;
    let prev = []; // 直前の並び（変わった鉢を、ぽんと弾ませる）
    let popAt = [];
    let seenShips = -1;
    const doPlant = () => {
      game.click(api.s());
      se('harvest');
    };
    plant.addEventListener('pointerdown', doPlant);
    cv.addEventListener('pointerdown', doPlant);
    shipBtn.addEventListener('pointerdown', (ev) => {
      const got = ship(api.s(), api.ctx());
      if (got) {
        floatText(wrap, ev, '+' + fmt(got, 1));
        se('crate');
      }
    });
    el.append(wrap);

    // 実の色は等級 6 つで一巡し、鉢の色が 1 段上がる
    const FRUIT = [C.leafLight, C.goldLight, C.amber, C.rose, C.violet, C.sky];
    const POT = ['#7a5a3a', C.steel, C.royal, C.violet, C.rose, C.gold, C.ivory];
    const potShape = (x, y, pw, ph, fill, edge) => {
      g.beginPath();
      g.moveTo(x - pw / 2, y - ph);
      g.lineTo(x + pw / 2, y - ph);
      g.lineTo(x + pw * 0.38, y);
      g.lineTo(x - pw * 0.38, y);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      if (edge) {
        g.strokeStyle = edge;
        g.lineWidth = 1;
        g.stroke();
      }
    };
    const sprout = (x, y, cw, ch, grade, k, labels) => {
      const step = grade % 6;
      const pt = Math.min(POT.length - 1, Math.floor(grade / 6));
      const pw = Math.min(cw * 0.7, 34);
      const ph = Math.min(ch * 0.22, 16);
      const top = y - ph;
      const hh = Math.min(ch - ph - 16, (ch - ph - 16) * (0.35 + 0.13 * step)) * k;
      const sway = Math.sin(clock * 1.8 + x * 0.1) * 1.5;
      g.strokeStyle = C.leafDark;
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, top);
      g.quadraticCurveTo(x + sway * 0.5, top - hh * 0.5, x + sway, top - hh);
      g.stroke();
      const leaves = 1 + Math.floor(step / 2);
      for (let i = 0; i < leaves; i++) {
        const ly = top - hh * ((i + 1) / (leaves + 0.6));
        const lw = Math.min(pw * 0.42, 5 + hh * 0.16);
        for (const dir of [-1, 1]) {
          g.fillStyle = dir < 0 ? C.leaf : mix(C.leaf, C.leafDark, 0.4);
          g.beginPath();
          g.ellipse(x + sway * 0.6 + dir * lw * 0.9, ly, lw, lw * 0.45, dir * -0.45, 0, Math.PI * 2);
          g.fill();
        }
      }
      const fr = Math.min(pw * 0.36, 5 + step * 1.4) * k;
      const fx = x + sway;
      const fy = top - hh - fr * 0.5;
      if (pt > 0) glow(g, fx, fy, fr * 3, FRUIT[step], 0.35);
      g.fillStyle = lin(g, fx - fr, fy - fr, fx + fr, fy + fr, mix(FRUIT[step], '#ffffff', 0.5), mix(FRUIT[step], C.ink, 0.25));
      g.beginPath();
      g.ellipse(fx, fy, fr * 1.1, fr, -0.3, 0, Math.PI * 2);
      g.fill();
      potShape(x, y, pw, ph, lin(g, x - pw / 2, 0, x + pw / 2, 0, mix(POT[pt], '#ffffff', 0.2), mix(POT[pt], C.ink, 0.45)), pt >= 5 ? C.goldLight : null);
      // ラベル：段が上がるほど、鉢の札が金に近づく
      if (labels > 0) rr(g, x - pw * 0.3, y - ph * 0.85, pw * 0.6, ph * 0.7, 2, labels > 6 ? C.gold : C.ivory);
      text(g, String(grade + 1), x, y - ph / 2 + 3.6, Math.min(10.5, ph * 0.72), labels > 0 ? C.ink : C.ivory);
    };

    return {
      update() {
        const s = api.s();
        const list = tiles(Math.floor(s.m));
        const n = rows(s);
        const isFull = game.full(s);
        setText(status, t(isFull ? 'breed.full' : 'breed.rows', { v: list.length, n }));
        status.dataset.st = isFull ? 'hot' : '';
        const tg = top(Math.floor(s.m));
        setText(preview, tg < 0 ? '' : t('breed.preview', { g: tg + 1, v: fmt(valMult(s, api.ctx()).mul(GROW ** tg * shipSec(s)), 1) }));
        shipBtn.disabled = tg < 0;
        plant.disabled = isFull;
        auto.hidden = !hasAuto(s);
        setText(codexEl, t('breed.codex', { v: s.stats.top || 0, m: Math.round((codex(s) - 1) * 100) }));
        const anyMode = s.life.gte(MODES[1].need);
        for (const x of chips) {
          x.chip.hidden = !anyMode;
          x.chip.classList.toggle('on', x.i === s.mode);
        }
      },
      frame(dt) {
        clock += dt;
        const s = api.s();
        const list = tiles(Math.floor(s.m));
        const n = rows(s);
        // 絵は 2 通り：素材を使う描き方（breed_art.js）と、図形だけの旧い描き方（この下）
        if (artOn('breed') && breedArtReady()) {
          for (let i = 0; i < n; i++) if (list[i] !== prev[i]) popAt[i] = clock;
          prev = list.slice();
          const f = drawBreed(g, {
            W, H, FX, FY, FW, FH, clock, list, n, mode: s.mode, labels: lvl(s, 'label'), popAt,
            beds: tier(lvl(s, 'bed'), 5), bedLabel: fmt(lvl(s, 'bed')), bedTier: count(s, 'bed_t', BED_TIERS.length), stock: lvl(s, 'stock'),
            pile: Math.min(6, Math.floor((s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0) / 3)),
            shipTier: count(s, 'ship_t', SHIP_TIERS.length), auto: hasAuto(s),
          });
          const done = s.stats.ships || 0;
          if (seenShips >= 0 && done > seenShips) bits.add(f.ox + f.cw / 2, f.oy + f.ch * 0.4, 10, { color: [C.goldLight, C.amber, C.rose, C.violet], size: 4, speed: 80, life: 0.7, to: [38, H - 40], glow: true });
          seenShips = done;
          bits.draw(g, dt);
          return;
        }
        // 温室のガラスと、育成灯（育て方で色が変わる）
        stage(g, W, H, { top: '#1a2c7c', bottom: '#0d1640', stars: 20, t: clock });
        const lamp = [C.goldLight, C.rose, C.violet][s.mode] || C.goldLight;
        g.strokeStyle = alpha(C.ice, 0.3);
        g.lineWidth = 1.2;
        g.beginPath();
        for (let x = FX - 20; x <= W + 40; x += 60) {
          g.moveTo(x, H);
          g.lineTo(x, 46);
          g.quadraticCurveTo(x, 8, x + 30, 8);
        }
        g.moveTo(FX - 20, 46);
        g.lineTo(W, 46);
        g.stroke();
        for (let x = FX + 40; x < W; x += 120) {
          rr(g, x - 12, 10, 24, 4, 2, lamp);
          g.fillStyle = lin(g, 0, 14, 0, 120, alpha(lamp, 0.18), alpha(lamp, 0));
          g.beginPath();
          g.moveTo(x - 12, 14);
          g.lineTo(x + 12, 14);
          g.lineTo(x + 60, 130);
          g.lineTo(x - 60, 130);
          g.fill();
        }
        rr(g, 0, H - 14, W, 14, 0, lin(g, 0, H - 14, 0, H, '#1a2050', C.ink));
        rr(g, 0, H - 14, W, 1, 0, alpha(C.gold, 0.5));
        // 鉢の並び
        const per = n <= 10 ? n : Math.ceil(n / Math.ceil(n / 10));
        const lines = Math.ceil(n / per);
        const cw = Math.min(58, FW / per);
        const ch = Math.min(120, FH / lines);
        const ox = FX + (FW - cw * per) / 2;
        const oy = FY + (FH - ch * lines) / 2;
        const labels = lvl(s, 'label');
        for (let r = 1; r <= lines; r++) rr(g, ox - 4, oy + r * ch - 4, cw * per + 8, 2, 1, alpha(C.gold, 0.45));
        for (let i = 0; i < n; i++) {
          const x = ox + (i % per) * cw + cw / 2;
          const y = oy + (Math.floor(i / per) + 1) * ch - 4;
          const grade = list[i];
          if (grade !== prev[i]) popAt[i] = clock;
          if (grade === undefined) {
            potShape(x, y, Math.min(cw * 0.7, 34), Math.min(ch * 0.22, 16), alpha(C.ice, 0.06), alpha(C.ice, 0.22));
            continue;
          }
          const age = clock - (popAt[i] ?? -9);
          const k = age < 0.3 ? 0.55 + 0.45 * (age / 0.3) + Math.sin((age / 0.3) * Math.PI) * 0.25 : 1;
          if (age < 0.3) sparkle(g, x, y - ch * 0.6, 8 * (1 - age / 0.3), C.goldLight);
          sprout(x, y, cw, ch, grade, k, labels);
        }
        prev = list.slice();
        // 左：苗床（数で苗の皿が増え、改良で金の縁、台木の段で苗が太くなる）
        const beds = tier(lvl(s, 'bed'), 5);
        const bt = count(s, 'bed_t', BED_TIERS.length);
        const stock = lvl(s, 'stock');
        for (let i = 0; i < beds; i++) {
          const by = 60 + i * 22;
          rr(g, 14, by, 60, 12, 3, lin(g, 0, by, 0, by + 12, '#3a4a8a', '#1a2050'), bt > 0 ? C.gold : alpha(C.ice, 0.3), 1);
          for (let k = 0; k < 5; k++) {
            const sx = 22 + k * 11;
            const up = 4 + Math.min(6, stock * 0.4) + Math.sin(clock * 2 + i + k) * 0.8;
            line(g, [sx, by, sx, by - up], C.leaf, 1.2 + Math.min(1.6, stock * 0.08));
            disc(g, sx, by - up, 1.8 + Math.min(1.6, stock * 0.08), C.leafLight);
          }
        }
        tag(g, `×${fmt(lvl(s, 'bed'))}`, 44, 46, { size: 9.5 });
        // 出荷の木箱：稼ぐほど積み上がる。出荷係がいれば、台車が待っている
        const ships = s.stats.ships || 0;
        if (seenShips >= 0 && ships > seenShips) bits.add(ox + cw / 2, oy + ch * 0.4, 10, { color: FRUIT, size: 4, speed: 80, life: 0.7, to: [38, H - 40], glow: true });
        seenShips = ships;
        const pile = Math.min(6, Math.floor((s.life.m > 0 ? Math.log10(s.life.m) + s.life.e : 0) / 3));
        const sht = count(s, 'ship_t', SHIP_TIERS.length);
        for (let i = 0; i < pile; i++) {
          const bx = 14 + (i % 2) * 24;
          const by = H - 36 - Math.floor(i / 2) * 22;
          rr(g, bx, by, 21, 20, 2, lin(g, 0, by, 0, by + 20, '#d9a85a', '#7a5226'), sht > 0 ? C.gold : null, 1);
          rr(g, bx + 9.5, by + 1, 2, 18, 0, alpha(C.ink, 0.3));
        }
        if (hasAuto(s)) {
          const cx = 76 + Math.sin(clock * 1.2) * 4;
          rr(g, cx - 10, H - 28, 20, 10, 2, lin(g, 0, H - 28, 0, H - 18, C.ice, C.azure));
          disc(g, cx - 6, H - 16, 2.6, C.ink, C.gold, 1);
          disc(g, cx + 6, H - 16, 2.6, C.ink, C.gold, 1);
          poly(g, [cx + 10, H - 26, cx + 16, H - 34, cx + 17, H - 33, cx + 12, H - 24], C.ice);
        }
        bits.draw(g, dt);
      },
    };
  },
};

export default game;

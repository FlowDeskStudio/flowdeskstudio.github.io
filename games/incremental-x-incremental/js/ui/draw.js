// 各ゲームの絵（キャンバス）で共通に使う道具
// 絵の考え方：深い紺の舞台に、輪郭線のない面と光で形を作る。金は「価値のあるもの」にだけ使う。
import { h } from './dom.js';
import { ASSETS } from '../core/assets.js';

// 色（style.css と同じ、ロイヤルブルーと金の配色）
export const C = {
  ink: '#070d26',
  night: '#0b1438',
  deep: '#111d55',
  navy: '#172a78',
  royal: '#2443b8',
  azure: '#4f7bff',
  sky: '#8fb0ff',
  ice: '#c9d6ff',
  ivory: '#f4f1e6',
  gold: '#e3c16f',
  goldLight: '#fbeebe',
  goldDark: '#a47c26',
  leaf: '#7cc98f',
  leafLight: '#c9eaa0',
  leafDark: '#2f7d58',
  rose: '#e8637f',
  amber: '#f2a65a',
  violet: '#9d86ff',
  teal: '#4fd1c5',
  steel: '#8f9bc4',
  steelDark: '#4b5682',
  muted: '#97a3cf',
  // 以前の名前（部品が使う）
  danger: '#e8637f',
  cream: '#f4f1e6',
};
export const FONT = '"Segoe UI Variable Display", "Segoe UI", "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", sans-serif';

// 動きを減らす設定（OS 側）。揺れや画面全体の閃光は、これが真のとき出さない
const calmQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
export const calm = () => !!calmQuery?.matches;

// 高精細な画面でもにじまないよう、2 倍の大きさで作る
export function makeCanvas(w, hgt, cls) {
  // --w と --ar は、画面の広さに合わせて絵を大きくするときに CSS が使う（もとの幅と、縦横の比）
  const cv = h('canvas', { class: cls, width: w * 2, height: hgt * 2, style: `--w:${w};--ar:${(w / hgt).toFixed(3)}` });
  const g = cv.getContext('2d');
  g.scale(2, 2);
  return { cv, g };
}

// クリック位置を、絵の中の座標へ直す
export function pointIn(cv, ev, w, hgt) {
  const r = cv.getBoundingClientRect();
  return [((ev.clientX - r.left) / r.width) * w, ((ev.clientY - r.top) / r.height) * hgt];
}

// 色に透明度を付ける（#rrggbb → rgba）
export function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// 2 色の間の色（k: 0〜1）
export function mix(a, b, k) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((x >> s) & 255) + ((((y >> s) & 255) - ((x >> s) & 255)) * k));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// 線の向きに沿ったグラデーション
export function lin(g, x0, y0, x1, y1, ...colors) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  colors.forEach((c, i) => gr.addColorStop(colors.length > 1 ? i / (colors.length - 1) : 0, c));
  return gr;
}

// 角の丸い四角。fill / stroke を渡さなければ、呼ぶ側の設定で塗る（以前の使い方）
export function box(g, x, y, w, hgt, r, stroke = true) {
  g.beginPath();
  g.roundRect(x, y, w, hgt, r);
  g.fill();
  if (stroke) g.stroke();
}

export function rr(g, x, y, w, hgt, r, fill, stroke, lw = 1) {
  g.beginPath();
  g.roundRect(x, y, w, hgt, r);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

export function disc(g, x, y, r, fill, stroke, lw = 1) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

export function line(g, pts, stroke, lw = 1, close = false) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  if (close) g.closePath();
  g.strokeStyle = stroke;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

export function poly(g, pts, fill) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

export function text(g, str, x, y, size = 13, color = C.ivory, align = 'center', weight = 700) {
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.fillStyle = color;
  g.fillText(str, x, y);
}

// 数や名前を載せる、小さな札
export function tag(g, str, x, y, { size: asked = 11, color = C.goldLight, bg = alpha(C.ink, 0.72), align = 'center', line: edge = alpha(C.gold, 0.35) } = {}) {
  const size = Math.max(10.5, asked); // これより小さい字は読めない
  g.font = `700 ${size}px ${FONT}`;
  const w = g.measureText(str).width + 12;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  rr(g, left, y - size * 0.5 - 4, w, size + 8, (size + 8) / 2, bg, edge, 1);
  g.textAlign = 'center';
  g.fillStyle = color;
  g.fillText(str, left + w / 2, y + size * 0.36);
}

// 光のにじみ
export function glow(g, x, y, r, color, a = 0.5) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, alpha(color, a));
  gr.addColorStop(1, alpha(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// 足もとの影
export function shadow(g, x, y, rx, ry = rx * 0.28, a = 0.35) {
  g.fillStyle = alpha(C.ink, a);
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

// 舞台：上から下へ深くなる紺。horizon を渡すと、そこから下を床にする
export function stage(g, w, hgt, { top = C.navy, bottom = C.night, horizon = 0, floor = C.deep, floorEnd = C.ink, stars = 0, t = 0 } = {}) {
  g.fillStyle = lin(g, 0, 0, 0, horizon || hgt, top, bottom);
  g.fillRect(0, 0, w, hgt);
  for (let i = 0; i < stars; i++) {
    const x = (i * 97.3 + 13) % w;
    const y = (i * 53.7 + 7) % (horizon || hgt);
    g.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 0.8 + i * 1.7));
    disc(g, x, y, i % 5 ? 0.8 : 1.3, C.ice);
  }
  g.globalAlpha = 1;
  if (horizon) {
    g.fillStyle = lin(g, 0, horizon, 0, hgt, floor, floorEnd);
    g.fillRect(0, horizon, w, hgt - horizon);
    g.fillStyle = alpha(C.sky, 0.22);
    g.fillRect(0, horizon, w, 1);
  }
}

// ポポーの実。tone：green（ふつう）/ gold（金）/ stone（岩）/ 色コード
const TONES = {
  green: ['#e4f0a0', '#8fca78', '#2f7d58'],
  gold: ['#fff6d6', '#e3c16f', '#8a6518'],
  stone: ['#c9d1ee', '#7783ad', '#2f3961'],
  ripe: ['#fff3c2', '#d9d07a', '#6f8a3c'],
};
export function pawpaw(g, x, y, size, { tone = 'green', rot = -0.26, leaf = true, squash = 1 } = {}) {
  const [hi, mid, lo] = TONES[tone] || [mix(tone, '#ffffff', 0.6), tone, mix(tone, C.ink, 0.55)];
  const rx = size * 0.56;
  const ry = size * 0.42 * squash;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  if (leaf) {
    // 柄と葉
    g.fillStyle = '#7a5a34';
    g.beginPath();
    g.moveTo(-rx * 0.92, -ry * 0.1);
    g.lineTo(-rx * 1.16, -ry * 0.62);
    g.lineTo(-rx * 1.04, -ry * 0.7);
    g.lineTo(-rx * 0.78, -ry * 0.3);
    g.closePath();
    g.fill();
    g.fillStyle = lin(g, -rx * 1.5, -ry * 1.2, -rx * 0.9, -ry * 0.4, tone === 'gold' ? C.goldLight : '#9bd98a', tone === 'gold' ? C.goldDark : C.leafDark);
    g.beginPath();
    g.moveTo(-rx * 1.12, -ry * 0.55);
    g.quadraticCurveTo(-rx * 1.62, -ry * 0.7, -rx * 1.58, -ry * 1.3);
    g.quadraticCurveTo(-rx * 1.0, -ry * 1.2, -rx * 1.12, -ry * 0.55);
    g.fill();
  }
  const gr = g.createRadialGradient(-rx * 0.3, -ry * 0.45, size * 0.04, 0, 0, rx * 1.1);
  gr.addColorStop(0, hi);
  gr.addColorStop(0.45, mid);
  gr.addColorStop(1, lo);
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  // つや
  g.strokeStyle = 'rgba(255, 255, 255, .5)';
  g.lineWidth = Math.max(1, size * 0.045);
  g.lineCap = 'round';
  g.beginPath();
  g.ellipse(0, 0, rx * 0.7, ry * 0.66, 0, Math.PI * 1.08, Math.PI * 1.5);
  g.stroke();
  g.restore();
}

// 金のコイン
export function coin(g, x, y, r) {
  disc(g, x, y + r * 0.1, r, C.goldDark);
  disc(g, x, y, r, lin(g, x - r, y - r, x + r, y + r, C.goldLight, C.gold, C.goldDark));
  disc(g, x, y, r * 0.68, null, alpha(C.goldDark, 0.7), Math.max(0.8, r * 0.1));
}

// 宝石（ひし形）
export function gem(g, x, y, r, color = C.azure) {
  poly(g, [x, y - r, x + r * 0.8, y, x, y + r, x - r * 0.8, y], lin(g, x - r, y - r, x + r, y + r, mix(color, '#ffffff', 0.7), color, mix(color, C.ink, 0.5)));
  poly(g, [x, y - r, x + r * 0.3, y - r * 0.1, x, y + r * 0.2, x - r * 0.3, y - r * 0.1], 'rgba(255, 255, 255, .35)');
}

// 粒の素材（白い絵）に色を付けたもの。色ごとに 1 度だけ作って使い回す
const tinted = {};
function fxImage(name, color) {
  const key = `${name}/${color}`;
  if (tinted[key]) return tinted[key];
  const src = image(ASSETS.fx?.[name]);
  if (!src || typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = src.naturalWidth;
  cv.height = src.naturalHeight;
  const c = cv.getContext('2d');
  c.drawImage(src, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, cv.width, cv.height);
  tinted[key] = cv;
  return cv;
}

// 粒を 1 つ描く。r は半径、add を真にすると光として足し合わせる。素材がまだ読めていなければ false を返す
export function fx(g, name, x, y, r, color = '#ffffff', { a = 1, rot = 0, add = false } = {}) {
  const im = fxImage(name, color);
  if (!im) return false;
  g.save();
  g.globalAlpha *= a;
  if (add) g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.drawImage(im, -r, -r, r * 2, r * 2);
  g.restore();
  return true;
}

// 立ちのぼる煙。t は 0〜1 で巡る値（位置と濃さが変わる）
export function smoke(g, x, y, t, { color = C.ice, rise = 34, size = 9, a = 0.35, drift = 6 } = {}) {
  const px = x + Math.sin(t * 5) * drift * t;
  const py = y - t * rise;
  if (!fx(g, 'smoke', px, py, size * (0.7 + t * 1.3), color, { a: a * (1 - t), rot: t * 2 })) disc(g, px, py, size * (0.5 + t * 0.7), alpha(color, a * 0.8 * (1 - t)));
}

// 四つの光条のきらめき
export function sparkle(g, x, y, r, color = C.goldLight, a = 1) {
  if (fx(g, 'star', x, y, r * 2.2, color, { a, add: true })) return;
  g.globalAlpha = a;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
  g.globalAlpha = 1;
}

// 進み具合の細い棒
export function meter(g, x, y, w, k, color = C.gold, hgt = 4) {
  rr(g, x, y, w, hgt, hgt / 2, alpha(C.ice, 0.16));
  if (k > 0) rr(g, x, y, Math.max(hgt, w * Math.min(1, k)), hgt, hgt / 2, color);
}

// 絵の素材（読み込みが済むまでは描かない）
const cache = {};
export function image(src) {
  if (!src) return null;
  if (!cache[src]) {
    cache[src] = new Image();
    cache[src].src = src;
  }
  return cache[src].complete && cache[src].naturalWidth ? cache[src] : null;
}

// ---- 素材版の絵（docs/art-guide.md）----
// ゲームごとに、素材を使う描き方と図形だけの旧い描き方を切り替える。
// 旧い描き方へ戻す：localStorage.setItem('incxinc.art.<ゲーム名>', 'classic')（全部まとめては 'incxinc.art'）
export function artOn(game) {
  try {
    const ls = globalThis.localStorage;
    return ls?.getItem('incxinc.art') !== 'classic' && ls?.getItem(`incxinc.art.${game}`) !== 'classic';
  } catch {
    return true;
  }
}

// 素材の束：名前で引き、足もと（下端の中央）を合わせて置く
export function sprites(game, names, k = 0.375) {
  const src = (n) => `assets/img/${game}/${n}.png`;
  // 起動したときに読み始める。ゲームを開いてから読むと、そろうまでの数秒、旧い描き方が出てしまう
  if (typeof document !== 'undefined' && artOn(game)) names.forEach((n) => image(src(n)));
  return {
    ready: () => names.map((n) => image(src(n))).every(Boolean),
    get: (n) => image(src(n)),
    // (x, y) に足もとの中央を合わせて描く。戻り値は [幅, 高さ]
    put(g, n, x, y, sc = 1, a = 1) {
      const im = image(src(n));
      if (!im) return [0, 0];
      const w = im.naturalWidth * k * sc;
      const hh = im.naturalHeight * k * sc;
      if (a !== 1) g.globalAlpha *= a;
      g.drawImage(im, x - w / 2, y - hh, w, hh);
      if (a !== 1) g.globalAlpha /= a;
      return [w, hh];
    },
    // 中心を (x, y) に合わせ、回して描く（つるはし、歯車など）
    spin(g, n, x, y, size, angle, a = 1) {
      const im = image(src(n));
      if (!im) return;
      const w = size;
      const hh = (size * im.naturalHeight) / im.naturalWidth;
      g.save();
      g.globalAlpha *= a;
      g.translate(x, y);
      g.rotate(angle);
      g.drawImage(im, -w / 2, -hh / 2, w, hh);
      g.restore();
    },
    // 色を掛けた素材（陰影は残る）。灰色で描いた岩に地層の色を付けるときなど
    dyed(n, color) {
      const key = `${src(n)}|${color}`;
      if (tinted[key]) return tinted[key];
      const im = image(src(n));
      if (!im || typeof document === 'undefined') return null;
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth;
      cv.height = im.naturalHeight;
      const c = cv.getContext('2d');
      c.drawImage(im, 0, 0);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = color;
      c.fillRect(0, 0, cv.width, cv.height);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(im, 0, 0);
      tinted[key] = cv;
      return cv;
    },
    k,
  };
}

// 床に落ちる影（光は左上から。影は少し右へ流す）
export function castShadow(g, x, y, rx, a = 0.4) {
  g.fillStyle = alpha(C.ink, a);
  g.beginPath();
  g.ellipse(x + rx * 0.08, y, rx, Math.max(2, rx * 0.2), 0, 0, Math.PI * 2);
  g.fill();
}

// 飛び散る小さなかけら（火花、土、収穫した作物など）
export class Bits {
  constructor() {
    this.list = [];
  }

  // opt: { color, size, speed, up（上向きの勢い）, gravity, life, spread（角度の広がり）, to（[x, y] へ吸い寄せる）, glow（光らせる）, fx（素材の名前：smoke / spark / debris など） }
  add(x, y, n, opt = {}) {
    for (let i = 0; i < n && this.list.length < 400; i++) {
      const a = (opt.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (opt.spread ?? Math.PI * 2);
      const sp = (opt.speed ?? 90) * (0.5 + Math.random());
      this.list.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up ?? 0),
        g: opt.gravity ?? 380, life: (opt.life ?? 0.7) * (0.7 + Math.random() * 0.6), age: 0,
        color: Array.isArray(opt.color) ? opt.color[i % opt.color.length] : opt.color ?? C.gold,
        size: (opt.size ?? 4) * (0.6 + Math.random() * 0.8), to: opt.to, glow: opt.glow, fx: opt.fx, rot: Math.random() * 6.28,
      });
    }
  }

  draw(g, dt) {
    this.list = this.list.filter((p) => p.age < p.life);
    for (const p of this.list) {
      p.age += dt;
      if (p.to) {
        const k = Math.min(1, p.age / p.life);
        p.x += (p.to[0] - p.x) * k * 0.2 + p.vx * dt * (1 - k);
        p.y += (p.to[1] - p.y) * k * 0.2 + p.vy * dt * (1 - k);
      } else {
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      const a = Math.max(0, 1 - p.age / p.life);
      if (p.glow) glow(g, p.x, p.y, p.size * 3, p.color, a * 0.45);
      // fx を指定した粒は、素材の絵で描く（煙、火花、かけら）
      if (p.fx && fx(g, p.fx, p.x, p.y, p.size * (1 + p.age / p.life), p.color, { a, rot: p.rot + p.age * 2, add: p.fx !== 'smoke' && p.fx !== 'cloud' && p.fx !== 'debris' })) continue;
      g.globalAlpha = a;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

// 桁数から、積み上がる山の大きさ（0〜1）を出す。数が 1 桁増えるごとに少しずつ育つ
export const heap = (num, perDigit = 0.05) => Math.max(0, Math.min(1, (num.m > 0 ? Math.log10(num.m) + num.e : 0) * perDigit));

// 強化の段数を、絵に出す個数へ直す（1, 2, 4, 8… と増えるたびに 1 つ増える）
export const tier = (n, max = 6) => (n > 0 ? Math.min(max, 1 + Math.floor(Math.log2(n))) : 0);

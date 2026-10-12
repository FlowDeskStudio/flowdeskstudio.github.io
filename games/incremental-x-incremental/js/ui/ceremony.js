// 節目の演出（全画面）。転生、総転生、新世界、エンディングで使う。計算には触れず、見せるだけ。
//   ceremony({ kind, title, big, sub, icons, body, button }) … 終わったら解決する Promise を返す
//   kind：'prestige'（短い金の輪）、'grand'（ゲームが 1 枚のコインへ集まる）、'world'（星の海を抜けて次の世界へ）、'ending'（星空とゲームの輪。ボタンで閉じる）
// 押すと飛ばせる（エンディングはボタンだけ）。動きを減らす設定のときは、動かさずに文字だけを短く出す。
import { h } from './dom.js';
import { C, alpha, calm } from './draw.js';

const LEN = { prestige: 1.7, grand: 2.9, world: 3.6 };
const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);
const clamp = (v) => Math.max(0, Math.min(1, v));
// 0〜1 の、毎回同じ乱数（星や粒の置き場所を、コマごとに変えないため）
const rnd = (i, k = 1) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function svgImage(html) {
  if (!html || !html.startsWith('<svg')) return null;
  const im = new Image();
  im.src = 'data:image/svg+xml,' + encodeURIComponent(html);
  return im;
}

function glowAt(g, x, y, r, color, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, alpha(color, a));
  gr.addColorStop(1, alpha(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function star(g, x, y, r, a) {
  g.fillStyle = alpha('#ffffff', a);
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.fill();
}

const drawIcon = (g, im, x, y, size, a = 1) => {
  if (!im || !im.complete || !im.naturalWidth) return;
  g.globalAlpha = a;
  g.drawImage(im, x - size / 2, y - size / 2, size, size);
  g.globalAlpha = 1;
};

// ---- それぞれの絵。t は経過秒、u は 0〜1 の進み ----
const SCENES = {
  // 転生：中心から金の輪が広がり、光の粒が立ちのぼる
  prestige(g, W, H, t, u) {
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H);
    glowAt(g, cx, cy, R * (0.25 + 0.5 * ease(clamp(u * 2))), C.gold, 0.35 * (1 - u));
    for (let i = 0; i < 3; i++) {
      const k = clamp(u * 1.6 - i * 0.18);
      if (k <= 0) continue;
      g.strokeStyle = alpha(i ? C.gold : C.goldLight, (1 - k) * 0.9);
      g.lineWidth = 3 - i;
      g.beginPath();
      g.arc(cx, cy, R * 0.06 + R * 0.5 * ease(k), 0, TAU);
      g.stroke();
    }
    for (let i = 0; i < 46; i++) {
      const k = clamp(u * 1.3 - rnd(i) * 0.3);
      const a = rnd(i, 2) * TAU;
      const d = R * (0.08 + 0.36 * rnd(i, 3)) * ease(k);
      star(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d - k * R * 0.12, 2 + rnd(i, 4) * 4, (1 - k) * 0.9);
    }
  },
  // 総転生：ゲームたちが渦を巻いて中心へ集まり、1 枚のコインになる
  grand(g, W, H, t, u, icons) {
    const cx = W / 2;
    const cy = H * 0.38;
    const R = Math.min(W, H);
    const pull = ease(clamp(u / 0.55));
    const n = Math.max(1, icons.length);
    icons.forEach((im, i) => {
      const a = (i / n) * TAU + pull * 5 + t * 0.4;
      const d = R * 0.34 * (1 - pull);
      drawIcon(g, im, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.72, R * 0.085 * (1 - pull * 0.6), 1 - clamp((u - 0.45) / 0.12));
    });
    const born = clamp((u - 0.5) / 0.14);
    if (born > 0) {
      const flash = 1 - clamp((u - 0.5) / 0.4);
      glowAt(g, cx, cy, R * (0.2 + 0.5 * flash), C.goldLight, 0.55 * flash + 0.2);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + t * 0.3;
        g.strokeStyle = alpha(C.goldLight, 0.5 * flash);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.08, cy + Math.sin(a) * R * 0.08);
        g.lineTo(cx + Math.cos(a) * R * (0.12 + 0.3 * (1 - flash)), cy + Math.sin(a) * R * (0.12 + 0.3 * (1 - flash)));
        g.stroke();
      }
      // コイン：縁、面、照り
      const r = R * 0.075 * (0.4 + 0.6 * ease(born)) * (1 + 0.04 * Math.sin(t * 6));
      const turn = Math.abs(Math.cos(t * 2.2 + 0.6));
      const face = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      face.addColorStop(0, '#fff2c4');
      face.addColorStop(0.5, C.gold);
      face.addColorStop(1, '#8a6a22');
      g.fillStyle = face;
      g.beginPath();
      g.ellipse(cx, cy, r * (0.25 + 0.75 * turn), r, 0, 0, TAU);
      g.fill();
      g.strokeStyle = alpha('#fff6d6', 0.9);
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(cx, cy, r * (0.25 + 0.75 * turn) * 0.72, r * 0.72, 0, 0, TAU);
      g.stroke();
    }
  },
  // 新世界：星が流れて光の中へ抜け、次の世界の地平が昇る
  world(g, W, H, t, u) {
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.hypot(W, H) / 2;
    const speed = ease(clamp(u / 0.5)) * (1 - ease(clamp((u - 0.62) / 0.3)));
    for (let i = 0; i < 150; i++) {
      const a = rnd(i) * TAU;
      const d0 = rnd(i, 2);
      const d = ((d0 + t * (0.05 + speed * 0.9) * (0.4 + rnd(i, 3))) % 1) * R;
      const len = 2 + speed * 90 * (d / R);
      g.strokeStyle = alpha(i % 7 ? '#dfe7ff' : C.goldLight, 0.25 + 0.7 * (d / R));
      g.lineWidth = 1 + rnd(i, 4) * 1.4;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
      g.lineTo(cx + Math.cos(a) * (d + len), cy + Math.sin(a) * (d + len));
      g.stroke();
    }
    const white = 1 - Math.abs(clamp((u - 0.5) / 0.14) * 2 - 1);
    if (u > 0.36 && u < 0.64) {
      g.fillStyle = alpha('#fff8e2', 0.85 * white);
      g.fillRect(0, 0, W, H);
    }
    // 次の世界：下から昇る、青い星の縁
    const rise = ease(clamp((u - 0.55) / 0.35));
    if (rise > 0) {
      const pr = W * 0.9;
      const py = H + pr - H * 0.26 * rise;
      glowAt(g, cx, H - H * 0.26 * rise, W * 0.5, C.azure, 0.35 * rise);
      const land = g.createLinearGradient(0, py - pr, 0, py - pr + H * 0.3);
      land.addColorStop(0, '#3f6bff');
      land.addColorStop(0.25, '#1c2f9a');
      land.addColorStop(1, '#070d26');
      g.fillStyle = land;
      g.beginPath();
      g.arc(cx, py, pr, 0, TAU);
      g.fill();
      g.strokeStyle = alpha(C.goldLight, 0.8 * rise);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, py, pr, Math.PI * 1.2, Math.PI * 1.8);
      g.stroke();
      star(g, cx + W * 0.16, H - H * 0.26 * rise - H * 0.06, 9 + 3 * Math.sin(t * 4), rise);
    }
  },
  // エンディング：ゆっくり回る星空と、育てたゲームの輪
  ending(g, W, H, t, u, icons) {
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.hypot(W, H) / 2;
    for (let i = 0; i < 180; i++) {
      const a = rnd(i) * TAU + t * 0.012 * (0.4 + rnd(i, 3));
      const d = Math.sqrt(rnd(i, 2)) * R;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.5 + rnd(i, 4)) + i));
      if (i % 23 === 0) star(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + rnd(i, 5) * 4, tw);
      else {
        g.fillStyle = alpha(i % 5 ? '#dfe7ff' : C.goldLight, tw * 0.8);
        g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6, 1.6);
      }
    }
    const show = ease(clamp(t / 2.5));
    const ring = Math.min(W * 0.44, H * 0.4);
    glowAt(g, cx, cy, ring * 1.5, C.royal, 0.3 * show);
    const n = Math.max(1, icons.length);
    icons.forEach((im, i) => {
      const a = (i / n) * TAU + t * 0.07 - Math.PI / 2;
      const k = ease(clamp(t / 2.5 - (i / n) * 0.6));
      const x = cx + Math.cos(a) * ring * (1.25 - 0.25 * k);
      const y = cy + Math.sin(a) * ring * 0.86 * (1.25 - 0.25 * k);
      glowAt(g, x, y, 40, C.goldLight, 0.22 * k);
      drawIcon(g, im, x, y + Math.sin(t * 1.4 + i) * 4, 52, k);
    });
  },
};

export function ceremony({ kind, title, big, sub, icons = [], body = [], button }) {
  return new Promise((resolve) => {
    const still = calm();
    const cv = h('canvas');
    const text = h('div', { class: 'cer-text' },
      title ? h('div', { class: 'cer-title' }, title) : null,
      big ? h('div', { class: 'cer-big' }, big) : null,
      sub ? h('div', { class: 'cer-sub' }, sub) : null,
      body, button ? h('button', { class: 'btn primary cer-btn' }, button) : null);
    const el = h('div', { id: 'ceremony', class: `cer-${kind}${still ? ' still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' }, cv, text);
    const g = cv.getContext('2d');
    const ims = icons.map(svgImage).filter(Boolean);
    const len = still ? 1.4 : LEN[kind] || 0;
    let W = 0;
    let H = 0;
    const fit = () => {
      W = cv.width = innerWidth;
      H = cv.height = innerHeight;
    };
    fit();
    addEventListener('resize', fit);
    let done = false;
    let raf = 0;
    const start = performance.now();
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', fit);
      el.classList.add('out');
      setTimeout(() => {
        el.remove();
        resolve();
      }, 260);
    };
    const tick = (now) => {
      if (done) return;
      const t = (now - start) / 1000;
      const u = len ? clamp(t / len) : 0;
      g.clearRect(0, 0, W, H);
      if (!still) SCENES[kind]?.(g, W, H, t, u, ims);
      if (len && t >= len) return finish();
      raf = requestAnimationFrame(tick);
    };
    if (button) el.querySelector('.cer-btn').addEventListener('click', finish);
    else el.addEventListener('pointerdown', () => { if (performance.now() - start > 450) finish(); });
    document.body.append(el);
    el.querySelector('.cer-btn')?.focus();
    raf = requestAnimationFrame(tick);
  });
}

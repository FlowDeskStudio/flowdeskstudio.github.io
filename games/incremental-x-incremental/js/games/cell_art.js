// 細胞増殖の絵（描き込み版）。計算には触れず、渡された状態を描くだけ。
// 細胞はやわらかく形を変えるものなので、素材の画像ではなく、キャンバスで 1 つずつ描く（docs/art-guide.md の「動き」）。
// 重ねる順：研究室の壁と台 → 培養皿（ガラス、培地、目盛り）→ 細胞 → 採取機 → 棚のフラスコ → スポイト。
import { C, alpha, mix, lin, rr, disc, line, tag, glow, sparkle } from '../ui/draw.js';

export const cellArtReady = () => true;

// 細胞 1 つ：ゆらぐ膜、透ける中身、核、つや
function cell(g, x, y, r, col, t, seed, gloss, splitting) {
  // 膜の形：円を、ゆっくり変わる波でゆがめる
  const N = 10;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const w = 1 + 0.09 * Math.sin(t * 1.7 + seed + i * 1.9) + 0.06 * Math.sin(t * 2.6 + seed * 2 + i * 3.1);
    const sx = splitting ? 1 + 0.35 * splitting * Math.abs(Math.cos(a)) : 1; // 分かれる前は、横に伸びる
    pts.push([x + Math.cos(a) * r * w * sx, y + Math.sin(a) * r * w]);
  }
  g.beginPath();
  for (let i = 0; i < N; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % N];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    if (i === 0) g.moveTo(mx, my);
    const nx = pts[(i + 1) % N];
    const n2 = pts[(i + 2) % N];
    g.quadraticCurveTo(nx[0], nx[1], (nx[0] + n2[0]) / 2, (nx[1] + n2[1]) / 2);
  }
  g.closePath();
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r * 1.15);
  gr.addColorStop(0, alpha(mix(col, '#ffffff', 0.55), 0.85));
  gr.addColorStop(0.6, alpha(col, 0.55));
  gr.addColorStop(1, alpha(mix(col, C.ink, 0.25), 0.7));
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = alpha(mix(col, '#ffffff', 0.35), 0.9);
  g.lineWidth = Math.max(0.8, r * 0.12);
  g.stroke();
  // 核
  disc(g, x + r * 0.16 + Math.sin(t + seed) * r * 0.08, y + r * 0.14, r * 0.34, alpha(mix(col, C.ink, 0.55), 0.75));
  disc(g, x + r * 0.1 + Math.sin(t + seed) * r * 0.08, y + r * 0.08, r * 0.12, alpha(mix(col, '#ffffff', 0.3), 0.6));
  // つや（酵素の段が上がるほど、はっきり）
  if (gloss > 0) {
    g.strokeStyle = alpha('#ffffff', 0.25 + gloss * 0.5);
    g.lineWidth = Math.max(0.7, r * 0.13);
    g.lineCap = 'round';
    g.beginPath();
    g.arc(x, y, r * 0.66, Math.PI * 1.12, Math.PI * 1.48);
    g.stroke();
  }
}

// ガラスのフラスコ：中の液は、培養液の段で量と濃さが変わる
function flask(g, x, y, sz, fill, col, gold, t) {
  const path = () => {
    g.beginPath();
    g.moveTo(x - sz * 0.15, y - sz);
    g.lineTo(x + sz * 0.15, y - sz);
    g.lineTo(x + sz * 0.15, y - sz * 0.56);
    g.quadraticCurveTo(x + sz * 0.5, y - sz * 0.1, x + sz * 0.46, y - sz * 0.03);
    g.quadraticCurveTo(x + sz * 0.44, y, x + sz * 0.38, y);
    g.lineTo(x - sz * 0.38, y);
    g.quadraticCurveTo(x - sz * 0.44, y, x - sz * 0.46, y - sz * 0.03);
    g.quadraticCurveTo(x - sz * 0.5, y - sz * 0.1, x - sz * 0.15, y - sz * 0.56);
    g.closePath();
  };
  g.fillStyle = alpha(C.ink, 0.35);
  g.beginPath();
  g.ellipse(x + 2, y + 1, sz * 0.46, sz * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  path();
  g.fillStyle = alpha(C.ice, 0.1);
  g.fill();
  g.save();
  path();
  g.clip();
  const top = y - sz * 0.62 * fill;
  g.fillStyle = lin(g, 0, top, 0, y, alpha(mix(col, '#ffffff', 0.35), 0.9), alpha(col, 0.95));
  g.fillRect(x - sz, top + Math.sin(t * 2 + x) * 0.8, sz * 2, sz);
  rr(g, x - sz, top + Math.sin(t * 2 + x) * 0.8, sz * 2, 1.5, 0, alpha('#ffffff', 0.5));
  for (let i = 0; i < 3; i++) {
    const u = (t * 0.5 + i / 3 + x * 0.01) % 1;
    disc(g, x - sz * 0.2 + i * sz * 0.2, y - u * sz * 0.5 * fill, 1 + u, alpha('#ffffff', 0.45 * (1 - u)));
  }
  g.restore();
  path();
  g.strokeStyle = alpha(C.ice, 0.75);
  g.lineWidth = 1.1;
  g.stroke();
  line(g, [x - sz * 0.06, y - sz * 0.92, x - sz * 0.06, y - sz * 0.6, x - sz * 0.3, y - sz * 0.18], alpha('#ffffff', 0.4), 1.2); // ガラスの照り返し
  rr(g, x - sz * 0.2, y - sz - 3, sz * 0.4, 4, 1.5, gold ? lin(g, 0, y - sz - 3, 0, y - sz + 1, C.goldLight, C.goldDark) : C.steel);
}

export function drawCell(g, v) {
  const { W, H, CX, CY, R, clock, dots, n, col, col2, good, x, lo, hi, med, enz, big, auto, pull, flasks, flaskShown, flaskTier, broth, offer } = v;

  // ================= 1. 研究室：壁のタイルと、台 =================
  g.fillStyle = lin(g, 0, 0, 0, H, '#182a80', C.ink);
  g.fillRect(0, 0, W, H);
  for (let x2 = 0; x2 < W; x2 += 40) rr(g, x2, 0, 1, H - 34, 0, alpha(C.ice, 0.035));
  for (let y2 = 0; y2 < H - 34; y2 += 40) rr(g, 0, y2, W, 1, 0, alpha(C.ice, 0.035));
  rr(g, 0, H - 34, W, 34, 0, lin(g, 0, H - 34, 0, H, '#22306e', C.ink));
  rr(g, 0, H - 34, W, 1.5, 0, alpha(C.gold, 0.45));

  // ================= 2. 培養皿：二重のガラスの縁、培地、ふちの目盛り =================
  glow(g, CX, CY, R + 44, good ? C.gold : C.azure, 0.28);
  g.fillStyle = alpha(C.ink, 0.45);
  g.beginPath();
  g.ellipse(CX + 4, CY + 6, R + 2, R + 2, 0, 0, Math.PI * 2);
  g.fill();
  disc(g, CX, CY, R, lin(g, CX - R, CY - R, CX + R, CY + R, '#22389a', '#070d26'), alpha(C.ice, 0.7), 1.6);
  disc(g, CX, CY, R - 5, null, alpha(C.ice, 0.22), 1);
  // 培地：段が上がるほど明るく、泡が増える
  const bed = g.createRadialGradient(CX, CY, 10, CX, CY, R - 14);
  bed.addColorStop(0, alpha(col, 0.16 + Math.min(0.16, med * 0.007)));
  bed.addColorStop(1, alpha(col, 0.04));
  disc(g, CX, CY, R - 15, bed);
  for (let i = 0; i < Math.min(14, med); i++) {
    const a = i * 1.7 + clock * 0.2;
    const rad = ((R - 30) * ((i * 37) % 100)) / 100;
    const up = (clock * 0.4 + i * 0.13) % 1;
    disc(g, CX + Math.cos(a) * rad, CY + Math.sin(a) * rad - up * 8, 1.2 + up * 1.6, null, alpha(C.ice, 0.45 * (1 - up)), 0.8);
  }
  // 目盛り：金の帯が「ちょうどよい量」、明るい弧がいまの量
  const ang = (u) => -Math.PI / 2 + u * Math.PI * 2;
  g.lineCap = 'butt';
  g.lineWidth = 5;
  g.strokeStyle = alpha(C.ice, 0.1);
  g.beginPath();
  g.arc(CX, CY, R - 9, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = alpha(C.gold, 0.6);
  g.beginPath();
  g.arc(CX, CY, R - 9, ang(lo), ang(hi));
  g.stroke();
  for (let i = 0; i < 20; i++) line(g, [CX + Math.cos(ang(i / 20)) * (R - 13), CY + Math.sin(ang(i / 20)) * (R - 13), CX + Math.cos(ang(i / 20)) * (R - 6), CY + Math.sin(ang(i / 20)) * (R - 6)], alpha(C.ink, 0.5), 1);
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.strokeStyle = good ? C.goldLight : C.rose;
  g.beginPath();
  g.arc(CX, CY, R - 9, ang(0), ang(Math.min(1, x)));
  g.stroke();
  const ea = ang(Math.min(1, x));
  disc(g, CX + Math.cos(ea) * (R - 9), CY + Math.sin(ea) * (R - 9), 4, '#ffffff');

  // ================= 3. 細胞：変異を重ねると色が移り、大型化で粒が大きくなる。いちばん新しい数個は、分かれたばかりで脈打つ =================
  const gloss = Math.min(1, enz / 12);
  for (let i = 0; i < n; i++) {
    const fresh = i >= n - 3;
    const px = dots[i][0] + Math.sin(clock * 1.3 + i * 1.7) * 2.2;
    const py = dots[i][1] + Math.cos(clock * 1.1 + i * 2.3) * 2.2;
    const r = dots[i][2] * big * (fresh ? 0.7 + 0.3 * Math.abs(Math.sin(clock * 6 + i)) : 1);
    cell(g, px, py, r, i % 4 === 0 ? col2 : col, clock, i * 1.3, gloss, fresh ? Math.abs(Math.sin(clock * 3 + i)) : 0);
  }
  // 皿のガラスの照り返し
  g.strokeStyle = alpha('#ffffff', 0.16);
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(CX, CY, R - 22, Math.PI * 1.08, Math.PI * 1.42);
  g.stroke();

  // ================= 4. 採取機：皿のふちを回る腕。採る割合が高いほど速い =================
  if (auto) {
    const a = clock * (0.3 + pull * 0.02);
    const ax = CX + Math.cos(a) * (R - 28);
    const ay = CY + Math.sin(a) * (R - 28);
    const bx = CX + Math.cos(a) * (R + 6);
    const by = CY + Math.sin(a) * (R + 6);
    line(g, [bx, by, ax, ay], alpha(C.ink, 0.5), 4);
    line(g, [bx, by, ax, ay], C.gold, 2);
    disc(g, bx, by, 5, lin(g, bx - 5, by - 5, bx + 5, by + 5, C.goldLight, C.goldDark));
    disc(g, ax, ay, 6.5, alpha(C.gold, 0.2), C.goldLight, 1.4);
    disc(g, ax, ay, 2, C.goldLight);
  }

  // ================= 5. 棚：フラスコ。本数で数、ふたの色で改良、中身で培養液 =================
  const liquid = mix(col, C.azure, 0.3);
  for (const sy of [150, 236]) {
    rr(g, 290, sy, 180, 4, 2, lin(g, 0, sy, 0, sy + 4, C.goldLight, C.goldDark));
    rr(g, 290, sy + 4, 180, 3, 0, alpha(C.ink, 0.4));
  }
  for (let i = 0; i < flaskShown; i++) flask(g, 314 + (i % 4) * 42, Math.floor(i / 4) ? 236 : 150, 46, broth * (0.85 + 0.15 * Math.sin(clock * 1.5 + i)), liquid, flaskTier > 0, clock);
  tag(g, `×${flasks}`, 380, 26, { size: 10.5 });

  // ================= 6. 酵素：スポイトから、金のしずくが落ちる =================
  if (enz > 0) {
    rr(g, 438, 42, 6, 26, 2, alpha(C.ice, 0.3), alpha(C.ice, 0.7), 1);
    rr(g, 439.5, 52, 3, 14, 1, alpha(C.gold, 0.8));
    rr(g, 435, 34, 12, 9, 4, lin(g, 0, 34, 0, 43, C.goldLight, C.goldDark));
    const d = (clock * 0.8) % 1;
    disc(g, 441, 70 + d * 24, 2.2 * (1 - d * 0.5), C.goldLight);
    tag(g, `Lv ${enz}`, 441, 22, { size: 10.5 });
  }
  if (offer && Math.floor(clock * 2) % 2 === 0) sparkle(g, CX + R - 20, CY - R + 20, 9, C.goldLight);
}

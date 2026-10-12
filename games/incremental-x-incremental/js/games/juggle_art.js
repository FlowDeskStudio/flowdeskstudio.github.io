// ジャグリングの絵（素材版）。計算（判定、得点）には触れず、渡された状態を描くだけ。
// 素材：tools/art_juggle.py（同じレンダラーで作った幕、床、照明、手袋、実、観客、メトロノーム）。決まりは docs/art-guide.md。
// 小さな劇場。重ねる順：奥の壁 → 照明の光 → 舞台の床 → 幕 → 連続の灯 → 手袋と受ける輪 → 実 → 客席。
import { C, alpha, lin, rr, disc, line, tag, glow, meter, sprites, castShadow } from '../ui/draw.js';

const S = sprites('juggle', ['curtain', 'floor', 'light', 'glove', 'glove_gold', 'fruit_0', 'fruit_1', 'fruit_2', 'fan_0', 'fan_1', 'fan_2', 'metronome']);
export const juggleArtReady = () => S.ready();

export function drawJuggle(g, v) {
  const { W, H, X0, X1, HAND, clock, p, heat, trim, lamps, streak, win, partner, tempo, fruitTier, extra, flair, arc } = v;
  const FLOOR = H - 44; // 舞台の床の上端

  // ================= 1. 奥の壁と、照明の光（客席が沸くほど明るい）=================
  g.fillStyle = lin(g, 0, 0, 0, FLOOR, '#141f66', '#0a1238');
  g.fillRect(0, 0, W, FLOOR);
  for (let x = 70; x < W - 60; x += 34) rr(g, x, 0, 1, FLOOR, 0, alpha(C.ink, 0.25));
  for (const lx of [150, W - 150]) {
    const tx = W / 2 + (lx < W / 2 ? 80 : -80);
    g.fillStyle = lin(g, 0, 24, 0, FLOOR, alpha(C.goldLight, 0.1 + heat * 0.16), alpha(C.goldLight, 0));
    g.beginPath();
    g.moveTo(lx - 7, 26);
    g.lineTo(lx + 7, 26);
    g.lineTo(tx + 74, FLOOR + 6);
    g.lineTo(tx - 74, FLOOR + 6);
    g.fill();
  }

  // ================= 2. 舞台の床（木の板）。ぴったりの改良で、縁の金が太くなる =================
  for (let x = 0; x < W; x += 96) S.put(g, 'floor', x + 48, FLOOR + 30, 1);
  g.fillStyle = lin(g, 0, FLOOR, 0, FLOOR + 30, alpha(C.ink, 0.15), alpha(C.ink, 0.55));
  g.fillRect(0, FLOOR - 2, W, 34);
  g.fillStyle = alpha(C.goldLight, 0.1 + heat * 0.12);
  g.beginPath();
  g.ellipse(W / 2, FLOOR + 10, 150, 9, 0, 0, Math.PI * 2);
  g.fill();
  rr(g, 0, FLOOR + 26, W, 2 + trim, 0, C.gold);

  // ================= 3. 幕と、上の飾り、照明 =================
  S.put(g, 'curtain', 26, FLOOR + 12, 1);
  S.put(g, 'curtain', W - 26, FLOOR + 12, 1);
  rr(g, 0, 0, W, 14, 0, lin(g, 0, 0, 0, 14, '#3a5ae0', '#1c2f9a'));
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#22389e' : '#2c48c0';
    g.beginPath();
    g.moveTo(i * 40, 14);
    g.quadraticCurveTo(i * 40 + 20, 34, i * 40 + 40, 14);
    g.fill();
  }
  rr(g, 0, 13, W, 2, 0, C.gold);
  for (const lx of [150, W - 150]) {
    S.put(g, 'light', lx, 44, 0.8);
    glow(g, lx, 40, 14, C.goldLight, 0.5 + heat * 0.3);
  }
  // 度胸：連続の上限まで、舞台の上に灯が並ぶ。いまの連続のぶんが点く
  for (let i = 0; i < lamps; i++) {
    const on = streak >= (i + 1) * 5;
    const lx = W / 2 + (i - (lamps - 1) / 2) * 14;
    if (on) glow(g, lx, 38, 8, C.gold, 0.7);
    disc(g, lx, 38, 2.6, on ? C.goldLight : alpha(C.ice, 0.22));
  }

  // ================= 4. テンポ：メトロノーム。段が上がるほど速く振れる =================
  if (tempo > 0) {
    const mx = 84;
    castShadow(g, mx, FLOOR + 14, 12, 0.35);
    S.put(g, 'metronome', mx, FLOOR + 16, 0.8);
    const a = Math.sin(p * Math.PI * 2) * 0.5;
    line(g, [mx, FLOOR + 6, mx + Math.sin(a) * 30, FLOOR + 6 - Math.cos(a) * 30], C.gold, 1.4);
    disc(g, mx + Math.sin(a) * 20, FLOOR + 6 - Math.cos(a) * 20, 3, C.goldLight);
    tag(g, `Lv ${tempo}`, mx, FLOOR - 34, { size: 10.5 });
  }

  // ================= 5. 手袋と、受ける位置（外の輪が「受けられる」、金の輪が「ぴったり」）=================
  disc(g, X1, HAND, 26, null, alpha(C.ice, 0.3), 1.2);
  disc(g, X1, HAND, 15, null, C.gold, 2 + win * 60);
  castShadow(g, X0, FLOOR + 14, 14, 0.3);
  castShadow(g, X1, FLOOR + 14, 14, 0.3);
  S.put(g, 'glove', X0, HAND + 34, 0.9);
  S.put(g, partner ? 'glove_gold' : 'glove', X1, HAND + 34, 0.9);

  // ================= 6. 実：数が増えるほど控えの実が弧に並び、改良で色づく。華の段で光の尾が伸びる =================
  const name = `fruit_${fruitTier >= 3 ? 2 : fruitTier >= 1 ? 1 : 0}`;
  for (let i = 1; i <= extra; i++) {
    const [ex, ey] = arc((p + i / (extra + 1)) % 1);
    S.spin(g, name, ex, ey, 20, clock * 4 + i, 0.4);
  }
  for (let i = 1; i <= flair; i++) {
    const [tx, ty] = arc(Math.max(0, p - i * 0.022));
    disc(g, tx, ty, 5 * (1 - i / (flair + 1)), alpha(C.goldLight, 0.45 * (1 - i / (flair + 1))));
  }
  const [x, y] = arc(p);
  glow(g, x, y, 26, C.gold, 0.3 + heat * 0.3);
  S.spin(g, name, x, y, 34, clock * 5);
  tag(g, `×${v.label}`, X0, HAND - 16, { size: 10.5 });

  // ================= 7. 客席：沸くほど人が増えて、よく弾む =================
  rr(g, 0, H - 14, W, 14, 0, alpha(C.ink, 0.6));
  const heads = Math.round(heat * 22);
  for (let i = 0; i < heads; i++) {
    const hx = 12 + ((i * 7) % 22) * ((W - 24) / 21);
    const hy = H + 12 - Math.abs(Math.sin(clock * (4 + (i % 3)) + i)) * (3 + heat * 7);
    S.put(g, `fan_${i % 3}`, hx, hy, 0.62);
  }
  rr(g, W / 2 - 68, H - 13, 136, 11, 5.5, alpha(C.ink, 0.82), alpha(C.gold, 0.3), 1); // 客席の頭に埋もれないよう、下地を敷く
  meter(g, W / 2 - 60, H - 7, 120, heat, C.gold, 3);
}

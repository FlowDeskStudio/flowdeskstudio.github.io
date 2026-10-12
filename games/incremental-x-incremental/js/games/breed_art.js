// 品種改良の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_breed.py（同じレンダラーで作った苗・育成灯・苗床・台車＋ Kenney の鉢と木箱）。
// 夜の温室。重ねる順：空とガラス → 育成灯の光 → 棚 → 鉢と苗 → 苗床 → 木箱と台車 → 文字。
import { C, alpha, lin, rr, line, text, tag, glow, sparkle, stage, sprites, castShadow } from '../ui/draw.js';

const S = sprites('breed', ['lamp', 'tray', 'tray_gold', 'cart', 'crate', 'crate_gold',
  ...[0, 1, 2, 3, 4, 5].map((i) => `plant_${i}`), ...[0, 1, 2, 3, 4, 5, 6].map((i) => `pot_${i}`)]);
export const breedArtReady = () => S.ready();

// 戻り値：鉢の並びの位置と大きさ（出荷のかけらを飛ばすのに使う）
export function drawBreed(g, v) {
  const { W, H, FX, FY, FW, FH, clock, list, n, mode, labels, beds, bedTier, stock, pile, shipTier, auto, popAt } = v;
  const lampCol = [C.goldLight, C.rose, C.violet][mode] || C.goldLight;

  // ================= 1. 温室：夜空、ガラスの骨組み、育成灯（育て方で光の色が変わる）=================
  stage(g, W, H, { top: '#1a2c7c', bottom: '#0d1640', stars: 20, t: clock });
  g.strokeStyle = alpha(C.ice, 0.28);
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
    g.fillStyle = lin(g, 0, 22, 0, 140, alpha(lampCol, 0.2), alpha(lampCol, 0));
    g.beginPath();
    g.moveTo(x - 13, 22);
    g.lineTo(x + 13, 22);
    g.lineTo(x + 64, 140);
    g.lineTo(x - 64, 140);
    g.fill();
    S.put(g, 'lamp', x, 26, 0.9);
    glow(g, x, 22, 16, lampCol, 0.6);
  }
  rr(g, 0, H - 14, W, 14, 0, lin(g, 0, H - 14, 0, H, '#1a2050', C.ink));
  rr(g, 0, H - 14, W, 1, 0, alpha(C.gold, 0.5));

  // ================= 2. 鉢の並び =================
  const per = n <= 10 ? n : Math.ceil(n / Math.ceil(n / 10));
  const lines = Math.ceil(n / per);
  const cw = Math.min(58, FW / per);
  const ch = Math.min(120, FH / lines);
  const ox = FX + (FW - cw * per) / 2;
  const oy = FY + (FH - ch * lines) / 2;
  const potW = Math.min(cw * 0.78, 36);
  const potK = potW / (S.get('pot_0').naturalWidth * S.k);
  const potH = S.get('pot_0').naturalHeight * S.k * potK;
  // 棚：金の縁の板
  for (let r = 1; r <= lines; r++) {
    rr(g, ox - 6, oy + r * ch - 5, cw * per + 12, 3, 1.5, lin(g, 0, oy + r * ch - 5, 0, oy + r * ch - 2, C.gold, C.goldDark));
    rr(g, ox - 6, oy + r * ch - 2, cw * per + 12, 3, 0, alpha(C.ink, 0.35));
  }
  for (let i = 0; i < n; i++) {
    const x = ox + (i % per) * cw + cw / 2;
    const y = oy + (Math.floor(i / per) + 1) * ch - 5;
    const grade = list[i];
    if (grade === undefined) {
      // 空いた鉢は、うっすらと
      S.put(g, 'pot_1', x, y + 1, potK, 0.22);
      continue;
    }
    const step = grade % 6;
    const pt = Math.min(6, Math.floor(grade / 6));
    const age = clock - (popAt[i] ?? -9);
    // 等級が上がった瞬間、ぽんと弾んで光る
    const k = age < 0.3 ? 0.55 + 0.45 * (age / 0.3) + Math.sin((age / 0.3) * Math.PI) * 0.25 : 1;
    const im = S.get(`plant_${step}`);
    // 苗は鉢の上に立つ。棚の高さに収まるよう、背の高い等級ほど縮める
    const room = ch - potH - 8;
    const hh = Math.min(room, im.naturalHeight * S.k * 1.2) * k;
    const w = (hh * im.naturalWidth) / im.naturalHeight;
    const sway = Math.sin(clock * 1.8 + x * 0.1) * 1.2;
    if (pt > 0) glow(g, x + sway, y - potH - hh + 6, 12 + pt * 2, C.goldLight, 0.25);
    g.drawImage(im, x - w / 2 + sway * 0.5, y - potH * 0.72 - hh, w, hh);
    S.put(g, `pot_${pt}`, x, y + 1, potK);
    if (age < 0.3) sparkle(g, x, y - potH - hh * 0.5, 9 * (1 - age / 0.3), C.goldLight);
    // ラベル：鉢の前の札に等級。段が上がると札が金になる
    const lw = Math.min(18, potW * 0.6);
    rr(g, x - lw / 2, y - 3, lw, 10, 2.5, labels > 6 ? C.gold : labels > 0 ? C.ivory : alpha(C.ink, 0.75), labels > 0 ? null : alpha(C.ice, 0.3), 1);
    text(g, String(grade + 1), x, y + 5, 8.5, labels > 0 ? C.ink : C.ivory);
  }

  // ================= 3. 左：苗床（数で段が増え、改良で金の縁、台木の段で苗が育つ）=================
  for (let i = 0; i < beds; i++) {
    const by = 76 + i * 22;
    S.put(g, bedTier > 0 ? 'tray_gold' : 'tray', 46, by, 0.9 + Math.min(0.12, stock * 0.008));
  }
  tag(g, `×${v.bedLabel}`, 46, 46, { size: 10.5 });

  // ================= 4. 出荷：木箱の山と、出荷係の台車 =================
  castShadow(g, 34, H - 14, 24, 0.35);
  for (let i = 0; i < pile; i++) S.put(g, shipTier > 0 ? 'crate_gold' : 'crate', 24 + (i % 2) * 22, H - 14 - Math.floor(i / 2) * 18, 0.85);
  if (auto) {
    const cx = 78 + Math.sin(clock * 1.2) * 4;
    castShadow(g, cx, H - 14, 12, 0.35);
    S.put(g, 'cart', cx, H - 13, 0.8);
  }
  return { ox, oy, cw, ch };
}

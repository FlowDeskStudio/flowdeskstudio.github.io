// 塔の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_tower.py（Kenney「Castle Kit」の塔の階・旗・岩、3DAssets.dev の登り手と財宝の袋）。
// 月夜の塔。重ねる順：空と月 → 地面と岩 → 網 → 塔の階（下から上へ）→ 綱 → 登り手 → 財宝の袋。
import { C, alpha, mix, lin, rr, disc, line, text, tag, glow, gem, coin, sparkle, stage, sprites, castShadow } from '../ui/draw.js';

const S = sprites('tower', ['floor', 'floor_ghost', 'rocks', 'flag', 'climber_0', 'climber_1', 'climber_2', 'climber_3', 'sack', 'sack_gold']);
export const towerArtReady = () => S.ready();

export function drawTower(g, v) {
  const { W, H, GY, FH, TX, TW, clock, cam, pos, shake, floor, goal, riskOf, ins, rope, crew, ct, boots } = v;
  const MX = TX + TW / 2;
  stage(g, W, H, { top: '#101c52', bottom: '#1f3fae', stars: 34, t: clock });
  disc(g, W - 70, 46 + cam * 2, 20, C.goldLight);
  glow(g, W - 70, 46 + cam * 2, 70, C.goldLight, 0.3);
  const ground = GY + cam * FH;
  if (ground < H) {
    rr(g, 0, ground, W, H - ground, 0, lin(g, 0, ground, 0, H, '#16305a', C.ink));
    castShadow(g, MX, ground + 3, 84, 0.45);
    S.put(g, 'rocks', TX - 78, ground + 12, 0.5);
    S.put(g, 'rocks', TX + TW + 66, ground + 14, 0.62);
  }
  g.save();
  g.translate(shake, 0);

  // ================= 1. 保険：塔の足もとの網。段が上がるほど広い =================
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

  // ================= 2. 塔：下の階から積む。のぼった階は窓に灯がともり、危ない階ほど赤い =================
  const topF = Math.ceil(cam + 11);
  for (let f = Math.max(1, Math.floor(cam)); f <= topF; f++) {
    const y = GY - (f - cam) * FH;
    const r = riskOf(f);
    const done = f <= floor;
    S.put(g, done ? 'floor' : 'floor_ghost', MX, y + FH, 1, done ? 1 : 0.42);
    if (r > 0) rr(g, TX + 1, y + 1, TW - 2, FH - 2, 1, alpha(C.rose, Math.min(0.55, r * 0.75)));
    for (const wx of [TX + 24, MX, TX + TW - 24]) {
      rr(g, wx - 5, y + 6, 10, 14, [5, 5, 1, 1], done ? C.goldLight : alpha(C.ink, 0.45), alpha(C.ink, 0.5), 1);
      if (done) glow(g, wx, y + 12, 13, C.gold, 0.4);
    }
    text(g, String(f), TX - 30, y + FH / 2 + 4, 10.5, done ? C.ivory : C.muted, 'right', 600);
    if (r > 0) text(g, `${Math.round(r * 100)}%`, TX + TW + 30, y + FH / 2 + 4, 10.5, C.rose, 'left');
    // 荷運び：引き返す階に金の枠と旗
    if (f === goal) {
      rr(g, TX - 2, y - 1, TW + 4, FH + 1, 3, null, C.gold, 1.6);
      S.put(g, 'flag', TX + TW + 12, y + FH, 0.9);
    }
  }

  // ================= 3. 命綱：塔の左に下がる綱。段が上がるほど金に近づき、結び目が増える =================
  const RX = TX - 12;
  if (rope > 0) {
    const rc = mix('#b98a4a', C.goldLight, Math.min(1, rope / 15));
    line(g, [RX, 0, RX + Math.sin(clock * 1.5) * 2, H], rc, 1.6);
    for (let i = 0; i < Math.min(8, rope); i++) disc(g, RX, ((i * 37 + cam * FH) % H + H) % H, 2.2, rc);
  }

  // ================= 4. 登り手：人数で列が伸び、改良で服の色が変わる。靴の段で足もとの光が長くなる =================
  const cy = GY - (pos - cam) * FH;
  for (let i = crew - 1; i >= 0; i--) {
    const px = RX + Math.sin(clock * 10 + i) * 1.2;
    const py = cy - 8 + i * 24;
    if (py > H + 20) continue;
    if (i === 0) {
      for (let b = 1; b <= boots; b++) disc(g, px, py + 24 + b * 4, 2.4 * (1 - b / (boots + 1)), alpha(C.goldLight, 0.5 * (1 - b / (boots + 1))));
      glow(g, px, py, 18, C.goldLight, 0.5);
    }
    glow(g, px, py + 2, 16, C.ice, 0.28);
    S.put(g, `climber_${Math.min(3, ct)}`, px, py + 24 + Math.sin(clock * 10 + i) * 1, 0.82);
  }
  g.restore();
  tag(g, `×${v.label}`, 44, H - 16, { size: 10.5 });

  // ================= 5. 財宝の袋：のぼるほどふくらむ。鑑定の段で、口から宝石がのぞく =================
  if (floor > 0) {
    const { r, gold, ap } = v.sack;
    const bx = W - 96;
    const sc = r / 28;
    const top = H - 14 - 60 * sc;
    glow(g, bx, H - 14 - 28 * sc, r * 1.8, C.gold, 0.3);
    castShadow(g, bx, H - 14, r * 0.9, 0.4);
    S.put(g, gold ? 'sack_gold' : 'sack', bx + 4 * sc, H - 12, sc);
    for (let i = 0; i < ap; i++) gem(g, bx - 12 + i * 6, top - 2 - (i % 2) * 4, 4, [C.azure, C.rose, C.teal, C.violet, C.gold][i]);
    coin(g, bx - r * 0.9, H - 18, Math.max(4, r * 0.2));
    if (Math.floor(clock * 2) % 2 === 0) sparkle(g, bx + r * 0.5, H - 14 - 40 * sc, 5, '#ffffff');
  }
}

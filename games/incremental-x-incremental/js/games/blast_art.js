// 発破場の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_blast.py（Kenney「Nature Kit」の岩壁と岩、「Survival Kit」の樽と岩＋同じレンダラーで作った起爆装置）。
// 夜の採石場。重ねる順：空と地面 → 岩壁 → 鉱脈と穴 → 導火線 → 火薬庫と起爆装置 → 砕石の山 → 文字。
import { C, alpha, mix, lin, rr, disc, line, tag, glow, sparkle, fx, stage, sprites, castShadow, calm } from '../ui/draw.js';

const S = sprites('blast', ['cliff', 'rock_a', 'rock_b', 'rock_c', 'rock_gold', 'keg', 'det', 'det_gold', 'plunger']);
export const blastArtReady = () => S.ready();

export function drawBlast(g, v) {
  const { W, H, GY, CX, HOLES, hole, clock, boom, size, press, col, filled, charge, target, veins, fuses, fuseGold, spark, kegs, auto, pile } = v;
  g.save();
  if (boom > 0 && !calm()) g.translate((Math.random() - 0.5) * boom * 18 * size, (Math.random() - 0.5) * boom * 18 * size);
  g.translate(-10, -10);
  stage(g, W + 20, H + 20, { top: '#1a2c7c', bottom: '#0d1640', horizon: GY + 10, floor: '#141e52', floorEnd: C.ink, stars: 22, t: clock });
  g.translate(10, 10);

  // ================= 1. 岩壁：岩の板を積み、もとの崖の形に切り抜く =================
  const edge = () => {
    g.beginPath();
    g.moveTo(CX, GY);
    g.lineTo(CX + 18, GY - 70);
    g.lineTo(CX + 8, GY - 120);
    g.lineTo(CX + 40, GY - 168);
    g.lineTo(W + 10, GY - 176);
    g.lineTo(W + 10, GY);
    g.closePath();
  };
  castShadow(g, CX + 120, GY + 2, 130, 0.4);
  g.save();
  edge();
  g.clip();
  const tile = S.dyed('cliff', '#8c96cc');
  for (let row = 3; row >= 0; row--) for (let c = 0; c < 6; c++) if (tile) g.drawImage(tile, CX - 10 + c * 46 + (row % 2) * 20, GY - 52 - row * 44, 48, 53);
  // 岩の板の規則正しさを崩すため、壁のあちこちに岩を張り出させる
  for (let i = 0; i < 9; i++) {
    const im = S.dyed(i % 2 ? 'rock_a' : 'rock_b', '#7f8ac0');
    if (im) g.drawImage(im, CX + 6 + ((i * 71) % 190), GY - 176 + ((i * 53) % 150), 34 + (i % 3) * 8, 30 + (i % 3) * 7);
  }
  // 上ほど月の光、下ほど影
  g.fillStyle = lin(g, 0, GY - 176, 0, GY, alpha('#ffffff', 0.1), alpha(C.ink, 0.45));
  g.fillRect(CX, GY - 180, W - CX + 10, 180);
  // 起爆の直後：壁にひびが走って光る
  if (boom > 0) {
    const a = boom / 0.45;
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + 0.4;
      const len = 30 + size * 70;
      line(g, [CX + 110, GY - 70, CX + 110 + Math.cos(ang) * len * 0.5 + 6, GY - 70 + Math.sin(ang) * len * 0.5, CX + 110 + Math.cos(ang) * len, GY - 70 + Math.sin(ang) * len - 5], alpha(C.goldLight, a * 0.9), 1.4);
    }
  }
  g.restore();
  g.strokeStyle = alpha(C.ice, 0.45);
  g.lineWidth = 1;
  edge();
  g.stroke();
  // 収量：段が上がるほど、壁に金の鉱石がのぞく
  for (let i = 0; i < veins; i++) {
    const vx = CX + 36 + ((i * 83) % 168);
    const vy = GY - 150 + ((i * 47) % 128);
    S.put(g, 'rock_gold', vx, vy + 6, 0.5);
    if ((i + Math.floor(clock * 2)) % 5 === 0) sparkle(g, vx + 3, vy - 5, 3.4, '#ffffff', 0.9);
  }

  // ================= 2. 穴：火薬がたまるほど埋まる。自動起爆の目印は金の輪。からの穴には焦げ跡 =================
  for (let i = 0; i < HOLES; i++) {
    const [x, y] = hole(i);
    const k = Math.max(0, Math.min(1, filled - i));
    disc(g, x, y + 1.5, 12.5, alpha(C.ink, 0.5));
    disc(g, x, y, 11, lin(g, x, y - 11, x, y + 11, '#02040f', '#141c44'), i === target ? C.gold : alpha(C.ice, 0.35), i === target ? 2 : 1);
    if (k <= 0 && charge < 20) disc(g, x, y, 14, null, alpha('#3a2030', 0.7 * (1 - charge / 20)), 4);
    if (k > 0) {
      if (k >= 1) glow(g, x, y, 18, col, 0.4);
      disc(g, x, y, 9 * Math.sqrt(k), lin(g, x - 9, y - 9, x + 9, y + 9, mix(col, '#ffffff', 0.4), mix(col, C.ink, 0.45)));
      if (k >= 1) disc(g, x - 3, y - 3, 2, alpha('#ffffff', 0.7));
    }
  }

  // ================= 3. 導火線：本数で数、改良で金の線。火花が走る =================
  for (let i = 0; i < fuses; i++) {
    g.strokeStyle = i < fuseGold ? C.gold : alpha(C.ice, 0.6);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(112, GY - 14);
    g.bezierCurveTo(160, GY - 2 - i * 5, 210, GY - 30 + i * 4, CX + 20, GY - 30 - i * 6);
    g.stroke();
  }
  const sx = 112 + (CX - 92) * spark;
  const sy = GY - 14 - 16 * spark + Math.sin(spark * 6) * 4;
  glow(g, sx, sy, 10, C.amber, 0.8);
  sparkle(g, sx, sy, 4, C.goldLight);
  tag(g, `×${v.fuseLabel}`, 190, GY - 42, { size: 10.5 });

  // ================= 4. 火薬庫（樽）と起爆装置 =================
  for (let i = 0; i < kegs; i++) {
    const kx = 22 + (i % 3) * 17 + (i >= 3 ? 8 : 0);
    const ky = GY + 4 - Math.floor(i / 3) * 4;
    if (i < 3) castShadow(g, kx, ky, 8, 0.35);
    S.put(g, 'keg', kx, ky - Math.floor(i / 3) * 22, 0.62);
  }
  if (v.magazine > 0) tag(g, `Lv ${v.magazine}`, 40, GY + 18, { size: 10.5 });
  const down = boom > 0 || press > 0 ? 8 : 0;
  castShadow(g, 108, GY + 4, 20, 0.4);
  S.put(g, 'plunger', 108, GY - 22 + down, 0.9);
  S.put(g, v.detGold ? 'det_gold' : 'det', 108, GY + 6, 0.9);
  // 自動起爆：アンテナの先で緑の灯が点滅する
  if (auto) {
    line(g, [124, GY - 26, 124, GY - 48], C.ice, 1);
    const on = Math.floor(clock * 2) % 2 === 0;
    disc(g, 124, GY - 49, 2.4, on ? C.leaf : C.steelDark);
    if (on) glow(g, 124, GY - 49, 9, C.leaf, 0.7);
  }

  // ================= 5. 砕石の山：稼ぐほど積み上がる =================
  castShadow(g, 190, GY + 24, 46, 0.4);
  let placed = 0;
  for (let row = 0; placed < pile; row++) {
    const cols = Math.max(1, 6 - row);
    for (let c = 0; c < cols && placed < pile; c++, placed++) {
      S.put(g, placed % 5 === 2 ? 'rock_gold' : placed % 2 ? 'rock_c' : 'rock_a', 150 + c * 16 + row * 8, GY + 28 - row * 9, 0.62);
    }
  }
  // 起爆の閃光
  if (boom > 0.25) fx(g, 'burst', CX + 110, GY - 70, 40 + size * 90, C.goldLight, { a: (boom - 0.25) * 5, add: true });
}

// 揺れを戻す（かけらを描いたあとで呼ぶ）
export function endBlast(g) {
  g.restore();
}

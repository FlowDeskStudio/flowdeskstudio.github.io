// 精錬所の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_smeltery.py（3DAssets.dev の煙突・ふいご・るつぼ・延べ棒、Kenney の金床と管、同じレンダラーで作った炉・鋳型・台）。
// 夜の精錬所。重ねる順：空と床 → 煙突と煙 → 炉 → 炎 → ふいご → 湯とるつぼ → 延べ棒の台 → 文字。
import { C, alpha, mix, lin, rr, disc, line, tag, glow, sparkle, smoke, fx, stage, sprites, castShadow } from '../ui/draw.js';

const S = sprites('smeltery', ['furnace', 'chimney_0', 'chimney_1', 'chimney_2', 'chimney_3', 'bellows_open', 'bellows_shut', 'mold', 'crucible', 'crucible_gold',
  'ingot_iron', 'ingot_bronze', 'ingot_steel', 'rack', 'anvil', 'pipe']);
export const smelteryArtReady = () => S.ready();

// 戻り値：るつぼと延べ棒の台の位置（鋳込みのかけらを飛ばすのに使う）
export function drawSmeltery(g, v) {
  const { W, H, GY, clock, st, e, k, f1, f2, metal, stacks, ftier, brick, thermo, blowing, fans, pump, give, pure, cast, ctier, pile } = v;
  const FX = 214; // 炉のまんなか
  const BASE = GY + 8;
  const MOUTH = BASE - 42; // 焚き口のまんなかの高さ
  stage(g, W, H, { top: '#1a2c7c', bottom: '#0d1640', horizon: GY, floor: '#131c4e', floorEnd: C.ink, stars: 16, t: clock });
  for (const y of [GY + 10, GY + 24]) rr(g, 0, y, W, 1, 0, alpha(C.ice, 0.04));

  // ================= 1. 煙突：炉の数で本数が増え、改良で金の帯が付く。熱しすぎの煙は赤い =================
  for (let i = 0; i < stacks; i++) {
    const x = stacks === 1 ? FX : FX - 34 + (i * 68) / (stacks - 1);
    if (v.heat > 10) {
      for (let j = 0; j < 3; j++) smoke(g, x, BASE - 150, (clock * 0.4 + j / 3 + i * 0.17) % 1, { color: st === 'slag' ? C.rose : st === 'hot' ? C.amber : C.ice, rise: 34, size: 8, a: 0.36 });
    }
    S.put(g, `chimney_${Math.min(3, ftier)}`, x, BASE - 62, 1.1);
  }
  // 還元：親のゲームへ返す管が、左へ伸びる
  if (give > 0) {
    for (let x = 16; x < 100; x += 34) S.put(g, 'pipe', x + 17, GY - 76, 1);
    for (let i = 0; i < 4; i++) disc(g, 96 - ((clock * 30 + i * 21) % 84), GY - 85, 1.8, C.goldLight);
    tag(g, `Lv ${give}`, 54, GY - 104, { size: 10.5 });
  }

  // ================= 2. 炉 =================
  castShadow(g, FX, BASE - 2, 66, 0.5);
  glow(g, FX, MOUTH, 150, f2, 0.14 + k * 0.26);
  S.put(g, 'furnace', FX, BASE, 1.16);
  // 耐火れんが：段が上がるほど、焚き口の両わきに金の目地が増える
  for (let i = 0; i < Math.min(10, brick); i++) {
    const y = BASE - 16 - i * 4;
    rr(g, FX - 56, y, 24, 1.3, 0, alpha(C.gold, 0.85));
    rr(g, FX + 32, y, 24, 1.3, 0, alpha(C.gold, 0.85));
  }
  // 炎：温度で大きさと色が変わる。焚き口の中で揺れる
  if (v.heat > 3) {
    glow(g, FX, MOUTH + 4, 34 + k * 26, f2, 0.6);
    g.save();
    g.beginPath();
    g.ellipse(FX, MOUTH + 4, 19, 24, 0, 0, Math.PI * 2);
    g.clip();
    const fh = 12 + k * 30;
    for (let i = 0; i < 3; i++) {
      if (i === 2 && (st === 'cold' || st === 'slag')) continue;
      const w = [15, 10, 6][i] * (0.6 + k * 0.5);
      const fl = fh * [1, 0.72, 0.45][i] * (1 + Math.sin(clock * (9 + i * 3) + i) * 0.1);
      g.fillStyle = [f2, f1, '#ffffff'][i];
      g.beginPath();
      g.moveTo(FX - w, MOUTH + 28);
      g.quadraticCurveTo(FX - w * 0.9, MOUTH + 28 - fl * 0.6, FX + Math.sin(clock * 7 + i) * 3, MOUTH + 28 - fl);
      g.quadraticCurveTo(FX + w * 0.9, MOUTH + 28 - fl * 0.6, FX + w, MOUTH + 28);
      g.fill();
    }
    g.restore();
    for (let i = 0; i < 3; i++) {
      const u = (clock * 0.9 + i / 3) % 1;
      fx(g, 'spark', FX + Math.sin(i * 2.1 + clock) * 10, MOUTH - u * (16 + k * 20), 4 + k * 4, f1, { a: (1 - u) * k, add: true, rot: u * 3 });
    }
  }
  tag(g, `×${v.label}`, FX, BASE - 104, { size: 10.5 });
  // 温度調節器：炉の肩の文字盤。針がいまの温度
  if (thermo) {
    const tx = FX + 40;
    const ty = BASE - 84;
    disc(g, tx, ty, 8, C.ink, C.gold, 1.4);
    const a = Math.PI * (0.8 + k * 1.4);
    line(g, [tx, ty, tx + Math.cos(a) * 5.5, ty + Math.sin(a) * 5.5], st === 'good' ? C.goldLight : C.rose, 1.6);
  }

  // ================= 3. ふいご：送風機の段で台数が増え、送風量が多いほど速く動く =================
  for (let i = 0; i < fans; i++) {
    const bx = FX - 100 - i * 36;
    const shut = pump > 0 || (blowing > 0 && Math.sin(clock * (2 + blowing * 1.5) + i) > 0.3);
    castShadow(g, bx, BASE - 4, 16, 0.35);
    S.put(g, shut ? 'bellows_shut' : 'bellows_open', bx, BASE - 2, 0.95);
    if (shut && blowing > 0) disc(g, bx + 26 + ((clock * 60) % 14), BASE - 12, 1.3, alpha(C.ice, 0.6));
  }
  if (v.blower > 0) tag(g, `Lv ${v.blower}`, FX - 100 - (fans - 1) * 18, BASE + 14, { size: 10.5 });

  // ================= 4. 湯：精錬できているあいだ、炉から鋳型へ流れる。純度が上がるほど白く輝く =================
  const MX = FX + 92;
  const CX = FX + 136;
  castShadow(g, MX, BASE - 4, 18, 0.35);
  S.put(g, 'mold', MX, BASE - 2, 0.9);
  if (e > 0) {
    g.strokeStyle = mix(st === 'hot' ? '#ff6a3a' : C.amber, '#ffffff', pure * 0.6);
    g.lineWidth = 1.6 + e * 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(FX + 60, BASE - 30);
    g.quadraticCurveTo(MX, BASE - 34, MX, BASE - 12);
    g.stroke();
    glow(g, MX, BASE - 16, 20, C.amber, 0.5);
    rr(g, MX - 11, BASE - 13, 22, 3, 1.5, mix(C.amber, '#ffffff', pure * 0.6));
  }
  // るつぼ：鋳込みのたまり具合で、中の湯が上がってくる
  castShadow(g, CX, BASE - 4, 18, 0.4);
  S.put(g, ctier > 0 ? 'crucible_gold' : 'crucible', CX, BASE - 2, 0.9);
  const lv = Math.min(1, cast);
  g.fillStyle = lv >= 1 ? '#fff6d6' : lin(g, CX - 12, 0, CX + 12, 0, C.goldLight, C.amber);
  g.beginPath();
  g.ellipse(CX, BASE - 24, 11, 4.4, 0, 0, Math.PI * 2);
  g.globalAlpha = 0.25 + 0.75 * lv;
  g.fill();
  g.globalAlpha = 1;
  if (lv >= 1) {
    glow(g, CX, BASE - 24, 30, C.gold, 0.5 + 0.2 * Math.sin(clock * 5));
    sparkle(g, CX + 12, BASE - 34, 6, '#ffffff');
  }

  // ================= 5. 延べ棒の台と金床 =================
  const RX = W - 62;
  castShadow(g, RX, BASE - 2, 50, 0.35);
  S.put(g, 'rack', RX + 6, BASE, 0.74);
  S.put(g, 'anvil', RX + 34, BASE + 12, 0.7);
  let placed = 0;
  for (let row = 0; placed < pile; row++) {
    const cols = Math.max(1, 5 - row);
    for (let col = 0; col < cols && placed < pile; col++, placed++) {
      const x = RX + 6 - (cols - 1) * 9 + col * 18;
      S.put(g, `ingot_${metal}`, x, BASE - 36 - row * 6.5, 0.9);
      if (pure > 0 && (placed + Math.floor(clock * 2)) % 7 === 0) sparkle(g, x + 5, BASE - 46 - row * 6.5, 3, '#ffffff', 0.9);
    }
  }
  return { cruc: [CX, BASE - 26], rack: [RX, BASE - 50] };
}

// クリッカーの絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_clicker.py（Kenney の Nature / Survival / Fantasy Town / Factory / Pirate / City Kit Commercial ＋同じレンダラーの立体）。
// 夜の果樹園。重ねる順：空 → 地平線の建物 → 地面 → 実 → 手前の設備 → 水辺 → 文字。
import { C, alpha, lin, rr, disc, line, tag, glow, sparkle, smoke, stage, sprites, castShadow, tier } from '../ui/draw.js';

const S = sprites('clicker', ['pawpaw', 'pawpaw_ripe', 'pawpaw_gold', 'fruit', 'mound', 'basket', 'sapling', 'tree_a', 'tree_b', 'cart',
  'press', 'press_plate', 'stall_a', 'stall_b', 'cannery', 'dock', 'ship', 'airship', 'city_a', 'city_b', 'city_c', 'city_d']);
export const clickerArtReady = () => S.ready();

export function drawClicker(g, v) {
  const { W, H, HZ, FX, FY, clock, press, n, tiers, fren, big } = v;
  // 改良の段数は、金のきらめきの数で示す
  const pips = (x, y, id) => {
    const k = tiers(id);
    for (let i = 0; i < k; i++) sparkle(g, x + (i - (k - 1) / 2) * 9, y, 3.4, C.gold);
  };
  const count = (x, y, id) => tag(g, `×${v.label(id)}`, x, y, { size: 10.5 });

  stage(g, W, H, { top: fren ? '#3b3a8a' : C.navy, bottom: '#101c52', horizon: HZ, floor: '#12305a', floorEnd: C.ink, stars: 26, t: clock });

  // ================= 1. 地平線：街、加工場、果樹園、市場 =================
  // 街：数が増えるほど、高い建物が建っていく
  if (n('city') > 0) {
    const k = tier(n('city'), 7);
    const row = ['city_a', 'city_b', 'city_a', 'city_c', 'city_b', 'city_d', 'city_c'];
    for (let i = 0; i < k; i++) {
      const bx = 466 - i * 15;
      S.put(g, row[i], bx, HZ + 2, 0.74);
      // 窓あかり
      for (let w = 0; w < 3; w++) if ((i * 3 + w + Math.floor(clock * 0.5)) % 4) rr(g, bx - 4 + (w % 2) * 5, HZ - 10 - w * 9, 2, 2.4, 0.5, alpha(C.goldLight, 0.85));
    }
    // 遠くのものは紺に沈める
    pips(424, HZ - 86, 'city');
    count(436, HZ + 14, 'city');
  }
  // 加工場：煙突から煙
  if (n('cannery') > 0) {
    const x = 334;
    castShadow(g, x, HZ + 5, 20, 0.35);
    for (let i = 0; i < 3; i++) smoke(g, x + 9, HZ - 62, (clock * 0.3 + i / 3) % 1, { rise: 26, size: 6 });
    S.put(g, 'cannery', x, HZ + 6, 0.92);
    pips(x, HZ - 72, 'cannery');
    count(x, HZ + 16, 'cannery');
  }
  // 果樹園：地平線に並ぶ、実のなった木
  if (n('grove') > 0) {
    const k = 2 + tier(n('grove'), 5);
    for (let i = 0; i < k; i++) {
      const tx = 20 + i * 15;
      castShadow(g, tx, HZ + 5 + (i % 2) * 3, 8, 0.3);
      S.put(g, i % 2 ? 'tree_a' : 'tree_b', tx, HZ + 6 + (i % 2) * 3, 0.9 + (i % 3) * 0.06);
    }
    pips(20 + (k - 1) * 7.5, HZ - 44, 'grove');
    count(20 + (k - 1) * 7.5, HZ - 62, 'grove'); // 札は木の上へ（下に置くと、手前の木箱に重なる）
  }
  // 市場：屋台
  if (n('market') > 0) {
    const x = 126;
    castShadow(g, x + 10, HZ + 5, 22, 0.3);
    S.put(g, 'stall_a', x, HZ + 6, 0.9);
    if (tier(n('market'), 5) >= 3) S.put(g, 'stall_b', x + 26, HZ + 8, 0.9);
    glow(g, x + 8, HZ - 12, 22, C.goldLight, 0.2);
    pips(x + 10, HZ - 42, 'market');
    count(x + 10, HZ - 52, 'market');
  }
  // 飛行船：空をゆっくり行き来する
  if (n('airship') > 0) {
    const x = 92 + Math.sin(clock * 0.22) * 44;
    const y = 66 + Math.sin(clock * 0.9) * 3;
    S.put(g, 'airship', x, y, 0.85);
    pips(x, y - 38, 'airship');
    count(x, y + 10, 'airship');
  }

  // ================= 2. まんなかの実 =================
  // 堆肥：段が上がるほど、足もとの土の山が大きくなる
  const rich = Math.min(1, n('compost') / 12);
  S.put(g, 'mound', FX, HZ + 14, 1 + rich * 0.3);
  castShadow(g, FX, HZ + 6, 56, 0.4);
  glow(g, FX, FY, 120, big || fren ? C.gold : C.azure, big ? 0.5 : 0.3);
  // 連動：実のまわりを回る光
  const sync = Math.min(20, n('sync'));
  for (let i = 0; i < sync; i++) {
    const a = clock * 0.6 + (i / sync) * Math.PI * 2;
    if (Math.sin(a) < 0) disc(g, FX + Math.cos(a) * 84, FY + Math.sin(a) * 50, 1.8, alpha(C.goldLight, 0.6));
  }
  // 実：たたくとつぶれて戻る。豊作のあいだは色づき、大粒のあいだは大きくなる
  const im = S.get(fren ? 'pawpaw_ripe' : 'pawpaw');
  const sq = 1 - (press / 0.16) * 0.1;
  const sc = (big ? 1.12 : 1) * (1 + Math.sin(clock * 1.6) * 0.012) * S.k;
  const pw = im.naturalWidth * sc * (2 - sq);
  const ph = im.naturalHeight * sc * sq * sq;
  g.drawImage(im, FX - pw * 0.56, HZ + 2 - ph, pw, ph);
  for (let i = 0; i < sync; i++) {
    const a = clock * 0.6 + (i / sync) * Math.PI * 2;
    if (Math.sin(a) >= 0) disc(g, FX + Math.cos(a) * 84, FY + Math.sin(a) * 50, 1.8, alpha(C.goldLight, 0.9));
  }
  // 接ぎ木：足もとに小さな実がなる
  const graft = Math.min(8, n('graft'));
  for (let i = 0; i < graft; i++) {
    const side = i % 2 ? 1 : -1;
    S.put(g, 'fruit', FX + side * (50 + Math.floor(i / 2) * 13), HZ + 13 + (Math.floor(i / 2) % 2) * 4, 1);
  }
  // 手袋：実を囲む金の弧
  for (let i = 0; i < v.gloves; i++) {
    g.beginPath();
    g.arc(FX, FY + 6, 72 + i * 6, Math.PI * 0.1, Math.PI * 0.36);
    g.strokeStyle = alpha(C.gold, 0.8 - i * 0.2);
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.stroke();
  }
  // まだ触っていないうちは、実のまわりに輪が広がって誘う
  if (v.clicks < 5) {
    const u = (clock * 0.6) % 1;
    g.beginPath();
    g.ellipse(FX, FY + 6, 62 + u * 30, 46 + u * 24, -0.26, 0, Math.PI * 2);
    g.strokeStyle = alpha(C.goldLight, 0.55 * (1 - u));
    g.lineWidth = 1.5;
    g.stroke();
  }

  // ================= 3. 手前：かご、苗木、荷車、圧搾機 =================
  if (n('picker') > 0) {
    const k = tier(n('picker'), 5);
    for (let i = 0; i < k; i++) {
      const x = 26 + i * 19;
      const y = 250 + (i % 2) * 7;
      castShadow(g, x, y, 9, 0.35);
      S.put(g, 'basket', x, y + 2, 0.95);
    }
    pips(26 + (k - 1) * 9.5, 224, 'picker');
    count(26 + (k - 1) * 9.5, 268, 'picker');
  }
  if (n('tree') > 0) {
    const k = tier(n('tree'), 4);
    for (let i = 0; i < k; i++) {
      const x = 136 + i * 13;
      const y = 256 - (i % 2) * 9;
      castShadow(g, x, y, 6, 0.3);
      S.put(g, 'sapling', x, y + 2, 1);
    }
    pips(136 + (k - 1) * 6.5, 214, 'tree');
    count(136 + (k - 1) * 6.5, 268, 'tree');
  }
  if (n('cart') > 0) {
    const x = 318 + Math.sin(clock * 0.7) * 5;
    castShadow(g, x, 254, 20, 0.35);
    S.put(g, 'cart', x, 257, 0.95);
    pips(x, 226, 'cart');
    count(318, 268, 'cart');
  }
  if (n('press') > 0) {
    const x = 392;
    const d = (Math.sin(clock * 3) + 1) * 3;
    castShadow(g, x, 254, 18, 0.35);
    S.put(g, 'press', x, 257, 0.9);
    S.put(g, 'press_plate', x, 232 + d, 0.8);
    disc(g, x, 259 + ((clock * 20) % 5), 1.5, C.gold);
    pips(x, 200, 'press');
    count(x, 268, 'press');
  }

  // ================= 4. 港：手前の水辺に、桟橋と船 =================
  if (n('port') > 0) {
    g.fillStyle = lin(g, 0, 276, 0, H, '#1c44b0', C.ink);
    g.fillRect(0, 278, W, H - 278);
    rr(g, 0, 278, W, 1, 0, alpha(C.ice, 0.35));
    for (let i = 0; i < 9; i++) line(g, [i * 60 + ((clock * 14) % 60) - 20, 284 + (i % 3) * 5, i * 60 + ((clock * 14) % 60), 284 + (i % 3) * 5], alpha(C.ice, 0.25), 1);
    S.put(g, 'dock', 446, 290, 0.9);
    S.put(g, 'ship', 222, 298 + Math.sin(clock * 1.4) * 1.2, 0.8);
    pips(222, 262, 'port');
    count(262, 290, 'port');
  }
}

// 金のポポー（ほかの絵やかけらの上に描く）
export function drawGold(g, x, y, clock, leaving) {
  g.save();
  if (leaving) g.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(clock * 8));
  glow(g, x, y, 44, C.gold, 0.6);
  S.put(g, 'pawpaw_gold', x + 3, y + 16 + Math.sin(clock * 3) * 4, 1);
  sparkle(g, x + 18, y - 14, 5 + Math.sin(clock * 5) * 2, '#ffffff');
  g.restore();
}

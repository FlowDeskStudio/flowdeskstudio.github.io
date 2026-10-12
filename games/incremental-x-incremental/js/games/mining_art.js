// 採掘の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_mining.py（Kenney「Survival Kit」「Nature Kit」＋同じレンダラーで作った立体）。決まりは docs/art-guide.md。
// 地層は断面で見せる（工場のような箱庭ではない）。重ねる順：地層 → 岩と鉱石 → 立坑 → 坑木と灯り → 道具 → 文字。
import { C, alpha, mix, lin, rr, line, tag, glow, sparkle, meter, stage, sprites } from '../ui/draw.js';

const S = sprites('mining', ['rock_a', 'rock_b', 'rock_c', 'rock_d', 'rock_e', 'ore_gold', 'ore_white', 'ore_teal', 'nugget',
  'pick_0', 'pick_1', 'pick_2', 'pick_3', 'drill_0', 'drill_1', 'drill_2', 'drill_3', 'headframe', 'timber', 'bucket', 'sieve', 'tnt', 'tnt_off', 'lantern', 'tree']);
const ROCKS = ['rock_a', 'rock_b', 'rock_c', 'rock_d', 'rock_e'];
export const miningArtReady = () => S.ready();

// 戻り値：いま掘っている面の高さ（かけらを飛ばす位置に使う）
export function drawMining(g, v) {
  const { W, H, LH, TOP, SX, SW, depth, frac, scroll, hit, clock, strata, isVein, isMother } = v;
  const MID = SX + SW / 2;
  let topY = TOP;
  g.clearRect(0, 0, W, H);

  // 色を掛けた岩を置く
  const rock = (name, x, y, sc, color) => {
    const im = S.dyed(name, color);
    if (!im) return;
    const w = im.width * S.k * sc;
    const hh = im.height * S.k * sc;
    g.drawImage(im, x - w / 2, y - hh, w, hh);
  };

  // ================= 1. 地層（断面）=================
  for (let r = -4; r <= 4; r++) {
    const d = depth + r;
    const y = TOP + r * LH + scroll;
    if (y > H || y + LH < 0) continue;
    if (d < 0) {
      // 地上：夜空。地表の 1 段には草、木、立坑のやぐら
      g.save();
      g.beginPath();
      g.rect(0, y, W, LH + 1);
      g.clip();
      g.translate(0, y);
      stage(g, W, LH + 1, { top: d === -1 ? C.navy : C.night, bottom: d === -1 ? C.royal : C.navy, stars: d === -1 ? 6 : 14, t: clock });
      g.restore();
      if (d === -1) {
        for (const tx of [26, 60, 96, 372, 414, 452]) S.put(g, 'tree', tx, y + LH - 4, 0.8 + ((tx * 7) % 5) * 0.06);
        rr(g, 0, y + LH - 7, W, 8, 0, lin(g, 0, y + LH - 7, 0, y + LH + 1, '#5fae7b', '#2f6d50'));
        S.put(g, 'headframe', MID, y + LH - 5, 1.02);
      }
      continue;
    }
    const vein = isVein(d);
    const mother = isMother(d);
    const col = strata(d);
    // 地の色：上が明るく、下へ沈む。うっすらと堆積の筋
    g.fillStyle = lin(g, 0, y, 0, y + LH, mix(col, '#ffffff', 0.1), mix(col, C.ink, 0.38));
    g.fillRect(0, y, W, LH + 1);
    for (let k = 0; k < 3; k++) {
      const ly = y + 12 + k * 16 + ((d * 7 + k * 5) % 6);
      rr(g, 0, ly, W, 1, 0, alpha(k % 2 ? '#ffffff' : C.ink, k % 2 ? 0.06 : 0.14));
    }
    rr(g, 0, y + LH - 2, W, 2, 0, alpha(C.ink, 0.35));
    // 埋まった岩（地層の色に染める）。鉱脈の層は、金や白の結晶が光る
    const tone = mix(col, '#ffffff', 0.42);
    for (let k = 0; k < 6; k++) {
      const side = k % 2;
      const px = (side ? SX + SW + 24 : 44) + ((d * 37 + k * 53) % 98);
      const py = y + 22 + ((d * 17 + k * 29) % (LH - 24));
      if (vein && k < 4) {
        glow(g, px, py - 6, 18, mother ? '#ffffff' : C.gold, 0.35 + 0.1 * Math.sin(clock * 2 + k + d));
        S.put(g, mother ? 'ore_white' : 'ore_gold', px, py, 0.5 + ((d + k) % 3) * 0.12);
        if ((k + Math.floor(clock * 2)) % 5 === 0) sparkle(g, px + 4, py - 12, 3.5, '#ffffff', 0.9);
      } else {
        rock(ROCKS[(d * 3 + k) % ROCKS.length], px, py, 0.6 + ((d + k * 7) % 5) * 0.1, tone);
      }
    }
    tag(g, String(d + 1), 20, y + LH / 2, { size: 10.5, color: vein ? C.goldLight : C.ice, line: vein ? alpha(C.gold, 0.6) : alpha(C.ice, 0.2) });

    // ================= 2. 立坑 =================
    const dug = r < 0 ? LH + 1 : r === 0 ? (1 - frac) * LH : 0;
    if (dug > 0) {
      g.fillStyle = lin(g, SX, 0, SX + SW, 0, '#03061a', '#0a1233', '#03061a');
      g.fillRect(SX, y, SW, dug);
      // 壁ぎわは地層の色が少しのぞく
      g.fillStyle = lin(g, SX, 0, SX + 14, 0, alpha(col, 0.5), alpha(col, 0));
      g.fillRect(SX, y, 14, dug);
      g.fillStyle = lin(g, SX + SW - 14, 0, SX + SW, 0, alpha(col, 0), alpha(col, 0.5));
      g.fillRect(SX + SW - 14, y, 14, dug);
    }
    if (r < 0) {
      // 掘り終えた層：坑木で支え、1 段おきに灯りを吊る
      S.put(g, 'timber', MID, y + LH + 1, 1);
      if (d % 2 === 0) {
        const lx = SX + 46;
        glow(g, lx, y + 20, 46, C.goldLight, 0.22 + 0.04 * Math.sin(clock * 3 + d));
        S.put(g, 'lantern', lx, y + 28, 0.9);
      }
    }
    if (r === 0) {
      topY = y + dug;
      // いま掘っている岩の面：明るく浮かせ、削れるほどひびが増える
      g.fillStyle = lin(g, 0, topY, 0, y + LH, alpha('#ffffff', 0.2), alpha('#ffffff', 0.03));
      g.fillRect(SX, topY, SW, LH - dug);
      rr(g, SX, topY, SW, 2, 0, vein ? C.goldLight : C.ice);
      const cracks = Math.floor((1 - frac) * 5);
      for (let k = 0; k < cracks; k++) {
        const cx = SX + 24 + k * 30;
        line(g, [cx, topY + 2, cx + 5, topY + 10, cx - 3, topY + 17, cx + 4, topY + 26].map((p, i) => (i % 2 ? Math.min(p, y + LH - 2) : p)), alpha(C.ink, 0.6), 1.2);
      }
      // 面に転がる砕けた岩
      if (LH - dug > 16) {
        rock('rock_c', SX + 24, y + LH - 2, 0.55, tone);
        rock('rock_d', SX + SW - 30, y + LH - 2, 0.5, tone);
      }
    }
  }

  // ================= 3. 立坑の中：はしご、巻き上げの桶、結晶、ふるい =================
  const shaftTop = Math.max(0, TOP - depth * LH + scroll);
  line(g, [SX, shaftTop, SX, topY], alpha(C.gold, 0.5), 1);
  line(g, [SX + SW, shaftTop, SX + SW, topY], alpha(C.gold, 0.5), 1);
  // はしご
  g.strokeStyle = alpha('#c9a05a', 0.9);
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(SX + 9, shaftTop);
  g.lineTo(SX + 9, topY);
  g.moveTo(SX + 21, shaftTop);
  g.lineTo(SX + 21, topY);
  for (let y = shaftTop + (scroll % 12); y < topY - 2; y += 12) {
    g.moveTo(SX + 9, y);
    g.lineTo(SX + 21, y);
  }
  g.stroke();
  // 巻き上げ：綱の先の桶が、鉱石を積んで上がっていく（ドリルが動いているあいだ）
  if (v.drills > 0 && topY - shaftTop > 60) {
    const up = (clock * 0.22) % 1;
    const bx = MID - 4;
    const by = topY - 30 - up * (topY - 30 - shaftTop + 20);
    line(g, [bx, shaftTop, bx, by - 26], alpha(C.ice, 0.55), 1);
    S.put(g, 'bucket', bx, by, 0.85);
  }
  // 鉱脈の知恵：壁に生える青緑の結晶
  for (let i = 0; i < v.wise; i++) {
    const cy = topY - 12 - Math.floor(i / 2) * 28;
    if (cy < shaftTop + 10) break;
    const cx = i % 2 ? SX + SW - 12 : SX + 36;
    glow(g, cx, cy - 6, 18, C.teal, 0.4 + 0.15 * Math.sin(clock * 2 + i));
    S.put(g, 'ore_teal', cx, cy, 0.5);
  }
  // ふるい：立坑の口で鉱石をふるう。段が上がるほど網が重なり、金の粒がよく落ちる
  if (v.sieve > 0 && topY - shaftTop > 50) {
    const sy = Math.max(shaftTop + 20, 24);
    const sx = SX + SW - 46;
    const nets = Math.min(3, 1 + Math.floor(v.sieve / 8));
    for (let k = nets - 1; k >= 0; k--) S.put(g, 'sieve', sx + Math.sin(clock * 9 + k * 2) * 1.5, sy + k * 8, 0.78);
    for (let k = 0; k < Math.min(4, 1 + Math.floor(v.sieve / 3)); k++) {
      const u = (clock * 1.3 + k * 0.27) % 1;
      S.put(g, 'nugget', sx - 14 + k * 9, sy + nets * 8 + 4 + u * 22, 0.6, 1 - u);
    }
    tag(g, `Lv ${v.sieve}`, SX + SW + 24, sy - 6, { size: 10.5 }); // 立坑の外へ（中に置くと、ドリルの札に重なる）
  }

  // ================= 4. 道具 =================
  // ドリル：台数が増えるほど並ぶ。改良で金の帯が増え、モーターを積むほど速く震える
  for (let i = 0; i < v.drillShown; i++) {
    const dx = MID + 16 + i * 14;
    const j = Math.sin(clock * (26 + v.motor * 3) + i * 2) * (1.1 + Math.min(1.2, v.motor * 0.1));
    if (v.motor > 0) glow(g, dx, topY - 24 + j, 10, C.amber, 0.4);
    S.put(g, `drill_${Math.min(3, v.drillTier)}`, dx, topY + 2 + j, 0.8);
  }
  if (v.drills > 0) tag(g, `×${v.drillLabel}`, MID + 16 + (v.drillShown - 1) * 7, Math.max(12, topY - 46), { size: 10.5 });
  // つるはし：改良で刃が鉄 → 青 → 鋼 → 金。たたくと振り下ろす
  const swing = hit > 0 ? 1 - hit / 0.18 : 1;
  S.spin(g, `pick_${Math.min(3, v.pickTier)}`, MID - 40 + swing * 4, topY - 20 + swing * 5, 36, -1.1 + swing * 1.5);
  tag(g, `Lv ${v.pick}`, MID - 62, Math.max(12, topY - 54), { size: 10.5, color: C.ice, line: alpha(C.ice, 0.25) });

  // ================= 5. 発破の支度（右上）=================
  S.put(g, v.dynReady ? 'tnt' : 'tnt_off', W - 30, 44, 0.85);
  if (v.dynReady) {
    line(g, [W - 30, 16, W - 26, 9, W - 20, 8], C.ice, 1);
    sparkle(g, W - 20, 8, 4 + Math.sin(clock * 14) * 1.5, C.goldLight);
    glow(g, W - 20, 8, 12, C.amber, 0.7);
  } else meter(g, W - 43, 49, 26, v.dynFrac, C.amber, 3);
  return topY;
}

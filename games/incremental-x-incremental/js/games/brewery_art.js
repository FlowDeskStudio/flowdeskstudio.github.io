// 醸造所の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_brewery.py（3DAssets.dev の樽・仕込み桶・ランタン、Kenney「Food Kit」のびん、同じレンダラーで作った柱と台木）。
// 字で説明しない。酒の流れ（仕込み桶 → 管 → 樽 → びん）と、樽ごとの熟成（酒の色、液面、まわりの目盛り）を絵で見せる。
// 重ねる順：壁と床 → 柱とアーチ → 管 → 棚の仕込み桶 → ランタン → 樽の棚 → 樽 → 床のびん → 瓶詰めの動き。
import { C, alpha, mix, lin, rr, disc, tag, glow, sparkle, stage, sprites, castShadow } from '../ui/draw.js';

const S = sprites('brewery', ['cask', 'cask_gold', 'vat_0', 'vat_1', 'vat_2', 'vat_3', 'bottle_red', 'bottle_white', 'lantern', 'chock', 'pillar']);
export const breweryArtReady = () => S.ready();

const COPPER = '#d39a62';
const WORTH = [0, 1, 2, 3, 1]; // 段ごとの値打ちを、びんの数で見せる（若い酒 1、熟成 2、古酒 3）
// 絵だけの状態：前のコマの熟成と段（熟成が下がったら「瓶詰めした」と分かる）と、瓶詰めの動き
const prev = [];
const pours = [];

export function drawBrewery(g, v) {
  const { W, H, GY, clock, dt, vats, vt, yeast, auto, lamp, casks, colors, blend, shelf, bt, two } = v;
  stage(g, W, H, { top: '#16226a', bottom: '#0b1438', horizon: GY, floor: '#141c40', floorEnd: C.ink });
  for (const y of [GY + 12, GY + 24]) rr(g, 0, y, W, 1, 0, alpha(C.ice, 0.05));

  // ================= 1. 蔵の柱とアーチ =================
  g.strokeStyle = alpha(C.ice, 0.14);
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 120) {
    g.fillStyle = alpha(C.ink, 0.22);
    g.beginPath();
    g.moveTo(x + 10, GY);
    g.lineTo(x + 10, 74);
    g.quadraticCurveTo(x + 60, 30, x + 110, 74);
    g.lineTo(x + 110, GY);
    g.fill();
    g.stroke();
  }
  for (let x = 0; x <= W; x += 120) S.put(g, 'pillar', x, GY + 2, 1);

  // ================= 2. 管：仕込み桶の棚から、樽へ酒が下りる。仕込み中の樽の管には、酒が流れる =================
  const sc = two ? 0.9 : 1;
  const R = 27 * sc;
  const HEAD = 57;
  rr(g, 30, HEAD - 2, W - 60, 4, 2, lin(g, 0, HEAD - 2, 0, HEAD + 2, '#f0c08a', '#8a5a30'));
  for (const c of casks) {
    const px = c.x + (c.row ? R + 9 : 0); // 下の段の樽の管は、上の段の樽の横を通す
    const to = c.y - (c.row ? 6 : R + 20);
    rr(g, px - 1.5, HEAD, 3, to - HEAD, 0, lin(g, px - 1.5, 0, px + 1.5, 0, '#f0c08a', '#8a5a30'));
    if (c.row) rr(g, c.x + R - 2, to - 1.5, 13, 3, 1.5, COPPER);
    disc(g, px, HEAD, 3, COPPER, alpha(C.ink, 0.5), 1);
    if (c.st === 0) for (let i = 0; i < 4; i++) disc(g, px, HEAD + (((clock * 0.9 + i / 4) % 1) * (to - HEAD)), 1.6, colors[1]);
  }

  // ================= 3. 上の棚：仕込み桶。数で桶が増え、改良でたがと枠が金に。酵母の段で、よく泡立つ =================
  rr(g, 12, 46, W - 24, 4, 1, lin(g, 0, 46, 0, 50, '#b98a4a', '#6a4a22'));
  rr(g, 12, 46, W - 24, 1, 0, alpha(C.goldLight, 0.6));
  for (let i = 0; i < vats; i++) {
    const vx = 44 + i * 34;
    rr(g, vx - 1.5, 48, 3, HEAD - 48, 0, COPPER);
    S.put(g, `vat_${Math.min(3, vt)}`, vx, 48, 0.8);
    for (let b = 0; b < Math.min(3, 1 + Math.floor(yeast / 5)); b++) {
      const up = (clock * (0.5 + yeast * 0.05) + b / 3 + i * 0.2) % 1;
      disc(g, vx - 5 + b * 5, 14 - up * 10, 1.4 + up, null, alpha(C.ice, 0.6 * (1 - up)), 0.8);
    }
  }
  tag(g, `×${v.vatLabel}`, 44 + vats * 34 - 6, 30, { size: 10.5, align: 'left' });

  // ================= 4. 蔵人：棚の端のランタン。狙う熟成の段の、酒の色で灯る =================
  if (auto) {
    const lx = W - 34;
    glow(g, lx, 30, 30, lamp, 0.6 + 0.1 * Math.sin(clock * 3));
    S.put(g, 'lantern', lx, 46, 0.8);
    disc(g, lx, 36, 4, alpha(lamp, 0.85));
  }

  // ================= 5. 樽の棚 =================
  for (const y of [...new Set(casks.map((c) => c.y))]) {
    const by = y + 31 * sc;
    rr(g, 20, by, W - 40, 5, 1.5, lin(g, 0, by, 0, by + 5, '#a87c46', '#5a3c1c'));
    if (by + 5 < GY - 2) for (let x = 40; x < W; x += 100) rr(g, x, by + 5, 5, GY - by - 3, 0, alpha('#6a4a22', 0.9));
  }

  // ================= 6. 樽 =================
  casks.forEach((c, i) => {
    const { x, y, st } = c;
    const old = st === 3;
    const sour = st > 3;
    // 熟成が下がった＝瓶詰めした。その酒の色で、注ぐ動きを始める
    if (prev[i] && c.age < prev[i].age - 1) pours.push({ x, y, t: 0, color: colors[prev[i].st] });
    prev[i] = { age: c.age, st };
    castShadow(g, x, y + 33 * sc, 30 * sc, 0.4);
    if (old) glow(g, x, y, 54, C.gold, 0.3 + 0.1 * Math.sin(clock * 3 + x));
    S.put(g, old ? 'cask_gold' : 'cask', x, y + 32 * sc, sc);

    // 鏡板の丸窓から、中の酒が見える。色が熟成の段、液面の高さが次の段までの進み
    const r = R * 0.74;
    const k = Math.max(0, Math.min(1, c.k));
    const top = y + r - 2 * r * (0.3 + 0.7 * k);
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = lin(g, 0, y - r, 0, y + r, '#0a1030', '#050818');
    g.fillRect(x - r, y - r, r * 2, r * 2);
    const wave = (px) => top + Math.sin(px * 0.22 + clock * 2.2 + x) * 1.5 + Math.sin(px * 0.11 - clock * 1.3 + x) * 1;
    // 酒の色は、段の中でも少しずつ次の段の色へ深まっていく
    const wine = st < 3 ? mix(colors[st], colors[st + 1], k) : colors[st];
    g.fillStyle = lin(g, 0, top - 2, 0, y + r, mix(wine, '#ffffff', 0.2 + blend * 0.3), mix(wine, C.ink, 0.45));
    g.beginPath();
    g.moveTo(x - r, y + r);
    for (let px = -r; px <= r; px += 3) g.lineTo(x + px, wave(px));
    g.lineTo(x + r, y + r);
    g.fill();
    g.strokeStyle = alpha('#ffffff', 0.5 + blend * 0.3);
    g.lineWidth = 1.2;
    g.beginPath();
    for (let px = -r; px <= r; px += 3) g[px === -r ? 'moveTo' : 'lineTo'](x + px, wave(px));
    g.stroke();
    // 発酵の泡の層：仕込み中は厚く、若い酒のあいだに消えていく
    const foam = st === 0 ? 1 : st === 1 ? 1 - k : 0;
    if (foam > 0) for (let px = -r; px <= r; px += 4) disc(g, x + px + Math.sin(clock * 1.7 + px) * 0.8, wave(px) - 1, 2.2 + Math.sin(px * 1.3 + x) * 0.8, alpha('#fffbe8', 0.85 * foam));
    // 仕込み中は泡が上がり、古酒は金の粒が舞い、酢は濁る
    if (st === 0) {
      for (let j = 0; j < 4; j++) {
        const u = (clock * 0.5 + j / 4 + x * 0.013) % 1;
        disc(g, x - r * 0.5 + j * r * 0.33 + Math.sin(u * 9 + j) * 1.5, y + r - u * (y + r - top), 1.2 + (j % 2), null, alpha('#ffffff', 0.7 * (1 - u)), 0.9);
      }
    } else if (old) {
      for (let j = 0; j < 5; j++) {
        const u = (clock * 0.25 + j / 5) % 1;
        disc(g, x + Math.sin(j * 2.4 + clock) * r * 0.6, y + r - u * (y + r - top), 1.1, alpha(C.goldLight, 0.9 * Math.sin(u * Math.PI)));
      }
    } else if (sour) {
      for (let j = 0; j < 4; j++) disc(g, x + Math.sin(j * 1.9 + clock * 0.6) * r * 0.55, top + 5 + j * 5, 3.5, alpha('#2a3a26', 0.45));
    }
    g.strokeStyle = alpha('#ffffff', 0.22);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y, r * 0.78, Math.PI * 1.08, Math.PI * 1.42);
    g.stroke();
    g.restore();
    disc(g, x, y, r, null, alpha(C.ink, 0.7), 2.5);

    // まわりの目盛り：4 つの区切りが、仕込み → 若い酒 → 熟成 → 古酒。それぞれ、その段の酒の色。
    // 済んだぶんは濃く、これからのぶんは淡い。金の印が、いまの位置。寝かせすぎると、輪ごと赤くなる
    const ring = r + 5;
    disc(g, x, y, ring, null, alpha(C.ink, 0.78), 6.4);
    g.lineCap = 'butt';
    g.lineWidth = 3.4;
    for (let q = 0; q < 4; q++) {
      const a0 = -Math.PI / 2 + q * (Math.PI / 2) + 0.07;
      const a1 = -Math.PI / 2 + (q + 1) * (Math.PI / 2) - 0.07;
      const col = sour ? C.rose : q === 0 ? '#8fa0e0' : colors[q];
      g.strokeStyle = alpha(col, sour ? 0.5 + 0.4 * Math.abs(Math.sin(clock * 3)) : 0.24);
      g.beginPath();
      g.arc(x, y, ring, a0, a1);
      g.stroke();
      const part = sour ? 0 : q < st ? 1 : q === st ? k : 0;
      if (part > 0) {
        g.strokeStyle = col;
        g.beginPath();
        g.arc(x, y, ring, a0, a0 + (a1 - a0) * part);
        g.stroke();
      }
    }
    if (!sour) {
      const a = -Math.PI / 2 + st * (Math.PI / 2) + 0.07 + (Math.PI / 2 - 0.14) * k;
      const mx = x + Math.cos(a) * ring;
      const my = y + Math.sin(a) * ring;
      glow(g, mx, my, 7, C.goldLight, 0.7);
      disc(g, mx, my, 2.6, C.goldLight, C.ink, 1);
    } else if (Math.floor(clock * 2) % 2 === 0) sparkle(g, x + R, y - R * 0.8, 4, C.rose);

    // 蛇口と、いま開けたときの値打ち（びんの数）。古酒のびんは金に光る
    const ty = y + ring + 4;
    rr(g, x - 5, ty - 1, 10, 2.4, 1, C.gold);
    rr(g, x - 2, ty, 4, 6, 1, C.goldLight, alpha(C.ink, 0.6), 1);
    for (let j = 0; j < WORTH[st]; j++) {
      const bx = x + R + 5 + j * 7;
      if (old) glow(g, bx, y + 31 * sc - 8, 7, C.gold, 0.6);
      S.put(g, sour ? 'bottle_red' : 'bottle_white', bx, y + 31 * sc, 0.46, sour ? 0.5 : 1);
    }
  });
  prev.length = casks.length;

  // ================= 7. 床に並ぶびん：稼ぐほど増える。びん詰めの改良で金のふた =================
  const slotX = (i) => 18 + (i % 9) * 11 + (i >= 9 ? W - 126 : 0);
  for (let i = 0; i < shelf; i++) {
    S.put(g, i % 3 ? 'bottle_white' : 'bottle_red', slotX(i), GY + 31, 0.8);
    if (bt > 0) rr(g, slotX(i) - 1.5, GY + 4, 3, 3, 1, C.gold);
  }

  // ================= 8. 瓶詰めの動き：蛇口から酒が落ち、びんが床の列へ飛ぶ =================
  for (let i = pours.length - 1; i >= 0; i--) {
    const p = pours[i];
    p.t += dt;
    if (p.t > 0.9) {
      pours.splice(i, 1);
      continue;
    }
    const r = R * 0.74;
    if (p.t < 0.45) {
      const a = 1 - p.t / 0.45;
      rr(g, p.x - 1.5, p.y + r + 14, 3, 14 * Math.min(1, p.t * 6), 1.5, alpha(p.color, a));
      glow(g, p.x, p.y + r + 24, 10, p.color, 0.5 * a);
    }
    const u = Math.min(1, p.t / 0.9);
    const e = u * u * (3 - 2 * u);
    const tx = slotX(Math.max(0, shelf - 1));
    const bx = p.x + (tx - p.x) * e;
    const by = p.y + r + 24 + (GY + 31 - (p.y + r + 24)) * e - Math.sin(u * Math.PI) * 26;
    glow(g, bx, by - 10, 12, C.goldLight, 0.5 * (1 - u));
    S.put(g, 'bottle_white', bx, by, 0.8);
  }
}

// 農業の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_farm.py（Kenney「Nature Kit」「Survival Kit」＋同じレンダラーの立体）。決まりは docs/art-guide.md。
// 季節の移る畑。重ねる順：空と丘 → 納屋 → 畑の土 → 作物 → 温室 → ロボ → 季節の粒 → 文字。
import { C, alpha, mix, lin, rr, disc, line, tag, glow, sparkle, stage, sprites, castShadow } from '../ui/draw.js';

const S = sprites('farm', ['soil', 'young', 'leaf', 'mushroom', 'root', 'berry', 'pawpaw', 'barn', 'barn_gold', 'crate', 'robot',
  'tree_spring', 'tree_summer', 'tree_autumn', 'tree_winter']);
export const farmArtReady = () => S.ready();

const SEASON = ['spring', 'summer', 'autumn', 'winter'];
const SKY = [['#2a4bd0', '#5a4fa8'], ['#1f3fae', '#2f6ad8'], ['#3a2f86', '#b0603a'], ['#22366e', '#5f7fb8']];
const HILL = ['#2f7d58', '#236a4a', '#7a5a2c', '#7f93c4'];
// 土に掛ける色（季節）。肥料の段が上がるほど、黒く肥えた色に寄る
const SOIL = ['#a8969a', '#b09c90', '#b08872', '#8f9ac8'];

// 戻り値：畑の位置と大きさ（収穫のかけらを飛ばすのに使う）
export function drawFarm(g, v) {
  const { W, H, BARN, clock, sea, k, crop, n, shown, per, fert, gh, robot, tune, pile, barnTier } = v;

  // ================= 1. 空と丘 =================
  stage(g, W, H, { top: SKY[sea][0], bottom: SKY[sea][1], stars: sea === 3 ? 18 : 8, t: clock });
  glow(g, 54, 36, 60, sea === 2 ? C.amber : C.goldLight, 0.4);
  disc(g, 54, 36, sea === 1 ? 17 : 13, sea === 3 ? C.ice : C.goldLight);
  g.fillStyle = lin(g, 0, 50, 0, 100, HILL[sea], mix(HILL[sea], C.ink, 0.5));
  g.beginPath();
  g.ellipse(W * 0.3, 98, W * 0.5, 44, 0, Math.PI, 0);
  g.ellipse(W * 0.85, 100, W * 0.4, 36, 0, Math.PI, 0);
  g.fill();
  // 丘の木（季節で葉の色が変わる）
  for (const [tx, ty, sc] of [[96, 66, 0.8], [124, 60, 1], [156, 62, 0.85], [214, 72, 0.9], [262, 84, 0.75], [300, 90, 0.7]]) S.put(g, `tree_${SEASON[sea]}`, tx, ty, sc * 0.75);
  g.fillStyle = lin(g, 0, 96, 0, H, mix(HILL[sea], C.ink, 0.55), C.ink);
  g.fillRect(0, 96, W, H - 96);

  // ================= 2. 納屋と、収穫の木箱 =================
  castShadow(g, BARN[0], 97, 34, 0.4);
  for (let i = 0; i < pile; i++) S.put(g, 'crate', BARN[0] - 46 - (i % 4) * 13 - (Math.floor(i / 4) % 2) * 4, 98 - Math.floor(i / 4) * 10, 0.62);
  S.put(g, barnTier > 0 ? 'barn_gold' : 'barn', BARN[0], 98, 0.66);
  // 収穫の改良：屋根の縁に金の線が重なる
  for (let i = 0; i < barnTier; i++) line(g, [BARN[0] - 34, 60 - i * 2.4, BARN[0], 39 - i * 2.4, BARN[0] + 34, 60 - i * 2.4], C.gold, 1.2);
  glow(g, BARN[0], 86, 14, C.goldLight, 0.35);

  // ================= 3. 畑 =================
  const fx = 14;
  const fy = 104;
  const fw = W - 28;
  const fh = H - fy - 16;
  const cols = Math.max(2, Math.min(20, Math.ceil(Math.sqrt(shown * (fw / fh)))));
  const rows = Math.max(1, Math.ceil(shown / cols));
  const cell = Math.min(fw / cols, fh / rows, 64);
  const ox = fx + (fw - cell * cols) / 2;
  const oy = fy + (fh - cell * rows) / 2;
  rr(g, ox - 6, oy - 6, cell * cols + 12, cell * rows + 12, 10, alpha(C.ink, 0.55), alpha(C.gold, 0.35), 1);
  const rich = Math.min(1, fert / 20);
  const soil = S.dyed('soil', mix(SOIL[sea], '#6a5a7a', rich * 0.7));
  const cropIm = S.get(crop);
  const youngIm = S.get('young');
  // 作物 1 株。育ち具合で、種 → 若葉 → 育ちかけ → 実った姿
  const plant = (x, y, size, i) => {
    if (k < 0.12) {
      disc(g, x, y - size * 0.08, Math.max(0.8, size * 0.05), alpha(C.goldLight, 0.7));
      return;
    }
    const ripe = k >= 1;
    const im = k < 0.5 ? youngIm : cropIm;
    const grow = k < 0.5 ? 0.45 + k * 0.9 : ripe ? 1 : 0.55 + (k - 0.5) * 0.8;
    const hh = size * grow;
    const w = (hh * im.naturalWidth) / im.naturalHeight;
    const sway = ripe ? Math.sin(clock * 3 + i) * size * 0.03 : 0;
    g.drawImage(im, x - w / 2 + sway, y - hh, w, hh);
  };
  for (let i = 0; i < shown; i++) {
    const x = ox + (i % cols) * cell;
    const y = oy + Math.floor(i / cols) * cell;
    // 区画の土
    rr(g, x + 1, y + 1, cell - 2, cell - 2, Math.min(6, cell * 0.2), alpha(C.ink, 0.35));
    if (soil) g.drawImage(soil, x + cell * 0.04, y + cell * 0.5, cell * 0.92, cell * 0.48);
    if (fert > 0 && (i * 7 + Math.floor(clock * 1.5)) % Math.max(3, 14 - fert) === 0) disc(g, x + cell * (0.2 + ((i * 13) % 60) / 100), y + cell * 0.86, Math.max(0.8, cell * 0.035), alpha(C.gold, 0.9));
    // 区画が小さいときは株を減らす（数が多くても、畑が雑然としないように）
    const show = cell >= 52 ? per : cell >= 30 ? Math.min(per, 2) : 1;
    const size = show > 2 ? cell * 0.5 : show === 2 ? cell * 0.6 : cell * 0.8;
    for (let j = 0; j < show; j++) {
      const px = show === 1 ? 0.5 : 0.28 + 0.44 * (j % 2);
      const py = show <= 2 ? 0.86 : 0.58 + 0.32 * Math.floor(j / 2);
      plant(x + cell * px, y + cell * py, size, i + j);
    }
  }
  // 札は畑の外（左上）へ。畑の中に置くと、作物に重なる
  if (n > shown) tag(g, `+${n - shown}`, ox + (fert > 0 ? 58 : 4), oy - 16, { align: 'left', size: 10.5 });
  if (fert > 0) tag(g, `Lv ${fert}`, ox + 4, oy - 16, { align: 'left', size: 10.5 });

  // ================= 4. 温室：畑にガラスの屋根がかかる。段が上がるほど骨組みが増える =================
  if (gh > 0) {
    const gx = ox - 6;
    const gw = cell * cols + 12;
    const top = oy - 22;
    const arc = () => {
      g.beginPath();
      g.moveTo(gx, oy - 6);
      g.quadraticCurveTo(gx + gw / 2, top - 14, gx + gw, oy - 6);
    };
    g.fillStyle = lin(g, 0, top, 0, oy + 20, alpha(C.ice, 0.16 + Math.min(0.14, gh * 0.007)), alpha(C.ice, 0));
    arc();
    g.lineTo(gx + gw, oy + 20);
    g.lineTo(gx, oy + 20);
    g.fill();
    g.strokeStyle = alpha(C.ice, 0.7);
    g.lineWidth = 1.2;
    arc();
    g.stroke();
    const ribs = Math.min(9, 2 + Math.floor(gh / 2));
    for (let i = 1; i < ribs; i++) {
      const u = i / ribs;
      line(g, [gx + gw * u, oy - 6 - 2 * u * (1 - u) * 30, gx + gw * u, oy - 2], alpha(C.ice, 0.4), 1);
    }
    tag(g, `Lv ${gh}`, gx + gw / 2, top - 4, { size: 10.5, color: C.ice, line: alpha(C.ice, 0.3) });
  }

  // ================= 5. 収穫ロボ：見回りの進み具合に合わせて畑の下を横切る =================
  if (robot >= 0) {
    const rx = ox + robot * cell * cols;
    const ry = oy + cell * rows + 12;
    glow(g, rx, ry - 10, 14, tune > 0 ? C.gold : C.azure, 0.45);
    S.put(g, 'robot', rx, ry, 0.72 + Math.min(0.2, tune * 0.025));
  }

  // ================= 6. 季節の粒：春は花びら、秋は落ち葉、冬は雪 =================
  if (sea !== 1) {
    const col = sea === 0 ? '#ffc4dc' : sea === 2 ? C.amber : '#ffffff';
    for (let i = 0; i < (sea === 3 ? 26 : 12); i++) {
      const x = (i * 73 + clock * (12 + (i % 5) * 4)) % W;
      const y = (i * 41 + clock * (22 + (i % 7) * 5)) % H;
      if (sea === 3) disc(g, x, y, 1.4 + (i % 3) * 0.5, alpha(col, 0.85));
      else {
        g.fillStyle = alpha(col, 0.8);
        g.beginPath();
        g.ellipse(x, y, 3, 1.6, clock * 2 + i, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  if (k >= 1 && Math.floor(clock * 2) % 2 === 0) sparkle(g, ox + cell * cols + 2, oy - 2, 6, C.goldLight, 0.9);
  return { ox, oy, cell, cols, rows };
}

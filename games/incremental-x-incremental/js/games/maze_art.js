// 迷路探索の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_maze.py（Kenney「Mini Dungeon」）。決まりは docs/art-guide.md。
// 迷路は真上から。重ねる順：床 → 歩いた道の明かり → 置き物 → 壁（厚みと影）→ 宝 → 探検者 → 霧 → 羅針盤と札。
import { C, alpha, mix, lin, rr, disc, line, tag, glow, gem, sparkle, sprites } from '../ui/draw.js';

const S = sprites('maze', ['floor_a', 'floor_b', 'chest', 'chest_gold', 'chest_lord', 'coin', 'hero', 'hero_gold', 'mate', 'barrel', 'pot', 'rocks', 'column', 'stairs', 'banner']);
export const mazeArtReady = () => S.ready();
const PROPS = ['barrel', 'pot', 'rocks', 'column'];
// 迷路の種類ごとの、床と壁の色
const TONE = {
  plain: ['#5a6fb8', '#8fb0ff'],
  fog: ['#4a5a8a', '#9aa6cf'],
  vault: ['#7a6a48', '#e3c16f'],
  lord: ['#7a4a6a', '#e8637f'],
};

export function drawMaze(g, v) {
  const { SIZE, maze, frac, kind, clock, treasure, crew, heroGold, boots, dashing, compass, relics } = v;
  const { n, open, path } = maze;
  const c = SIZE / n;
  const [floorTone, wallTone] = TONE[kind];
  // 素材を、幅が cell の w 倍になる大きさで、足もとを合わせて置く
  const put = (name, x, y, w, a = 1) => S.put(g, name, x, y, (c * w) / (S.get(name).naturalWidth * S.k), a);

  // ================= 1. 床：石の板。ところどころ欠けた板 =================
  const fa = S.dyed('floor_a', floorTone);
  const fb = S.dyed('floor_b', floorTone);
  for (let i = 0; i < n * n; i++) {
    const im = (i * 7 + ((i / n) | 0) * 3) % 5 === 0 ? fb : fa;
    if (im) g.drawImage(im, (i % n) * c, Math.floor(i / n) * c, c + 0.5, c + 0.5);
  }
  g.fillStyle = alpha(C.ink, 0.3);
  g.fillRect(0, 0, SIZE, SIZE);
  // 歩いた道は、明かりが残る
  const at = Math.min(path.length - 1, Math.floor(frac * (path.length - 1)));
  for (let i = 0; i <= at; i++) rr(g, (path[i] % n) * c + 1.5, Math.floor(path[i] / n) * c + 1.5, c - 3, c - 3, 3, alpha(C.goldLight, 0.1 + 0.12 * (i / (at + 1))));

  // ================= 2. 行き止まりの置き物、入口の階段 =================
  put('stairs', c / 2, c * 0.92, 0.7, 0.9);
  for (let i = 1; i < n * n - 1; i++) {
    if (open[i].filter(Boolean).length !== 1 || (i * 13) % 3) continue;
    put(PROPS[(i * 5) % PROPS.length], (i % n) * c + c / 2, Math.floor(i / n) * c + c * 0.86, 0.5);
  }

  // ================= 3. 壁：厚みのある石垣。上の面が明るく、手前の面と床に影が落ちる =================
  const th = Math.max(2.4, c * 0.13);
  const dp = Math.max(2, c * 0.14); // 手前の面の高さ
  const segs = [];
  for (let i = 0; i < n * n; i++) {
    const x = (i % n) * c;
    const y = Math.floor(i / n) * c;
    if (!open[i][1] && (i % n) < n - 1) segs.push([x + c - th / 2, y - th / 2, th, c + th]);
    if (!open[i][2] && i < n * (n - 1)) segs.push([x - th / 2, y + c - th / 2, c + th, th]);
  }
  segs.push([0, 0, SIZE, th], [0, SIZE - th, SIZE, th], [0, 0, th, SIZE], [SIZE - th, 0, th, SIZE]);
  g.fillStyle = alpha(C.ink, 0.45);
  for (const [x, y, w, hh] of segs) g.fillRect(x + 1.5, y + dp, w, hh + 1.5); // 床に落ちる影
  g.fillStyle = mix(wallTone, C.ink, 0.62);
  for (const [x, y, w, hh] of segs) g.fillRect(x, y + dp * 0.5, w, hh + dp * 0.5); // 手前の面
  g.fillStyle = lin(g, 0, 0, SIZE, SIZE, mix(wallTone, '#ffffff', 0.25), mix(wallTone, C.ink, 0.2));
  for (const [x, y, w, hh] of segs) g.fillRect(x, y, w, hh); // 上の面

  // ================= 4. ゴールの宝：宝の強化で、まわりのコインが増える =================
  const gx = (n - 0.5) * c;
  const gy = (n - 0.5) * c;
  glow(g, gx, gy - c * 0.1, c * (1.1 + treasure * 0.1), kind === 'lord' ? C.rose : C.gold, 0.5 + 0.15 * Math.sin(clock * 3));
  if (kind === 'lord') put('banner', gx - c * 0.34, gy - c * 0.1, 0.4);
  for (let i = 0; i < Math.min(5, treasure); i++) put('coin', gx + [-0.34, 0.34, -0.2, 0.26, 0][i] * c, gy + [0.36, 0.38, 0.44, 0.46, 0.48][i] * c - th, 0.3);
  put(kind === 'lord' ? 'chest_lord' : kind === 'vault' ? 'chest_gold' : 'chest', gx, gy + c * 0.3 - th, kind === 'lord' ? 0.86 : 0.62);
  sparkle(g, gx + c * 0.26, gy - c * 0.34, c * 0.13 + Math.sin(clock * 5), '#ffffff');

  // ================= 5. 探検者（マスからマスへ、なめらかに進む）。仲間は後ろに連なる =================
  const f = Math.min(path.length - 1, frac * (path.length - 1));
  const posAt = (u) => {
    const i = Math.max(0, Math.min(path.length - 1, Math.floor(u)));
    const k = Math.max(0, u - i);
    const nx = path[Math.min(path.length - 1, i + 1)];
    return [((path[i] % n) * (1 - k) + (nx % n) * k) * c + c / 2, (Math.floor(path[i] / n) * (1 - k) + Math.floor(nx / n) * k) * c + c / 2];
  };
  // 靴：足あとの光が長くなる
  for (let i = 1; i <= boots; i++) {
    const [bx, by] = posAt(f - i * 0.25);
    disc(g, bx, by + c * 0.2, c * 0.06, alpha(dashing ? C.amber : C.goldLight, 0.6 * (1 - i / (boots + 1))));
  }
  for (let i = crew; i >= 1; i--) {
    const [fx2, fy2] = posAt(f - i * 0.7);
    put('mate', fx2, fy2 + c * 0.34 + Math.sin(clock * 9 + i) * c * 0.02, 0.52);
  }
  const [px, py] = posAt(f);
  glow(g, px, py, c * 1.4, dashing ? C.amber : C.goldLight, 0.5);
  put(heroGold ? 'hero_gold' : 'hero', px, py + c * 0.38 + Math.sin(clock * 10) * c * 0.03, 0.72);

  // ================= 6. 霧の迷路：探検者のまわりしか見えない =================
  if (kind === 'fog') {
    const fog = g.createRadialGradient(px, py, c * 1.6, px, py, c * 4.2);
    fog.addColorStop(0, alpha(C.ink, 0));
    fog.addColorStop(1, alpha(C.ink, 0.92));
    g.fillStyle = fog;
    g.fillRect(0, 0, SIZE, SIZE);
    glow(g, gx, gy, c, C.gold, 0.5);
  }

  // ================= 7. 羅針盤（段が上がるほど、針がゴールをはっきり指す）と、遺物の力 =================
  if (compass > 0) {
    const cx = SIZE - 24;
    const cy = 24;
    disc(g, cx, cy, 14, alpha(C.ink, 0.85), C.gold, 1.4);
    const a = Math.atan2(gy - py, gx - px) + Math.sin(clock * 2) * Math.max(0, 0.5 - compass * 0.04);
    line(g, [cx - Math.cos(a) * 6, cy - Math.sin(a) * 6, cx + Math.cos(a) * 10, cy + Math.sin(a) * 10], C.goldLight, 2);
    disc(g, cx, cy, 2, C.gold);
    tag(g, `Lv ${compass}`, cx, cy + 25, { size: 10.5 });
  }
  for (let i = 0; i < relics; i++) gem(g, 14 + i * 12, 14, 5, C.violet);
}

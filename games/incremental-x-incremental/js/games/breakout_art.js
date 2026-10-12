// ブロック崩しの絵（素材版）。計算（当たり判定、玉の動き）には触れず、渡された状態を描くだけ。
// 素材：tools/art_breakout.py（同じレンダラーで作ったブロック、玉、カプセル）。決まりは docs/art-guide.md。
// 重ねる順：盤面 → ブロック（ひびと金の石）→ 玉の尾と玉 → かけら → カプセル。
import { C, alpha, lin, rr, line, glow, sparkle, meter, sprites } from '../ui/draw.js';

const S = sprites('breakout', ['boss', 'gem', 'ball_0', 'ball_1', 'ball_2', 'ball_3', 'ball_4', 'ball_fire', 'capsule', ...[0, 1, 2, 3, 4, 5].map((i) => `brick_${i}`)]);
export const breakoutArtReady = () => S.ready();
const BALL_COL = [C.ivory, C.sky, C.teal, C.gold, '#ffffff'];

export function drawBreakout(g, v) {
  const { W, H, TOP, BW, BH, COLS, ROWS, R, clock, tintIdx, boss, bricks, gems, gemTier, pts, ballTier, fire, tail, aura } = v;

  // ================= 1. 盤面：深い紺の台。両わきと底に、金の細い縁 =================
  g.fillStyle = lin(g, 0, 0, 0, H, '#17287c', C.ink);
  g.fillRect(0, 0, W, H);
  for (let x = BW; x < W; x += BW) rr(g, x - 0.5, 0, 1, H, 0, alpha(C.ice, 0.035));
  rr(g, 0, 0, 2, H, 0, alpha(C.gold, 0.35));
  rr(g, W - 2, 0, 2, H, 0, alpha(C.gold, 0.35));
  rr(g, 0, H - 2, W, 2, 0, alpha(C.gold, 0.35));

  // ================= 2. ブロック：体力が減るほど、ひびが入って暗くなる =================
  if (boss) {
    if (bricks[0] !== null) {
      const k = bricks[0];
      const x = 6;
      const y = TOP + 2;
      const w = W - 12;
      const hh = ROWS * BH - 2;
      glow(g, W / 2, TOP + hh / 2, 200, C.gold, 0.22 + 0.08 * Math.sin(clock * 3));
      g.drawImage(S.get('boss'), x, y, w, hh);
      // ひび：体力が減るほど増える
      const cracks = Math.floor((1 - k) * 9);
      for (let i = 0; i < cracks; i++) {
        const cx = x + 30 + ((i * 97) % (w - 60));
        line(g, [cx, y + 10, cx + 8, y + hh * 0.3, cx - 6, y + hh * 0.52, cx + 5, y + hh * 0.8], alpha(C.ink, 0.6), 1.6);
      }
      meter(g, W / 2 - 90, y + hh + 6, 180, k, C.gold, 4);
    }
  } else {
    const im = S.get(`brick_${tintIdx}`);
    const gemIm = S.get('gem');
    for (let i = 0; i < bricks.length; i++) {
      const k = bricks[i];
      if (k === null) continue;
      const x = (i % COLS) * BW;
      const y = TOP + Math.floor(i / COLS) * BH;
      g.drawImage(im, x + 0.5, y - 1, BW - 1, BH + 2);
      if (k < 0.99) rr(g, x + 2, y + 1, BW - 4, BH - 2, 3, alpha(C.ink, 0.5 * (1 - k)));
      // 価値の強化：ブロックに金の石がはまる
      if (gems) {
        const gs = 9 + Math.min(3, gemTier) * 2;
        g.drawImage(gemIm, x + BW / 2 - gs / 2, y + BH * 0.34 - gs * 0.34, gs, gs * 0.68);
      }
      if (k < 0.66) line(g, [x + BW * 0.3, y + 2, x + BW * 0.42, y + BH * 0.45, x + BW * 0.34, y + BH - 5], alpha(C.ink, 0.6), 1.1);
      if (k < 0.33) line(g, [x + BW * 0.68, y + 3, x + BW * 0.58, y + BH * 0.5, x + BW * 0.7, y + BH - 4], alpha(C.ink, 0.6), 1.1);
    }
  }

  // ================= 3. 玉：威力の改良で色が変わり、速さの強化で尾が伸びる =================
  const name = fire ? 'ball_fire' : `ball_${Math.min(4, ballTier)}`;
  const col = fire ? C.amber : BALL_COL[Math.min(4, ballTier)];
  const ballIm = S.get(name);
  const d = R * 2.6;
  for (const p of pts) {
    line(g, [p.x, p.y, p.x - p.vx * tail, p.y - p.vy * tail], alpha(col, 0.35), R * 1.1);
    glow(g, p.x, p.y, aura, col, 0.45);
    g.drawImage(ballIm, p.x - d / 2, p.y - d / 2, d, d);
  }
}

// 落ちてくるカプセル（かけらの上に描く）
export function drawCapsule(g, x, y, clock, leaving) {
  g.save();
  if (leaving) g.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(clock * 8));
  glow(g, x, y, 34, C.gold, 0.55);
  S.put(g, 'capsule', x, y + 11, 1);
  sparkle(g, x + 13, y - 10, 5 + Math.sin(clock * 6) * 1.5, '#ffffff');
  g.restore();
}

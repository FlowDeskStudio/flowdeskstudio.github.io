// ボール落としの絵（素材版）。計算（玉の道すじ、確率）には触れず、渡された状態を描くだけ。
// 素材：tools/art_drop.py（同じレンダラーで作った玉、釘、受け皿、投入口）。決まりは docs/art-guide.md。
// 重ねる順：盤面 → 投入口 → 釘と当たりの光 → 受け皿 → 玉 → 文字。
import { C, alpha, lin, rr, disc, text, tag, glow, sprites } from '../ui/draw.js';

const S = sprites('drop', ['peg_0', 'peg_1', 'peg_2', 'ball_0', 'ball_1', 'ball_2', 'ball_3', 'ball_gold', 'tray', 'tray_hot', 'tray_out', 'chute', 'chute_off']);
export const dropArtReady = () => S.ready();

export function drawDrop(g, v) {
  const { W, H, COL, TOP, SLOTS, ROWS, TRAY_Y, PEG_R, BALL_R, FALL, xOf, pegY, posOf, aim, hot, pegs, balls, pings, flash, dt, slotLv, slotText, droppers, dropperLabel, dropperGold, ballTier, shine } = v;

  // ================= 1. 盤面：深い紺の板に、金の枠。上から下へ、うっすら明るい =================
  g.fillStyle = lin(g, 0, 0, 0, H, '#18297e', C.ink);
  g.fillRect(0, 0, W, H);
  rr(g, COL * 0.5, 34, W - COL, TRAY_Y - 30, 10, alpha(C.ink, 0.28), alpha(C.gold, 0.3), 1);
  for (let i = 0; i <= SLOTS; i++) rr(g, xOf(i - 0.5), TRAY_Y - 6, 1, 6, 0, alpha(C.ice, 0.2));

  // ================= 2. 投入口：狙っている列だけ金。台数が増えるほど口が増える =================
  rr(g, COL * 0.6, 4, W - COL * 1.2, 5, 2.5, lin(g, 0, 4, 0, 9, '#8f9bc4', '#3a4480'));
  for (let i = 0; i < SLOTS; i++) {
    const on = i === aim;
    if (on) glow(g, xOf(i), 28, 22, C.gold, 0.5);
    S.put(g, on && (dropperGold || true) ? 'chute' : 'chute_off', xOf(i), 34, 0.9);
    if (on) for (let k = 0; k < droppers; k++) disc(g, xOf(i) + (k - (droppers - 1) / 2) * 4.4, 13, 1.5, C.ink);
  }
  tag(g, `×${dropperLabel}`, W - 24, 20, { size: 10.5 });

  // ================= 3. 釘：丸い頭の鋲。寄せは金、散らしは青。玉が当たると輪が広がる =================
  const pegIm = S.get(`peg_${pegs}`);
  const pd = PEG_R * 3.2;
  for (let r = 0; r < ROWS; r++) {
    for (let c = -1; c <= SLOTS; c++) {
      const px = xOf(c + (r % 2 ? 0.5 : 0));
      disc(g, px + 1.5, pegY(r) + 2.5, PEG_R, alpha(C.ink, 0.4));
      g.drawImage(pegIm, px - pd / 2, pegY(r) - pd * 0.62, pd, pd * 1.05);
    }
  }
  for (let i = pings.length - 1; i >= 0; i--) {
    const pg = pings[i];
    pg.age += dt;
    if (pg.age > 0.25) {
      pings.splice(i, 1);
      continue;
    }
    glow(g, pg.x, pg.y, 12, C.goldLight, 0.5 * (1 - pg.age / 0.25));
    disc(g, pg.x, pg.y, PEG_R + 2 + pg.age * 36, null, alpha(C.goldLight, 1 - pg.age / 0.25), 1.6);
  }

  // ================= 4. 受け皿：当たりの皿は金に光る。強化の段だけ、縁に金の線が重なる =================
  const th = H - TRAY_Y + 2;
  const tray = (name, x, lift = 0) => g.drawImage(S.get(name), x - COL / 2 + 1, TRAY_Y - 4 - lift, COL - 2, th + 2);
  tray('tray_out', xOf(-1));
  tray('tray_out', xOf(SLOTS));
  for (let i = 0; i < SLOTS; i++) {
    flash[i] = Math.max(0, (flash[i] || 0) - dt * 3);
    const isHot = i === hot;
    if (isHot) glow(g, xOf(i), TRAY_Y + 30, 46, C.gold, 0.35 + 0.3 * flash[i]);
    else if (flash[i] > 0) glow(g, xOf(i), TRAY_Y + 30, 40, C.azure, 0.5 * flash[i]);
    tray(isHot ? 'tray_hot' : 'tray', xOf(i), flash[i] * 2);
    for (let k = 0; k < Math.min(5, slotLv[i]); k++) rr(g, xOf(i) - COL / 2 + 9, H - 10 - k * 4, COL - 18, 1.6, 1, isHot ? alpha(C.ink, 0.55) : alpha(C.gold, 0.85));
    text(g, slotText[i], xOf(i), TRAY_Y + 44 - flash[i] * 4, 12.5, isHot ? C.ink : C.ivory);
  }

  // ================= 5. 玉：磨きと改良で色とつやが変わる。金の玉は大きく光る =================
  const normal = S.get(`ball_${Math.min(3, ballTier)}`);
  const gold = S.get('ball_gold');
  for (const b of balls) {
    const [bx, by] = posOf(b);
    const d = (b.gold ? BALL_R + 2 : BALL_R) * 2.5;
    g.globalAlpha = b.age > FALL ? Math.max(0, 1 - (b.age - FALL) / 0.15) : 1;
    if (b.gold) glow(g, bx, by, d * 1.2, C.gold, 0.6);
    else if (shine) glow(g, bx, by, d * 0.7, C.ice, 0.25);
    g.drawImage(b.gold ? gold : normal, bx - d / 2, by - d / 2, d, d);
  }
  g.globalAlpha = 1;
}

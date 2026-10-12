// 配送センターの絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_depot.py（Kenney の Car Kit / City Kit Industrial・Commercial / Nature Kit / Pirate Kit ＋同じレンダラーの立体）。
// 夜の地図に、ミニチュアの物流網。重ねる順：地面と海 → 道 → 届け先 → 配送車 → 配送センター → 文字。
import { C, alpha, lin, rr, disc, line, tag, glow, sprites, castShadow } from '../ui/draw.js';

const IDS = ['near', 'mid', 'far', 'sea', 'air'];
const S = sprites('depot', ['hub_1', 'hub_2', 'hub_3', 'container', ...IDS, ...[...IDS, 'idle'].flatMap((k) => [`truck_${k}_r`, `truck_${k}_l`])]);
export const depotArtReady = () => S.ready();

export function drawDepot(g, v) {
  const { W, H, HUB, clock, routes, dest, along, total, free, tiers, load, surgeTier, auto } = v;

  // ================= 1. 地面：夜の地図。升目と街あかり、航路が開けば海 =================
  g.fillStyle = lin(g, 0, 0, W, H, '#16267a', C.ink);
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 24) rr(g, x, 0, 1, H, 0, alpha(C.ice, 0.04));
  for (let y = 0; y < H; y += 24) rr(g, 0, y, W, 1, 0, alpha(C.ice, 0.04));
  for (let i = 0; i < 16; i++) disc(g, (i * 97 + 40) % W, (i * 61 + 30) % H, 1.2, alpha(C.goldLight, 0.22 + 0.18 * Math.sin(clock + i)));
  if (routes[3].open) {
    g.fillStyle = lin(g, W - 160, H - 80, W, H, alpha(C.azure, 0.55), alpha(C.royal, 0.2));
    g.beginPath();
    g.ellipse(W - 10, H + 6, 156, 82, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 4; i++) line(g, [W - 120 + i * 26 + Math.sin(clock + i) * 4, H - 24 - i * 9, W - 104 + i * 26 + Math.sin(clock + i) * 4, H - 24 - i * 9], alpha(C.ice, 0.3), 1);
  }

  // ================= 2. 道：舗装の帯に、まんなかの破線。特需の道は金に光る =================
  const curve = (i) => {
    const [x1, y1] = dest(i);
    const mid = along(i, 0.5);
    g.beginPath();
    g.moveTo(...HUB);
    g.quadraticCurveTo(2 * mid[0] - (HUB[0] + x1) / 2, 2 * mid[1] - (HUB[1] + y1) / 2, x1, y1);
  };
  g.lineCap = 'round';
  routes.forEach((r, i) => {
    if (!r.open) return;
    const sky = i >= 3; // 航路と空路は、点線の道すじ
    if (r.hot) {
      g.strokeStyle = alpha(C.gold, 0.22 + surgeTier * 0.05 + Math.sin(clock * 6) * 0.1);
      g.lineWidth = 18 + surgeTier * 2;
      curve(i);
      g.stroke();
    }
    if (!sky) {
      g.strokeStyle = '#0a1030';
      g.lineWidth = 9 + Math.min(3, Math.log2(r.n + 1));
      curve(i);
      g.stroke();
      g.strokeStyle = r.n > 0 ? '#2b3a78' : '#1c2858';
      g.lineWidth = 7 + Math.min(3, Math.log2(r.n + 1));
      curve(i);
      g.stroke();
    }
    g.strokeStyle = r.hot ? C.goldLight : r.n > 0 ? alpha(sky ? C.sky : C.ice, 0.75) : alpha(C.ice, 0.25);
    g.lineWidth = sky ? 1.6 : 1;
    g.setLineDash(sky ? [3, 7] : [5, 6]);
    g.lineDashOffset = sky ? -clock * 10 : 0;
    curve(i);
    g.stroke();
    g.setLineDash([]);
  });
  g.lineCap = 'butt';

  // ================= 3. 届け先：路線を強化するほど、まわりに金の点が増える =================
  routes.forEach((r, i) => {
    if (!r.open) return;
    const [x1, y1] = dest(i);
    for (let k = 0; k < Math.min(8, r.lvl); k++) {
      const a = -Math.PI / 2 + (k / 8) * Math.PI * 2;
      disc(g, x1 + Math.cos(a) * 27, y1 - 4 + Math.sin(a) * 22, 1.6, C.gold);
    }
    if (r.hot) glow(g, x1, y1 - 6, 42, C.gold, 0.5);
    if (i < 3) castShadow(g, x1, y1 + 9, 18, 0.4);
    const bob = i === 3 ? Math.sin(clock * 1.5) * 1.2 : i === 4 ? Math.sin(clock * 2) * 2 - 8 : 0;
    S.put(g, IDS[i], x1, y1 + 12 + bob, (r.hot ? 0.9 : 0.82) * (i === 3 ? 0.8 : i === 4 ? 1.2 : 1));
  });

  // ================= 4. 配送車：行きは荷を積み、帰りは空。道の右側を走る =================
  routes.forEach((r, i) => {
    if (!r.open) return;
    const shown = Math.min(r.n, 5);
    const sp = ((0.16 + 0.03 * i) * (r.hot ? 1.8 : 1)) / (1 + i * 0.25);
    for (let k = 0; k < shown; k++) {
      const ph = (clock * sp + k / shown) % 1;
      const back = ph > 0.5;
      const [x, y] = along(i, back ? 2 - ph * 2 : ph * 2);
      const ty = y + (back ? 7 : 1);
      castShadow(g, x, ty, 6, 0.35);
      S.put(g, `truck_${IDS[i]}_${back ? 'l' : 'r'}`, x, ty + 1, 0.56);
      // 改良：金の線。パレットの段：荷台の上の積み荷
      for (let t = 0; t < tiers; t++) rr(g, x - 4, ty - 2 - t * 2, 8, 1, 0, C.gold);
      if (!back) for (let l = 0; l < load; l++) rr(g, x - 5 + (l % 3) * 2.6, ty - 10 - Math.floor(l / 3) * 2.6, 2.2, 2.2, 0.4, '#d9a85a');
      glow(g, back ? x - 8 : x + 8, ty - 3, 5, C.goldLight, 0.55);
    }
  });
  // 台数の札は、配送車をぜんぶ描いたあとで、いちばん上に置く（先に描くと、ほかの路線の車に隠れる）
  routes.forEach((r, i) => {
    if (!r.open) return;
    const [x1, y1] = dest(i);
    tag(g, `×${r.n}`, x1 + (i === 0 ? 34 : 0), y1 + (i === 0 ? -2 : 24), { size: 10.5, color: r.hot ? C.ink : C.goldLight, bg: r.hot ? C.gold : alpha(C.ink, 0.72) });
  });

  // ================= 5. 配送センター：台数が増えるほど大きな建物になる =================
  const size = total >= 60 ? 3 : total >= 12 ? 2 : 1;
  glow(g, HUB[0], HUB[1] - 6, 70, C.azure, 0.3);
  castShadow(g, HUB[0] + 2, HUB[1] + 14, 34 + size * 6, 0.45);
  // パレットの段：建物の横にコンテナが積み上がる
  for (let i = 0; i < Math.min(6, Math.floor(load * 1.2)); i++) S.put(g, 'container', HUB[0] - 44 + (i % 2) * 13, HUB[1] + 20 - Math.floor(i / 2) * 7, 0.8);
  const [, hh] = S.put(g, `hub_${size}`, HUB[0] + (size === 3 ? 8 : 0), HUB[1] + 16, 1.3);
  for (let k = 0; k < 3; k++) glow(g, HUB[0] - 14 + k * 14, HUB[1] + 2, 6, C.goldLight, 0.35);
  tag(g, `×${v.totalLabel}`, HUB[0], HUB[1] + 16 - hh - 8, { size: 10.5 });
  // 配車係：屋根の上で回るレーダー
  if (auto) {
    const rx = HUB[0] + 22;
    const ry = HUB[1] + 14 - hh;
    line(g, [rx, ry + 8, rx, ry], C.ice, 1.2);
    const a = clock * 2.4;
    g.fillStyle = alpha(C.leaf, 0.3);
    g.beginPath();
    g.moveTo(rx, ry);
    g.arc(rx, ry, 14, a, a + 0.9);
    g.closePath();
    g.fill();
    disc(g, rx, ry, 2.2, C.leaf);
  }
  // 手の空いた車は、センターの前に並んで待つ
  for (let k = 0; k < Math.min(free, 6); k++) S.put(g, 'truck_idle_r', HUB[0] - 22 + (k % 3) * 18, HUB[1] + 32 + Math.floor(k / 3) * 11, 0.56);
  if (free > 6) tag(g, `+${free - 6}`, HUB[0] + 52, HUB[1] + 44, { size: 10.5 });
}

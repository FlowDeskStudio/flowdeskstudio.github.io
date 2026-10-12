// 市場の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材：tools/art_market.py（3DAssets.dev の屋台・鐘・コインの山、Kenney「Survival Kit」の木箱、同じレンダラーで作った石だたみ）。
// 値段の板（線の図）は、読みやすさのために market.js の描き方のまま。ここでは、まわりの物を素材で描く。
import { C, alpha, lin, rr, text, tag, glow, sprites, castShadow } from '../ui/draw.js';

const S = sprites('market', ['stall_blue', 'stall_rose', 'stall_gold', 'crate', 'crate_gold', 'crate_red', 'bell', 'coins', 'paving']);
export const marketArtReady = () => S.ready();

// 夜空と、手前の石だたみ
export function marketBack(g, { W, H }) {
  g.fillStyle = lin(g, 0, 0, 0, H, '#16267a', C.ink);
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W + 100; x += 100) S.put(g, 'paving', x, H, 1);
  g.fillStyle = lin(g, 0, H - 24, 0, H, alpha(C.ink, 0), alpha(C.ink, 0.5));
  g.fillRect(0, H - 24, W, 24);
}

// 呼び込みの鐘：段が上がるほど、音の輪が増える
export function marketBell(g, { x, y, clock, rings }) {
  S.spin(g, 'bell', x, y, 20, Math.sin(clock * 5) * 0.22);
  for (let i = 0; i < rings; i++) {
    g.beginPath();
    g.arc(x, y, 14 + i * 5 + ((clock * 8) % 5), Math.PI * 0.75, Math.PI * 1.25);
    g.strokeStyle = alpha(C.gold, 0.5 - i * 0.14);
    g.lineWidth = 1.2;
    g.stroke();
  }
}

// 倉庫：段ごとに木箱が並ぶ。倉庫の段が上がるほど段が増え、たまると金に、あふれそうだと赤くなる
export function marketStock(g, { x, y, w, h, cells, k, label }) {
  rr(g, x, y, w, h, 8, alpha(C.ink, 0.6), alpha(C.gold, 0.4), 1);
  const chh = (h - 10) / cells;
  const size = Math.min(chh - 1, 24);
  const cols = Math.max(1, Math.floor((w - 12) / (size * 0.86)));
  const step = (w - 12) / cols;
  const im = S.get(k > 0.9 ? 'crate_red' : k > 0.6 ? 'crate_gold' : 'crate');
  for (let i = 0; i < cells; i++) {
    const filled = k * cells - i;
    const cy = y + h - 5 - (i + 1) * chh;
    rr(g, x + 6, cy + chh - 2, w - 12, 1.5, 0, alpha(C.gold, 0.35));
    if (filled <= 0) continue;
    const n = Math.max(1, Math.round(Math.min(1, filled) * cols));
    for (let c = 0; c < n; c++) g.drawImage(im, x + 6 + c * step + (step - size * 0.82) / 2, cy + chh - 2 - size, size * 0.82, size);
  }
  text(g, label, x + w / 2, y - 7, 10.5, C.muted, 'center', 600);
}

// 屋台の並び：数で増え、改良でひさしが金になる。端には、値切りのコインの山
export function marketStreet(g, { W, H, shown, gold, label, hg, hgLabel }) {
  for (let i = 0; i < shown; i++) {
    const x = 32 + i * 37;
    castShadow(g, x, H - 6, 16, 0.4);
    glow(g, x, H - 30, 18, C.goldLight, 0.16);
    S.put(g, i < gold ? 'stall_gold' : i % 2 ? 'stall_rose' : 'stall_blue', x, H - 4, 0.38);
  }
  tag(g, `×${label}`, 32 + shown * 37 - 10, H - 34, { size: 10.5, align: 'left' });
  if (hg > 0) {
    const stacks = Math.ceil(hg / 3);
    for (let i = 0; i < stacks; i++) {
      const full = Math.min(3, hg - i * 3);
      S.put(g, 'coins', W - 24 - i * 17, H - 5, 0.4 + full * 0.09);
    }
    tag(g, `Lv ${hgLabel}`, W - 24 - (stacks - 1) * 8.5, H - 42, { size: 10.5 });
  }
}

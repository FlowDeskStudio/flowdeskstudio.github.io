// 工場の絵（素材版）。計算には触れず、渡された状態を描くだけ。
// 素材は Kenney「Factory Kit」（CC0）を tools/render_factory.py で描き出したもの（assets/img/factory/）。
// 作り方の決まりは docs/art-guide.md。要点：
//   ・素材はどれも同じカメラ・同じ光。足もと（下端の中央）を合わせて置けば、向きと影がそろう。
//   ・ベルトをまたぐ設備は「奥」と「手前」の 2 枚。奥 → ベルト → 品 → 動く部品 → 手前、の順に重ねる。
//   ・動く部品（歯車、プレスの頭、落ちる原料）は別の素材。機械の本体は形を変えない。
import { C, alpha, lin, rr, line, poly, text, tag, glow, sparkle, smoke, image } from '../ui/draw.js';

const NAMES = ['belt', 'intake_back', 'intake_front', 'process', 'press_back', 'press_front', 'press_head', 'gate_back', 'gate_front',
  'cog', 'cog_small', 'raw', 'part', 'crate', 'tool', 'engine', 'wall', 'window', 'pipe', 'feed', 'screen', 'lamp', 'cone', 'pallet'];
const src = (n) => `assets/img/factory/${n}.png`;
const K = 0.375; // 素材 1 ピクセルを、絵の中の何ピクセルで描くか（モデルの 1 単位 = 48）
const U = 48 * Math.cos((24 * Math.PI) / 180); // 高さ 1 単位が、画面で何ピクセル上がるか
const GOODS = ['crate', 'tool', 'engine'];

// 旧い描き方へ戻す：開発者ツールで localStorage.setItem('incxinc.factoryArt', 'classic')
export const artWanted = () => {
  try {
    return globalThis.localStorage?.getItem('incxinc.factoryArt') !== 'classic';
  } catch {
    return true;
  }
};
// 素材がすべて読めているか（読めるまでは旧い描き方で描く）
export const artReady = () => NAMES.map((n) => image(src(n))).every(Boolean);

export function drawFactory(g, v) {
  const { W, H, MX, clock, time, rates, slow, even, conv, qual, counts, tiers, product, pile, labels } = v;
  const FLOOR = 152; // 壁と床の境
  const BELT_B = 190; // ベルトの下端
  const CY = BELT_B - 9.8; // ベルトのまんなかの床の高さ
  const TOP = CY - 0.4 * U; // ベルトの上面（品が乗る高さ）
  const BASE = BELT_B + 5; // 箱型の機械の足もと（ベルトより手前に張り出す）
  const GBASE = BELT_B + 4; // 脚で立つ設備の足もと
  const START = MX[0] - 30; // ベルトの左端
  const END = W - 96; // ベルトの右端
  const [IN, PR, AS] = MX;

  // 足もとの中央を (x, y) に合わせて素材を置く
  const spr = (name, x, y, sc = 1, a = 1) => {
    const im = image(src(name));
    const w = im.naturalWidth * K * sc;
    const hh = im.naturalHeight * K * sc;
    if (a !== 1) g.globalAlpha = a;
    g.drawImage(im, x - w / 2, y - hh, w, hh);
    if (a !== 1) g.globalAlpha = 1;
    return [w, hh];
  };
  // 床に落ちる影（光は左上から。影は少し右へ流す）
  const shade = (x, y, rx, a = 0.4) => {
    g.fillStyle = alpha(C.ink, a);
    g.beginPath();
    g.ellipse(x + rx * 0.08, y, rx, Math.max(2, rx * 0.2), 0, 0, Math.PI * 2);
    g.fill();
  };
  // 台数が増えるほど、設備が少し大きくなる
  const grow = (n) => 1 + Math.min(0.16, Math.log2(n + 1) * 0.022);
  const isSlow = (i) => !even && i === slow;

  // ================= 1. 奥：壁、配管、表示板 =================
  g.fillStyle = C.ink;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 10; i++) spr(i % 3 === 1 ? 'window' : 'wall', 24 + i * 48, FLOOR);
  for (let i = 1; i < 10; i += 3) glow(g, 24 + i * 48, 62, 30, C.goldLight, 0.18 + 0.03 * Math.sin(time * 1.3 + i));
  // 奥のものは紺に沈めて、手前の生産ラインを立たせる
  g.fillStyle = lin(g, 0, 0, 0, FLOOR, alpha(C.ink, 0.66), alpha(C.night, 0.5));
  g.fillRect(0, 0, W, FLOOR);
  for (let i = 0; i < 10; i++) spr('pipe', 24 + i * 48, 32, 1, 0.75);
  // 表示板：各工程の稼働を映す。配管から腕で吊り、いちばん遅い工程だけ赤くなる
  MX.forEach((x, i) => {
    const sx = x + 34;
    rr(g, sx - 1.5, 30, 3, 10, 0, alpha('#8f9bc4', 0.7));
    spr('screen', sx, 64, 0.7, 0.92);
    const hot = isSlow(i);
    rr(g, sx - 12, 40, 24, 11, 1.5, hot ? alpha(C.rose, 0.8) : alpha(C.azure, 0.6));
    for (let k = 0; k < 4; k++) {
      const bh = 2 + ((k * 5 + Math.floor(time * 1.5 + i * 2)) % 6);
      rr(g, sx - 9 + k * 5, 49 - bh, 3, bh, 0, alpha('#ffffff', 0.7));
    }
  });
  // 原料の送り管：壁の配管から、搬入の受け口の真上へ下りてくる
  spr('feed', IN, 86);

  // ================= 2. 床 =================
  g.fillStyle = lin(g, 0, FLOOR, 0, H, '#1a2766', C.ink);
  g.fillRect(0, FLOOR, W, H - FLOOR);
  g.fillStyle = alpha(C.sky, 0.3);
  g.fillRect(0, FLOOR, W, 1);
  g.fillStyle = lin(g, 0, FLOOR + 1, 0, FLOOR + 12, alpha(C.ink, 0.5), alpha(C.ink, 0)); // 壁ぎわの暗がり
  g.fillRect(0, FLOOR + 1, W, 11);
  for (let i = -4; i < 16; i++) line(g, [i * 48 + 24, FLOOR, i * 48 - 60, H], alpha(C.ice, 0.045), 1);
  for (const y of [166, 186, 214]) rr(g, 0, y, W, 1, 0, alpha(C.ice, 0.04));
  shade((START + END) / 2, BELT_B + 2, (END - START) / 2 + 6, 0.42);
  shade(IN, GBASE + 1, 30, 0.3);
  shade(PR, BASE + 2, 34 * grow(counts[1]), 0.5);
  shade(AS, GBASE + 1, 34, 0.32);
  shade(W - 48, BELT_B + 10, 44, 0.45);

  // ================= 3. ベルトの奥に立つ脚 =================
  const sIn = grow(counts[0]);
  const sPr = grow(counts[1]);
  const sAs = grow(counts[2]);
  const QX = AS + 52;
  const [, hIn] = spr('intake_back', IN, GBASE, sIn);
  const [, hAs] = spr('press_back', AS, GBASE, sAs);
  if (qual > 0) spr('gate_back', QX, GBASE);

  // ================= 4. ベルト =================
  // 区間ごとの流れの速さ：詰まっている工程の手前はゆっくり。矢と品は同じ速さで動く
  const ends = [IN, PR, AS, END];
  const seg = [0, 1, 2].map((k) => {
    const jam = !even && slow > k && slow > 0;
    return { from: ends[k], to: ends[k + 1], jam, gap: even ? 26 : jam ? 15 : 40, speed: jam ? 0.3 : 1 };
  });
  g.save();
  g.beginPath();
  g.rect(START, 0, END - START, H);
  g.clip();
  for (let x = START; x < END; x += 96) spr('belt', x + 48, BELT_B);
  g.strokeStyle = conv > 0 ? alpha(C.gold, 0.75) : alpha(C.ice, 0.4);
  g.lineWidth = 1.3;
  g.lineJoin = 'round';
  const step = Math.max(9, 18 - conv * 0.6);
  for (const s of [{ from: START, to: IN, speed: seg[0].speed }, ...seg]) {
    g.beginPath();
    for (let x = s.from + ((clock * s.speed) % step); x < s.to; x += step) {
      g.moveTo(x - 2, TOP - 5);
      g.lineTo(x + 2, TOP);
      g.lineTo(x - 2, TOP + 5);
    }
    g.stroke();
  }
  g.restore();
  // ベルトの両端のころ
  for (const x of [START, END]) rr(g, x - 2, TOP - 9, 4, 27, 2, lin(g, x - 2, 0, x + 2, 0, '#8f9bc4', '#2a3566'));

  // ================= 5. 流れる品 =================
  // 搬入 → 加工は原料、加工 → 組立は部品、組立のあとは完成品
  const KIND = ['raw', 'part', GOODS[product]];
  const item = (name, x, y, sc = 0.85) => {
    shade(x, y + 3, 6, 0.3);
    spr(name, x, y + 5, sc);
  };
  seg.forEach((s, k) => {
    const off = (clock * s.speed) % s.gap;
    for (let x = s.from + off; x < s.to - 2; x += s.gap) {
      // 受け口から出てきたばかりの原料は、少し上から下りてくる
      const fresh = k === 0 ? Math.max(0, 1 - (x - s.from) / 12) : 0;
      item(KIND[k], x, TOP - fresh * 18, k === 2 ? 0.62 : 0.85);
      if (k === 2 && qual > 0 && x > QX + 6) sparkle(g, x + 6, TOP - 12, 2.6, C.goldLight, 0.9);
    }
  });
  // 詰まった工程の手前にたまる山（ベルトの上に積み上がる）
  if (!even && slow > 0) {
    const ratio = Math.min(...rates.slice(0, slow)) / Math.max(1e-9, rates[slow]);
    const n = Math.min(10, Math.round(2 + 3 * Math.log2(ratio)));
    const edge = slow === 1 ? PR - 34 * sPr : AS - 30 * sAs;
    let placed = 0;
    for (let row = 0; row < 4 && placed < n; row++) {
      for (let col = 0; col < 4 - row && placed < n; col++, placed++) item(KIND[slow - 1], edge - 8 - col * 13 - row * 6.5, TOP - row * 10);
    }
  }

  // ================= 6. 動く部品 =================
  // プレスの頭：梁から下がる軸で上下する。下りきった瞬間に火花
  const stroke = Math.abs(Math.sin(clock * 0.05));
  const beamY = CY - 1.36 * U * sAs;
  const headY = TOP - 4 - (1 - stroke) * 14 * sAs;
  rr(g, AS - 3 * sAs, beamY, 6 * sAs, Math.max(0, headY - 36 * sAs - beamY), 0, lin(g, AS - 3, 0, AS + 3, 0, '#aab4ea', '#4b5682'));
  spr('press_head', AS, headY, 0.9 * sAs);
  if (stroke > 0.95) {
    sparkle(g, AS, TOP - 6, 6, C.goldLight);
    glow(g, AS, TOP - 4, 16, C.gold, 0.45);
  }
  // 搬入：送り管から受け口へ、原料が落ちる
  const hopTop = GBASE - hIn;
  const fall = (clock * 0.02) % 1;
  spr('raw', IN, 84 + fall * Math.max(4, hopTop + 16 - 84), 0.75, fall > 0.8 ? (1 - fall) * 5 : 1);

  // ================= 7. 手前：設備の本体 =================
  // 搬入
  spr('intake_front', IN, GBASE, sIn);
  if (fall > 0.85) glow(g, IN, hopTop + 14, 12, C.goldLight, (fall - 0.85) * 3); // 落ちた瞬間、受け口がふっと明るむ
  // 加工：正面で真ちゅうの歯車がかみ合って回り、窓の奥に部品が通る。動いているあいだ、わずかに震える
  const shake = Math.sin(time * 31) * 0.35;
  const [pw, ph] = spr('process', PR, BASE + shake, sPr);
  const pTop = BASE - ph;
  g.save();
  g.beginPath();
  g.rect(PR - pw * 0.27, BASE - ph * 0.37, pw * 0.54, ph * 0.25);
  g.clip();
  glow(g, PR, BASE - ph * 0.24, 20 * sPr, C.amber, 0.4 + 0.15 * Math.sin(time * 6));
  for (let x = PR - pw * 0.4 + ((clock * seg[0].speed) % 22); x < PR + pw * 0.4; x += 22) spr('part', x, BASE - ph * 0.15, 0.8, 0.75);
  g.restore();
  const cog = (name, cx, cy, size, a) => {
    const im = image(src(name));
    g.save();
    g.translate(cx, cy + shake);
    g.rotate(a);
    g.drawImage(im, -size / 2, -size / 2, size, size);
    g.restore();
  };
  cog('cog', PR - pw * 0.13, pTop + ph * 0.36, 25 * sPr, clock * 0.05);
  cog('cog_small', PR + pw * 0.19, pTop + ph * 0.31, 14.5 * sPr, -clock * 0.05 * (8 / 5) + 0.3);
  smoke(g, PR + pw * 0.2, pTop + 8, (time * 0.35) % 1, { size: 5, rise: 18, a: 0.22 });
  // ベルトが機械に入る所と出る所は、機械の影で暗くなる
  for (const side of [-1, 1]) {
    const ex = PR + side * pw * 0.47;
    g.fillStyle = lin(g, ex, 0, ex + side * 9, 0, alpha(C.ink, 0.55), alpha(C.ink, 0));
    g.fillRect(Math.min(ex, ex + side * 9), TOP - 10, 9, 22);
  }
  // 組立
  spr('press_front', AS, GBASE, sAs);
  // 品質：出口の検査の門。金の光の線が品をなぞる
  if (qual > 0) {
    spr('gate_front', QX, GBASE);
    const lensY = CY - 0.76 * U;
    const sweep = Math.sin(time * 2.2) * 7;
    g.fillStyle = lin(g, 0, lensY, 0, TOP + 4, alpha(C.goldLight, 0.5), alpha(C.gold, 0.06));
    g.beginPath();
    g.moveTo(QX - 3, lensY);
    g.lineTo(QX + 3, lensY);
    g.lineTo(QX + 11 + sweep, TOP + 4);
    g.lineTo(QX - 11 + sweep, TOP + 4);
    g.fill();
    line(g, [QX - 11 + sweep, TOP + 4, QX + 11 + sweep, TOP + 4], alpha(C.goldLight, 0.8), 1.2);
    glow(g, QX, lensY, 7 + Math.min(5, qual * 0.5), C.goldLight, 0.6);
  }

  // ================= 8. 出荷、飾り =================
  spr('pallet', W - 48, BELT_B + 14);
  const perRow = product === 2 ? 3 : 4;
  const gw = product === 2 ? 25 : 19;
  for (let i = 0; i < pile; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    spr(GOODS[product], W - 48 + (col - (perRow - 1) / 2) * gw + (row % 2) * gw * 0.25, BELT_B + 5 - row * (product === 2 ? 15 : 11), product === 2 ? 0.62 : 0.56);
  }
  // 床に置いた原料の控えと、注意のコーン
  spr('raw', 22, 212, 1.1);
  spr('raw', 38, 214, 1.1);
  spr('raw', 30, 201, 1.1);
  spr('cone', W - 12, H - 8, 0.8);

  // ================= 9. 灯りと表示 =================
  // 設備の上の灯：ふつうは緑、詰まっている工程は赤く点滅
  const tops = [hopTop, pTop, GBASE - hAs];
  MX.forEach((x, i) => {
    const lx = x + (i === 1 ? -22 * sPr : 24);
    const ly = tops[i] + (i === 1 ? 10 : 12);
    spr('lamp', lx, ly, 0.32);
    glow(g, lx, ly - 21, 9, isSlow(i) ? C.rose : C.leaf, isSlow(i) ? 0.55 + 0.3 * Math.sin(time * 8) : 0.5);
    // 改良：1 回ごとに金の板が 1 枚
    for (let k = 0; k < tiers[i]; k++) rr(g, x - 12, GBASE + 18 + k * 3.4, 24, 2, 1, lin(g, x - 12, 0, x + 12, 0, C.goldLight, C.gold, C.goldDark));
    // 台数は足もとの床に、速さと名前はいちばん下に（機械や品に重ねない）
    tag(g, `×${labels.count[i]}`, x, GBASE + 9, { size: 10.5 });
    text(g, labels.rate[i], x - 2, H - 5, 10.5, isSlow(i) ? C.rose : C.ivory, 'right');
    text(g, labels.name[i], x + 3, H - 5, 10, C.muted, 'left', 600);
    if (isSlow(i)) {
      const by = tops[i] - 24 + Math.sin(time * 6) * 1.5;
      poly(g, [x - 8, by + 12, x, by - 2, x + 8, by + 12], C.rose);
      text(g, '!', x, by + 10.5, 9.5, '#ffffff');
    }
  });
  // 搬送の段：ベルトの左端の手前に
  if (conv > 0) tag(g, `Lv ${conv}`, START - 20, TOP + 2, { size: 10.5 });
  // 品質の段：検査の門の上に
  if (qual > 0) tag(g, `Lv ${qual}`, QX + 6, GBASE - 86, { size: 10.5 });
}

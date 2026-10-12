// 司令室：ゲーム群をひと目で見わたす画面。計算には触れず、いまの状態を並べるだけ（転生と一括購入は、もとの処理を呼ぶ）。
//   上：全体の数字と、一括の操作（本部が開いてから）
//   中：流れの図。親のゲームから融合ゲームへ品物が流れ、還元を買うと融合ゲームから親へ金の粒が戻る
//   下：ゲームごとの札。稼ぎ、育ち具合（いちばん育ったゲームとの比）、買える強化、転生のしどき、手を入れるべき状態
import { h, setText } from './dom.js';
import { t } from '../core/i18n.js';
import { fmt, fmtMult } from '../core/format.js';
import { ORDER, GAMES, FUSIONS } from '../core/registry.js';
import { prestigeGain, gameAfford, upShown, lvl } from '../core/engine.js';
import { totalRate, parentMult, givebackMult, bulkBuy, bulkPrestige } from '../core/world.js';
import { digits } from '../core/meta.js';
import { gameIcon, gameColor, plainIcon } from './icons.js';
import { C, alpha, calm } from './draw.js';

// そのゲームが、いま手を入れてほしい状態か。ゲームが attention() を持てばそれを使い、無ければ「放っておくと稼がない」だけを見る
export function attentionOf(save, id) {
  const g = GAMES[id];
  const s = save.games[id];
  return g.attention?.(s) || (totalRate(save, id).lte(0) ? 'manual' : null);
}
// 転生のしどき：いま転生すると、これまでに得た転生ポイントと同じかそれ以上がもらえる
export function prestigeRipe(g, s) {
  const gain = prestigeGain(g, s);
  return gain.gte(1) && gain.gte(s.ppGot);
}
const affordable = (g, s) => g.upgrades.reduce((n, u) => n + ((u.max == null || lvl(s, u.id) < u.max) && upShown(s, u) && gameAfford(g, s, u) >= 1 ? 1 : 0), 0);

// アイコンの HTML（SVG か、画像のタグ）を、キャンバスに描ける画像にする
const svgImage = (html) => {
  const im = new Image();
  if (html.startsWith('<svg')) im.src = 'data:image/svg+xml,' + encodeURIComponent(html);
  else im.src = /src="([^"]+)"/.exec(html)?.[1] || '';
  return im;
};

export function renderHub({ save, panel, select, toast, se, modal, doPrestige, visitorOf }) {
  const owned = ORDER.filter((g) => save.games[g.id]);
  const gname = (id) => t(`g.${id}`);

  // ---- 上：全体の数字と一括 ----
  const fig = (key) => {
    const b = h('b');
    return { b, el: h('div', null, b, h('small', null, t(key))) };
  };
  const nGames = fig('hub.s.games');
  const nBuy = fig('hub.s.buy');
  const nPp = fig('hub.s.pp');
  const nAtt = fig('hub.s.att');
  const bulk = (key, fn) => h('button', { class: 'btn', onclick: () => {
    const n = fn(save);
    if (n > 0) {
      se('buy');
      toast(t(`meta.bulk.${key}.done`, { v: n }), 'coin');
    }
    update();
  } }, t(`meta.bulk.${key}`));
  const bulkRow = h('div', { class: 'row wrap' }, bulk('buy', bulkBuy), bulk('prestige', bulkPrestige));
  const top = h('div', { class: 'box' }, h('div', { class: 'stat' }, nGames.el, nBuy.el, nPp.el, nAtt.el), bulkRow);

  // ---- 中：流れの図 ----
  const FW = 960;
  const FH = 230;
  const cv = h('canvas', { class: 'hubflow', width: FW * 2, height: FH * 2 });
  const g2 = cv.getContext('2d');
  g2.scale(2, 2);
  const bases = owned.filter((g) => g.kind !== 'fusion');
  const fusions = owned.filter((g) => g.kind === 'fusion');
  const pos = {};
  bases.forEach((g, i) => { pos[g.id] = [FW * ((i + 0.5) / bases.length), 46]; });
  fusions.forEach((g, i) => { pos[g.id] = [FW * ((i + 0.5) / fusions.length), 176]; });
  const icons = Object.fromEntries(owned.map((g) => [g.id, svgImage(gameIcon(g.id))]));
  let hover = null;
  let clock = 0;
  const nodeAt = (ev) => {
    const r = cv.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * FW;
    const y = ((ev.clientY - r.top) / r.height) * FH;
    return owned.find((g) => Math.hypot(pos[g.id][0] - x, pos[g.id][1] - y) < 30)?.id || null;
  };
  cv.addEventListener('pointermove', (ev) => {
    hover = nodeAt(ev);
    cv.style.cursor = hover ? 'pointer' : 'default';
  });
  cv.addEventListener('pointerleave', () => { hover = null; });
  cv.addEventListener('pointerdown', (ev) => {
    const id = nodeAt(ev);
    if (id) select(id);
  });
  const flowBox = h('div', { class: 'box' }, h('h3', null, t('hub.flow')), cv);
  flowBox.hidden = !fusions.length;

  function drawFlow(dt) {
    clock += dt;
    g2.clearRect(0, 0, FW, FH);
    const still = calm();
    for (const f of fusions) {
      const [fx, fy] = pos[f.id];
      const give = lvl(save.games[f.id], 'giveback');
      f.parents.forEach((p, k) => {
        if (!pos[p]) return;
        const [px, py] = pos[p];
        const lit = !hover || hover === f.id || hover === p;
        const at = (u) => {
          const v = 1 - u;
          const cx1 = px;
          const cy1 = py + 70;
          const cx2 = fx;
          const cy2 = fy - 70;
          return [v * v * v * px + 3 * v * v * u * cx1 + 3 * v * u * u * cx2 + u * u * u * fx, v * v * v * py + 3 * v * v * u * cy1 + 3 * v * u * u * cy2 + u * u * u * fy];
        };
        g2.strokeStyle = alpha(gameColor(p), lit ? 0.5 : 0.1);
        g2.lineWidth = lit ? 1.6 : 1;
        g2.beginPath();
        g2.moveTo(px, py);
        g2.bezierCurveTo(px, py + 70, fx, fy - 70, fx, fy);
        g2.stroke();
        if (!lit) return;
        // 親から子へ：親の色の粒（親の品物が流れこむ）
        for (let i = 0; i < 3; i++) {
          const u = still ? (i + 0.5) / 3 : (clock * 0.22 + i / 3 + k * 0.17) % 1;
          const [x, y] = at(u);
          g2.fillStyle = gameColor(p);
          g2.beginPath();
          g2.arc(x, y, 3, 0, Math.PI * 2);
          g2.fill();
        }
        // 子から親へ：還元を買っていれば、金の粒が戻る
        if (give > 0) {
          for (let i = 0; i < Math.min(3, 1 + Math.floor(give / 4)); i++) {
            const u = still ? 1 - (i + 0.25) / 3 : 1 - ((clock * 0.3 + i / 3 + k * 0.4) % 1);
            const [x, y] = at(u);
            g2.fillStyle = C.goldLight;
            g2.beginPath();
            g2.arc(x + 5, y, 2.2, 0, Math.PI * 2);
            g2.fill();
          }
        }
      });
    }
    for (const g of owned) {
      const [x, y] = pos[g.id];
      const on = hover === g.id;
      const att = attentionOf(save, g.id);
      const gr = g2.createRadialGradient(x, y, 0, x, y, 30);
      gr.addColorStop(0, alpha(att ? C.rose : gameColor(g.id), on ? 0.6 : 0.35));
      gr.addColorStop(1, alpha(gameColor(g.id), 0));
      g2.fillStyle = gr;
      g2.fillRect(x - 30, y - 30, 60, 60);
      const im = icons[g.id];
      if (im && im.complete && im.naturalWidth) g2.drawImage(im, x - 19, y - 19, 38, 38);
      g2.font = '600 11px "Segoe UI", "Yu Gothic UI", sans-serif';
      g2.textAlign = 'center';
      g2.fillStyle = on ? C.goldLight : C.ice;
      g2.fillText(gname(g.id), x, y + (g.kind === 'fusion' ? 36 : -28));
    }
  }

  // ---- 下：ゲームごとの札 ----
  const tiles = owned.map((g) => {
    const amt = h('b');
    const rate = h('small');
    const bar = h('i');
    const buy = h('span', { class: 'hchip' });
    const att = h('span', { class: 'hchip att' });
    const lag = h('span', { class: 'hchip lag' }, t('hub.lag'));
    const bird = h('span', { class: 'hchip bird' }, t('visit.name')); // 金の鳥が来ている（捕まえるには、そのゲームを見に行く）
    const pp = h('button', { class: 'hchip pp', onclick: (ev) => {
      ev.stopPropagation();
      doPrestige(g.id, update);
    } });
    // 品物の流れ：融合ゲームは、親 2 本の品物を受け取る。親は、還元を買った融合ゲームから受け取る
    const flow = h('span', { class: 'hflow' });
    const el = h('div', { class: 'htile', role: 'button', tabindex: '0', onclick: () => select(g.id), onkeydown: (ev) => { if (ev.key === 'Enter') select(g.id); } },
      h('span', { class: 'gicon', html: gameIcon(g.id) }),
      h('span', { class: 'ctext' }, h('span', { class: 'cname' }, gname(g.id)), amt, rate),
      h('span', { class: 'hbar' }, bar), h('span', { class: 'hchips' }, bird, att, pp, buy, lag), flow);
    return { g, el, amt, rate, bar, buy, att, lag, pp, flow, bird };
  });
  const grid = h('div', { class: 'hubgrid' }, tiles.map((x) => x.el));

  panel.append(
    h('div', { class: 'ghead' }, h('span', { class: 'gicon big', html: plainIcon('city') }), h('div', null, h('h1', null, t('hub.title')), h('div', { class: 'sub' }, t('hub.sub')))),
    top, flowBox, grid);

  function update() {
    const dg = tiles.map((x) => digits(save.games[x.g.id]));
    const max = Math.max(1, ...dg);
    const min = Math.min(...dg);
    let buys = 0;
    let pps = 0;
    let atts = 0;
    tiles.forEach((x, i) => {
      const s = save.games[x.g.id];
      setText(x.amt, fmt(s.amt));
      setText(x.rate, t('c.perSec', { v: fmt(totalRate(save, x.g.id), 1) }));
      x.bar.style.width = `${Math.max(4, (dg[i] / max) * 100)}%`;
      const n = affordable(x.g, s);
      buys += n;
      x.buy.hidden = n < 1;
      setText(x.buy, t('hub.chip.buy', { v: n }));
      const gain = prestigeGain(x.g, s);
      const ripe = prestigeRipe(x.g, s);
      if (gain.gte(1)) pps++;
      x.pp.hidden = gain.lt(1);
      x.pp.classList.toggle('ripe', ripe);
      setText(x.pp, t('hub.chip.pp', { v: fmt(gain) }));
      const a = attentionOf(save, x.g.id);
      if (a) atts++;
      x.att.hidden = !a;
      if (a) setText(x.att, t(`hub.att.${a}`));
      x.el.classList.toggle('att', !!a);
      x.lag.hidden = !(tiles.length >= 4 && dg[i] === min && min < max * 0.6);
      x.bird.hidden = visitorOf() !== x.g.id;
      x.el.classList.toggle('bird', !x.bird.hidden);
      // 流れ
      let line = '';
      if (x.g.kind === 'fusion') line = `${x.g.parents.map((p) => t(`res.${p}`)).join('・')} → ${fmtMult(parentMult(save, x.g))}`;
      else {
        const from = FUSIONS.filter((c) => save.games[c.id] && c.parents.includes(x.g.id) && lvl(save.games[c.id], 'giveback') > 0);
        line = from.map((c) => `${t(`res.${c.id}`)} → ${fmtMult(givebackMult(save.games[c.id]))}`).join('　');
      }
      x.flow.hidden = !line;
      setText(x.flow, line);
    });
    setText(nGames.b, String(tiles.length));
    setText(nBuy.b, String(buys));
    setText(nPp.b, String(pps));
    setText(nAtt.b, String(atts));
    bulkRow.hidden = !save.meta.unlocked;
  }

  return { update, frame: (dt) => { if (!flowBox.hidden) drawFlow(dt); } };
}

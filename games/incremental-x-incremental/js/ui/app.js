// 画面全体：左のゲーム一覧、上の目標、右の本体（ゲーム・実験室・設定）
import { t, getLang, LANGS, upName, upDesc } from '../core/i18n.js';
import { fmt, fmtMult, fmtTime } from '../core/format.js';
import { ASSETS, imgOr } from '../core/assets.js';
import { se, setVolume } from '../core/audio.js';
import { lvl, prestige, prestigeGain, ppMult, gameCost, gameAfford, gameBuy, upShown, treeLvl, treeCost, treeState, buyTree, achCount, ACH_BONUS } from '../core/engine.js';
import { ORDER, GAMES, BASES, RECIPES, pairKey } from '../core/registry.js';
import { autoGames, autoSlots, toggleAuto, drainAch, drainBorn, getMult, lockedOptions, unlockInfo, unlockReady, canUnlock, unlockGame, linkMult, offlineCap, totalRate, copyRate, copySlots, copyCost, copyState, makeCopy, bulkBuy, bulkPrestige, bulkCopy } from '../core/world.js';
import * as lab from '../core/lab.js';
import * as meta from '../core/meta.js';
import { STEPS, currentStep, advance } from '../core/guide.js';
import { MILESTONES, checkMilestones } from '../core/milestones.js';
import { ceremony } from './ceremony.js';
import { store, wipe, exportString, importString } from '../core/save.js';
import { h, setText } from './dom.js';
import { gameIcon, plainIcon } from './icons.js';

const icon = (g) => gameIcon(g.id);
// 融合ゲームの親を小さく並べる（何と何から生まれたか）
const parentIcons = (g) => h('span', { class: 'parents' }, g.parents.map((p) => h('i', { html: gameIcon(p) })));
const gname = (id) => t(`g.${id}`);
// 実績の名前は種類ごとのひな形から作る
const achName = (id, a) => t(`ach.${a.type}`, { v: fmt(a.v), r: t(`res.${id}`) });

export function createApp(save) {
  const side = document.getElementById('side');
  const panel = document.getElementById('panel');
  const guideEl = document.getElementById('guide');
  const toasts = document.getElementById('toasts');
  const modalEl = document.getElementById('modal');
  let view = null; // { update, frame?, destroy? }
  let sideUpdate = () => {};
  let guideUpdate = () => {};

  const ctxOf = (id) => ({ mult: getMult(save, id), visible: true });

  // 買えた手ごたえ：行を光が横切る
  const bought = (btn) => {
    btn.classList.remove('bought');
    void btn.offsetWidth;
    btn.classList.add('bought');
  };

  // ---- 通知と確認 ----
  function toast(text, img) {
    const el = h('div', { class: 'toast' }, img ? h('span', { class: 'ticon', html: imgOr(img) }) : null, text);
    toasts.append(el);
    // 重なりすぎると買い物の邪魔になるので、古いものから消す
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3400);
    setTimeout(() => el.remove(), 3600);
  }

  // 新しいゲームが増えた瞬間に、小さなポポーの種と葉をはじけさせる
  function burst() {
    const box = h('div', { class: 'burst' });
    for (let i = 0; i < 18; i++) {
      const p = h('i', { class: i % 3 ? 'seed' : 'leaf' });
      const a = (i / 18) * Math.PI * 2;
      const d = 120 + (i % 4) * 45;
      p.style.setProperty('--x', `${Math.cos(a) * d}px`);
      p.style.setProperty('--y', `${Math.sin(a) * d}px`);
      p.style.setProperty('--r', `${i * 47}deg`);
      box.append(p);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), 1100);
  }

  // 知らせが重なったら、閉じるたびに順に出す
  const waiting = [];
  function modal(title, body, buttons) {
    if (!modalEl.hidden) {
      waiting.push([title, body, buttons]);
      return;
    }
    const close = () => {
      modalEl.hidden = true;
      modalEl.replaceChildren();
      if (waiting.length) modal(...waiting.shift());
    };
    const row = h('div', { class: 'row end' }, buttons.map((b) =>
      h('button', { class: b.primary ? 'btn primary' : 'btn', onclick: () => { close(); b.fn?.(); } }, b.label)));
    modalEl.replaceChildren(h('div', { class: 'dialog' }, h('h2', null, title), h('div', { class: 'dbody' }, body), row));
    modalEl.hidden = false;
  }

  // ---- 左：ゲーム一覧 ----
  function buildSide() {
    const cards = [];
    const list = h('div', { class: 'list' });
    const fusionList = h('div', { class: 'list' });
    for (const g of ORDER) {
      if (!save.games[g.id]) continue;
      const amt = h('b');
      const rate = h('small');
      const fusion = g.kind === 'fusion';
      const card = h('button', { class: fusion ? 'card fusion' : 'card', onclick: () => select(g.id) },
        h('span', { class: 'gicon', html: icon(g) }),
        h('span', { class: 'ctext' }, h('span', { class: 'cname' }, gname(g.id), fusion ? parentIcons(g) : null), amt, rate));
      (fusion ? fusionList : list).append(card);
      cards.push({ id: g.id, card, amt, rate });
    }
    const fusionHead = h('div', { class: 'sect' }, t('c.fusion'));
    fusionHead.hidden = !fusionList.children.length;

    // 次に解放できる基本ゲーム
    // 序盤は順番が決まっていて中身は伏せる。そのあとは、残りの中から自分で選ぶ。
    let lock = null;
    const options = lockedOptions(save);
    if (options.length) {
      const info = unlockInfo(save, options[0]);
      const choosing = !!options[0].unlock.choice;
      const need = [];
      for (const [id, v] of Object.entries(info.life || {})) need.push(t('unlock.need.life', { g: gname(id), v: fmt(v) }));
      if (info.games) need.push(t('unlock.need.fusion'));
      if (info.stars) need.push(t('unlock.need.stars', { v: info.stars }));
      if (info.coins) need.push(t('unlock.need.coins', { v: fmt(info.coins) }));
      const cost = Object.entries(info.cost).map(([id, v]) => `${fmt(v)} ${t(`res.${id}`)}`).join(' ＋ ');
      const btns = options.map((g) => h('button', { class: choosing ? 'pick' : 'btn primary small', onclick: () => {
        if (!unlockGame(save, g)) return;
        se('born');
        toast(t('unlock.done', { g: gname(g.id) }), 'shine');
        burst();
        buildSide();
        select(g.id);
      } }, choosing ? [h('span', { class: 'gicon', html: icon(g) }), h('b', null, gname(g.id))] : t('unlock.btn')));
      const needEl = h('small', null, need.join(' ／ '));
      const costEl = h('small', null, `${t('lab.cost')}: ${cost}`);
      list.append(h('div', { class: 'card locked' }, choosing ? null : h('span', { class: 'gicon', html: plainIcon('unknown') }),
        h('span', { class: 'ctext' }, h('span', { class: 'cname' }, t(choosing ? 'unlock.choose' : 'unlock.title')), needEl, costEl, btns)));
      lock = { g: options[0], btns, needEl, costEl };
    }

    const navBtn = (id, iconHtml, label) => h('button', { class: 'nav', title: label, onclick: () => select(id) }, h('span', { class: 'gicon', html: iconHtml }), h('span', null, label));
    const labBtn = navBtn('lab', imgOr('cut'), t('nav.lab'));
    const metaBtn = navBtn('meta', imgOr('coin'), t('nav.meta.short'));
    const setBtn = navBtn('settings', plainIcon('settings'), t('nav.settings'));
    side.replaceChildren(
      h('div', { class: 'brand' }, h('span', { class: 'logo', html: imgOr('mark') }), h('div', null, h('strong', null, t('app.title')))),
      h('div', { class: 'games' }, list, fusionHead, fusionList),
      h('div', { class: 'navs' }, labBtn, metaBtn, setBtn));

    sideUpdate = () => {
      for (const c of cards) {
        const s = save.games[c.id];
        setText(c.amt, fmt(s.amt));
        setText(c.rate, t('c.perSec', { v: fmt(totalRate(save, c.id), 1) }));
        c.card.classList.toggle('on', save.active === c.id);
      }
      if (lock) {
        const ready = unlockReady(save, lock.g);
        const can = canUnlock(save, lock.g);
        lock.needEl.hidden = ready;
        lock.costEl.hidden = !ready;
        for (const b of lock.btns) {
          b.hidden = !ready;
          b.disabled = !can;
        }
      }
      labBtn.hidden = !save.lab.unlocked;
      labBtn.classList.toggle('on', save.active === 'lab');
      metaBtn.hidden = !save.meta.unlocked;
      metaBtn.classList.toggle('on', save.active === 'meta');
      setBtn.classList.toggle('on', save.active === 'settings');
    };
    sideUpdate();
  }

  // ---- 上：次の目標 ----
  function buildGuide() {
    const text = h('span');
    const bar = h('div', { class: 'bar thin' }, h('i'));
    guideEl.replaceChildren(h('span', { class: 'gbadge', html: imgOr('badge', '🎯') }), h('span', { class: 'glabel' }, t('guide.label')), text, bar);
    guideUpdate = () => {
      // 目標を達成したら、帯そのものを光らせて次の目標へ替える（知らせは重ねない）
      let moved = false;
      while (advance(save)) moved = true;
      if (moved) {
        guideEl.classList.remove('done');
        void guideEl.offsetWidth;
        guideEl.classList.add('done');
      }
      const st = currentStep(save);
      setText(text, st ? t(`guide.${st.id}`) : t('guide.end'));
      const p = st && st.prog ? st.prog(save) : null;
      bar.hidden = !p;
      if (p) bar.firstChild.style.width = `${Math.min(100, (p[0] / p[1]) * 100)}%`;
    };
  }

  // ---- 本体の切り替え ----
  function select(id) {
    if (view && id !== save.active) se('select');
    if (!['lab', 'meta', 'settings'].includes(id) && !save.games[id]) id = 'clicker';
    if (id === 'lab' && !save.lab.unlocked) id = 'clicker';
    if (id === 'meta' && !save.meta.unlocked) id = 'clicker';
    view?.destroy?.();
    save.active = id;
    panel.replaceChildren();
    view = id === 'lab' ? renderLab() : id === 'meta' ? renderMeta() : id === 'settings' ? renderSettings() : renderGame(id);
    view.update();
    sideUpdate();
  }

  // ---- ゲーム画面 ----
  function renderGame(id) {
    const g = GAMES[id];
    const s = () => save.games[id];
    const api = { s, ctx: () => ctxOf(id) };

    const amt = h('div', { class: 'amount' });
    const rate = h('div', { class: 'sub' });
    const mult = h('div', { class: 'sub' });
    const head = h('div', { class: 'ghead' }, h('span', { class: 'gicon big', html: icon(g) }),
      h('div', null, h('h1', null, gname(id)), h('div', { class: 'sub' }, t(`res.${id}`))), h('div', { class: 'grow' }), h('div', { class: 'right' }, amt, rate, mult));

    const play = h('div', { class: 'play' });
    const gv = g.mount(play, api);

    // 強化。何度でも買えるものと、1 回きりの「改良」を分けて並べる
    const amts = [1, 10, 'max'];
    const amtBtns = amts.map((a) => h('button', { class: 'mini', onclick: () => { save.settings.buy = a; update(); } }, a === 'max' ? t('c.max') : `×${a}`));
    const rows = g.upgrades.map((u) => {
      const name = h('b', null, upName(id, u));
      const lv = h('span', { class: 'lv' });
      const desc = h('small');
      const cost = h('span', { class: 'cost' });
      const btn = h('button', { class: 'up', onclick: () => {
        if (!gameBuy(g, s(), u, u.once ? 1 : save.settings.buy)) return;
        se('buy');
        bought(btn);
        update();
      } }, h('span', { class: 'uptop' }, name, lv), desc, cost);
      return { u, btn, lv, desc, cost };
    });
    const onceRows = rows.filter((r) => r.u.once);
    const onceHead = h('h3', null, t('c.once'));
    const onceDone = h('div', { class: 'sub' });

    // 転生
    const ppName = t(`${id}.pp.n`);
    const perOf = (st) => (typeof g.ppPer === 'function' ? g.ppPer(st) : g.ppPer);
    const ppHave = h('div');
    const ppGain = h('div', { class: 'sub' });
    const ppBtn = h('button', { class: 'btn primary', onclick: () => {
      const gain = prestigeGain(g, s());
      if (gain.lt(1)) return;
      modal(t('pp.title'), t('pp.confirm', { n: ppName, v: fmt(gain) }), [
        { label: t('c.cancel') },
        { label: t('pp.btn'), primary: true, fn: () => {
          if (!prestige(g, s())) return;
          se('prestige');
          ceremony({ kind: 'prestige', title: t('pp.title'), big: `+${fmt(gain)}`, sub: ppName });
          update();
        } },
      ]);
    } }, t('pp.btn'));
    const ppBox = h('div', { class: 'box' }, h('h3', null, g.ppImg ? h('span', { class: 'ticon', html: imgOr(g.ppImg) }) : null, `${t('pp.title')}${t('c.sep')}${ppName}`),
      h('div', { class: 'sub' }, t(`${id}.pp.d`)), ppHave, ppGain, ppBtn);

    // 複製（本部で枠を解放してから出る）
    const cpSrcRate = h('b');
    const cpSrc = h('div', { class: 'cslot src' }, h('span', { class: 'gicon', html: gameIcon(id) }), h('small', null, t('copy.src')), cpSrcRate);
    const cpSlots = h('div', { class: 'cslots' });
    const cpFlow = h('div', { class: 'cflow' }, cpSrc, h('b', { class: 'carrow' }, '→'), cpSlots);
    const cpTotal = h('div', { class: 'ctotal' });
    const cpPreview = h('div', { class: 'sub' });
    const cpCost = h('div', { class: 'sub' });
    let cpSig = '';
    let cpEls = [];
    const cpBtn = h('button', { class: 'btn primary', onclick: () => {
      if (!makeCopy(save, id)) return;
      se('buy');
      toast(t('copy.done', { g: gname(id) }), 'coin');
      update();
    } }, t('copy.btn'));
    const cpBox = h('div', { class: 'box' }, h('h3', null, h('span', { class: 'ticon', html: imgOr('coin') }), t('copy.title')), cpFlow, cpTotal, cpPreview, cpCost, cpBtn, h('div', { class: 'sub' }, t('copy.note')));

    const shop = h('div', { class: 'shop' }, h('div', { class: 'row' }, amtBtns), rows.filter((r) => !r.u.once).map((r) => r.btn),
      onceHead, onceRows.map((r) => r.btn), onceDone, ppBox, cpBox);
    const playTab = h('div', { class: 'gbody' }, play, shop);

    // 転生ツリー
    const treePts = h('div', { class: 'amount small' });
    const treeRows = (g.tree || []).map((node) => {
      const lv = h('span', { class: 'lv' });
      const cost = h('span', { class: 'cost' });
      const need = h('small', { class: 'need' });
      const btn = h('button', { class: 'up', onclick: () => {
        if (!buyTree(g, s(), node)) return;
        se('buy');
        bought(btn);
        update();
      } }, h('span', { class: 'uptop' }, h('b', null, t(`${id}.tree.${node.id}.n`)), lv), h('small', null, t(`${id}.tree.${node.id}.d`)), cost, need);
      return { node, btn, lv, cost, need };
    });
    const treeTab = h('div', { class: 'tabbody' }, h('div', { class: 'row' }, g.ppImg ? h('span', { class: 'gicon', html: imgOr(g.ppImg) }) : null, treePts),
      h('div', { class: 'treegrid' }, treeRows.map((r) => r.btn)));

    // 実績
    const achHead = h('div', { class: 'amount small' });
    const achRows = (g.achievements || []).map((a) => ({ a, el: h('div', { class: 'ach' }, h('span', { class: 'ticon', html: imgOr('badge', '🏅') }), achName(id, a)) }));
    const achTab = h('div', { class: 'tabbody' }, achHead, h('div', { class: 'achgrid' }, achRows.map((r) => r.el)));

    // 画面の切り替え（ツリーや実績を持つゲームだけ出る）
    const tabs = [
      { key: 'play', body: playTab, label: t('tab.play') },
      g.tree ? { key: 'tree', body: treeTab, label: t('tab.tree') } : null,
      g.achievements ? { key: 'ach', body: achTab, label: t('tab.ach') } : null,
    ].filter(Boolean);
    let tab = 'play';
    for (const x of tabs) x.btn = h('button', { class: 'tab', onclick: () => { tab = x.key; se('select'); update(); } }, x.label);
    const tabBar = h('div', { class: 'tabs' }, tabs.map((x) => x.btn));
    tabBar.hidden = tabs.length < 2;
    panel.append(head, tabBar, ...tabs.map((x) => x.body));

    function update() {
      const st = s();
      const ctx = ctxOf(id);
      setText(amt, fmt(st.amt));
      setText(rate, t('c.perSec', { v: fmt(totalRate(save, id), 1) }));
      mult.hidden = ctx.mult.lte(1);
      setText(mult, t('c.mult', { v: fmtMult(ctx.mult) }));
      for (const x of tabs) {
        x.body.hidden = x.key !== tab;
        x.btn.classList.toggle('on', x.key === tab);
      }
      if (g.tree) {
        // ツリーは、転生ポイントを 1 度でも手にしてから見せる
        const treeTabEl = tabs.find((x) => x.key === 'tree');
        treeTabEl.btn.hidden = st.prestiges === 0 && st.ppGot.lt(1) && st.pp.lt(1) && tab !== 'tree';
        setText(treeTabEl.btn, `${t('tab.tree')}（${fmt(st.pp)}）`);
      }
      if (g.achievements) setText(tabs.find((x) => x.key === 'ach').btn, `${t('tab.ach')}（${achCount(st)} / ${g.achievements.length}）`);

      if (tab === 'play') {
        amtBtns.forEach((b, i) => b.classList.toggle('on', save.settings.buy === amts[i]));
        const buy = save.settings.buy;
        let onceOpen = 0;
        let onceBought = 0;
        for (const r of rows) {
          const lv = lvl(st, r.u.id);
          const maxed = r.u.max != null && lv >= r.u.max;
          if (r.u.once && maxed) onceBought++;
          // 買い終えた改良は並べない
          r.btn.hidden = !upShown(st, r.u) || (r.u.once && maxed);
          if (r.btn.hidden) continue;
          if (r.u.once) onceOpen++;
          const can = maxed ? 0 : gameAfford(g, st, r.u);
          const room = r.u.max != null ? r.u.max - lv : Infinity;
          const k = r.u.once ? 1 : buy === 'max' ? Math.max(1, can) : Math.min(buy, room);
          setText(r.lv, r.u.max === 1 ? '' : r.u.gen ? t('c.owned', { v: lv }) : t('c.lv', { v: lv }));
          setText(r.desc, upDesc(id, r.u, r.u.val ? r.u.val(st, ctx) : ''));
          setText(r.cost, maxed ? t('c.maxed') : `${fmt(gameCost(g, st, r.u, k))}${k > 1 ? `（×${k}）` : ''}`);
          r.btn.disabled = maxed || can < 1;
          r.btn.classList.toggle('maxed', maxed);
        }
        onceHead.hidden = !onceRows.length || onceOpen + onceBought === 0;
        onceDone.hidden = onceHead.hidden;
        setText(onceDone, t('c.onceDone', { v: onceBought, n: onceRows.length }));
        const gain = prestigeGain(g, st);
        ppBox.hidden = st.prestiges === 0 && st.life.lt(1);
        setText(ppHave, t('pp.have', { n: ppName, v: fmt(st.ppGot), m: fmtMult(ppMult(st, perOf(st))) }));
        setText(ppGain, gain.gte(1) ? t('pp.gain', { n: ppName, v: fmt(gain) }) : t(`${id}.pp.hint`));
        ppBtn.disabled = gain.lt(1);
        const slots = copySlots(save);
        cpBox.hidden = slots < 1;
        if (slots > 0) {
          const state = copyState(save, id);
          // 枠の数や複製の数が変わったら、並びを作り直す
          const sig = `${slots}/${st.copies.length}`;
          if (sig !== cpSig) {
            const grew = cpSig && st.copies.length > Number(cpSig.split('/')[1]);
            cpSig = sig;
            cpEls = Array.from({ length: slots }, (_, i) => {
              const rate = h('b');
              const filled = i < st.copies.length;
              const el = filled
                ? h('div', { class: `cslot copy${grew && i === st.copies.length - 1 ? ' fresh' : ''}` }, h('span', { class: 'gicon', html: gameIcon(id) }), h('small', null, t('copy.slot', { v: i + 1 })), rate)
                : h('div', { class: 'cslot empty' }, t('copy.empty'));
              return { el, rate, filled };
            });
            cpSlots.replaceChildren(...cpEls.map((x) => x.el));
          }
          const mult = getMult(save, id);
          const own = GAMES[id].rate(st, { mult });
          let weakest = -1;
          st.copies.forEach((c, i) => { if (weakest < 0 || c.lt(st.copies[weakest])) weakest = i; });
          cpEls.forEach((x, i) => {
            if (!x.filled) return;
            setText(x.rate, t('c.perSec', { v: fmt(st.copies[i].mul(mult), 1) }));
            // 枠が埋まっているとき、次に入れ替わるのはいちばん弱い複製
            x.el.classList.toggle('weak', st.copies.length >= slots && i === weakest);
          });
          setText(cpSrcRate, t('c.perSec', { v: fmt(own, 1) }));
          setText(cpTotal, t('copy.total', { a: fmt(own, 1), b: fmt(copyRate(save, id), 1), c: fmt(own.add(copyRate(save, id)), 1) }));
          setText(cpPreview, state === 'ok' || state === 'cost' ? t('copy.preview', { v: fmt(st.avg.mul(mult), 1) }) : '');
          setText(cpCost, state === 'rule' ? t('copy.rule') : state === 'idle' ? t('copy.idle') : state === 'weaker' ? t('copy.weaker') : `${t('lab.cost')}: ${fmt(copyCost(save, id))} ${t(`res.${id}`)}`);
          setText(cpBtn, st.copies.length >= slots ? t('copy.replace') : t('copy.btn'));
          cpBtn.disabled = state !== 'ok';
        }
        gv.update();
      } else if (tab === 'tree') {
        setText(treePts, t('tree.points', { n: ppName, v: fmt(st.pp) }));
        for (const r of treeRows) {
          const lv = treeLvl(st, r.node.id);
          const state = treeState(st, r.node);
          setText(r.lv, `${lv} / ${r.node.max || 1}`);
          setText(r.cost, state === 'max' ? t('c.maxed') : `${fmt(treeCost(r.node, lv))} ${ppName}`);
          r.need.hidden = state !== 'locked';
          if (state === 'locked') {
            setText(r.need, t('tree.need', { v: Object.entries(r.node.req).map(([k, n]) => `${t(`${id}.tree.${k}.n`)} ${n}`).join('、') }));
          }
          r.btn.disabled = state !== 'ok';
          r.btn.classList.toggle('maxed', state === 'max');
          r.btn.classList.toggle('locked', state === 'locked');
        }
      } else {
        setText(achHead, t('ach.count', { v: achCount(st), n: g.achievements.length, m: fmtMult(1 + ACH_BONUS * achCount(st)) }));
        for (const r of achRows) r.el.classList.toggle('done', !!st.ach[r.a.id]);
      }
    }
    return { update, frame: (dt) => { if (tab === 'play') gv.frame?.(dt); }, destroy: gv.destroy };
  }

  // ---- 実験室 ----
  function renderLab() {
    let sel = [];
    const rp = h('div', { class: 'amount' });
    const chips = h('div', { class: 'row wrap' });
    const info = h('div', { class: 'box' });
    const research = h('div', { class: 'shop' });
    const logEl = h('div', { class: 'box' });
    panel.append(
      h('div', { class: 'ghead' }, h('span', { class: 'gicon big', html: imgOr('cut') }), h('div', null, h('h1', null, t('nav.lab'))), h('div', { class: 'grow' }), h('div', { class: 'right' }, rp)),
      h('div', { class: 'gbody' }, h('div', { class: 'play col' }, chips, info, logEl), research));

    const bases = () => BASES.filter((g) => save.games[g.id]);
    let chipSig = '';
    let chipEls = [];
    const buildChips = () => {
      chipEls = bases().map((g) => {
        const el = h('button', { class: 'chip', onclick: () => {
          sel = sel.includes(g.id) ? sel.filter((x) => x !== g.id) : [...sel, g.id].slice(-2);
          buildInfo();
          update();
        } }, h('span', { class: 'gicon', html: icon(g) }), gname(g.id));
        return { id: g.id, el };
      });
      chips.replaceChildren(...chipEls.map((c) => c.el));
    };

    let infoUpdate = () => {};
    function buildInfo() {
      infoUpdate = () => {};
      // 実験台：左右に選んだゲーム、右に結果（まだ知らなければ「？」）
      const slot = (id) => h('span', { class: id ? 'slot' : 'slot empty', html: id ? gameIcon(id) : '' });
      const bench = (result, cls) => h('div', { class: 'bench' }, slot(sel[0]), h('b', null, '×'), slot(sel[1]), h('b', null, '→'), h('span', { class: `slot result ${cls}`, html: result }));
      if (sel.length < 2) {
        info.replaceChildren(bench(plainIcon('unknown'), 'empty'), h('div', { class: 'sub center' }, t('lab.pick')));
        return;
      }
      const [a, b] = sel;
      const key = pairKey(a, b);
      const n = save.lab.pairs[key] || 0;
      const child = RECIPES[key];
      let known;
      // 実験済みでも融合ゲームがまだ生まれていない組み合わせ（あとから特別レシピになったもの）は、未知として扱う
      const locked = lab.starLock(save, a, b);
      if (locked) known = t('lab.starLock', { v: locked });
      else if (!n || (child && !save.games[child])) known = save.lab.hints[key] ? t(child ? 'lab.hint.recipe' : 'lab.hint.link') : t('lab.unknown');
      else if (child) known = t('lab.known.born', { g: gname(child), v: fmtMult(save.games[child].boost) });
      else known = t('lab.known.link', { n, v: fmtMult(linkMult(n)) });
      const costEl = h('div');
      const run = h('button', { class: 'btn primary', onclick: () => doExperiment(a, b) }, t('lab.run'));
      const hint = !n && !save.lab.hints[key]
        ? h('button', { class: 'btn', onclick: () => { if (lab.buyHint(save, a, b)) { buildInfo(); update(); } } }, t('lab.buyHint', { v: lab.hintCost() }))
        : null;
      const born = n && child && save.games[child];
      const result = born ? gameIcon(child) : n && !child ? `<span class="linkmark">${fmtMult(linkMult(n))}</span>` : plainIcon('unknown');
      info.replaceChildren(bench(result, born ? 'born' : n && !child ? 'link' : 'unknown'),
        h('div', { class: 'center' }, known), h('div', { class: 'sub center' }, costEl), h('div', { class: 'row center' }, run, hint));
      infoUpdate = () => {
        const c = lab.expCost(save, a, b);
        setText(costEl, save.meta.rules.nolab ? t('lab.rule') : `${t('lab.cost')}: ${[a, b].map((id) => `${fmt(c[id])} ${t(`res.${id}`)}`).join(' ＋ ')}`);
        run.disabled = !lab.canExperiment(save, a, b);
        if (hint) hint.disabled = save.lab.rp < lab.hintCost();
      };
    }

    function doExperiment(a, b) {
      const r = lab.experiment(save, a, b);
      if (!r) return;
      const rpLine = h('p', { class: 'sub' }, t('lab.res.rp', { v: r.rp }));
      const shine = h('div', { class: 'shine', html: imgOr('shine', '✨') });
      if (r.type === 'born') {
        se('born');
        burst();
        buildSide();
        modal(t('lab.res.born.t'), [shine, h('p', null, t('lab.res.born.b', { a: gname(a), b: gname(b), g: gname(r.game), v: fmtMult(save.games[r.game].boost) })), rpLine],
          [{ label: t('c.close') }, { label: t('lab.go'), primary: true, fn: () => select(r.game) }]);
      } else if (r.type === 'boost') {
        modal(t('lab.res.boost.t'), [h('p', null, t('lab.res.boost.b', { g: gname(r.game), v: fmtMult(save.games[r.game].boost) })), rpLine], [{ label: t('c.ok'), primary: true }]);
      } else {
        modal(t('lab.res.link.t'), [r.n === 1 ? shine : null, r.n === 1 ? h('p', null, t(`lab.flavor.${r.key}`)) : null,
          h('p', null, t('lab.res.link.b', { a: gname(a), b: gname(b), v: fmtMult(linkMult(r.n)) })), rpLine], [{ label: t('c.ok'), primary: true }]);
      }
      buildInfo();
      buildLog();
      update();
    }

    const rrows = lab.RESEARCH.map((r) => {
      const lv = h('span', { class: 'lv' });
      const cost = h('span', { class: 'cost' });
      const btn = h('button', { class: 'up', onclick: () => { if (lab.buyResearch(save, r)) { se('buy'); bought(btn); update(); } } },
        h('span', { class: 'uptop' }, h('b', null, t(`r.${r.id}.n`)), lv), h('small', null, t(`r.${r.id}.d`)), cost);
      return { r, btn, lv, cost };
    });
    research.append(h('h3', null, t('lab.research')), ...rrows.map((x) => x.btn));

    function buildLog() {
      const names = (key) => key.split('+').map(gname).join(' × ');
      logEl.replaceChildren(h('h3', null, t('lab.log')), ...save.lab.log.map((e) => h('div', { class: 'sub' }, t(`lab.log.${e.type}`, { p: names(e.key), n: e.n }))));
      logEl.hidden = !save.lab.log.length;
    }

    function update() {
      const sig = bases().map((g) => g.id).join();
      if (sig !== chipSig) {
        chipSig = sig;
        buildChips();
      }
      for (const c of chipEls) c.el.classList.toggle('on', sel.includes(c.id));
      setText(rp, t('lab.rp', { v: save.lab.rp }));
      infoUpdate();
      for (const x of rrows) {
        const lv = save.lab.research[x.r.id] || 0;
        const maxed = lv >= x.r.max;
        setText(x.lv, t('c.lv', { v: lv }));
        setText(x.cost, maxed ? t('c.maxed') : t('lab.rp', { v: lab.researchCost(save, x.r) }));
        x.btn.disabled = maxed || save.lab.rp < lab.researchCost(save, x.r);
      }
    }
    buildInfo();
    buildLog();
    return { update };
  }

  // ---- 本部（上位階層） ----
  function renderMeta() {
    const coins = h('div', { class: 'amount' });
    const lines = h('div', { class: 'digits' });
    const total = h('div');
    const gainEl = h('div', { class: 'sub' });
    const roadTxt = h('div', { class: 'sub' });
    const roadBar = h('div', { class: 'bar wide' }, h('i'));
    const road = h('div', { class: 'road' }, roadTxt, roadBar);
    const btn = h('button', { class: 'btn primary', onclick: () => {
      const gain = meta.coinGain(save);
      if (gain.lt(1)) return;
      modal(t('meta.reset'), t('meta.confirm', { v: fmt(gain) }), [
        { label: t('c.cancel') },
        { label: t('meta.reset'), primary: true, fn: () => {
          if (!meta.grandReset(save)) return;
          se('grand');
          ceremony({ kind: 'grand', title: t('meta.reset'), big: `+${fmt(gain)}`, sub: t('res.meta'), icons: ORDER.filter((x) => save.games[x.id]).map((x) => gameIcon(x.id)) });
          update();
        } },
      ]);
    } }, t('meta.reset'));
    const rows = meta.META_UP.map((u) => {
      const lv = h('span', { class: 'lv' });
      const cost = h('span', { class: 'cost' });
      const b = h('button', { class: 'up', onclick: () => { if (meta.buyMeta(save, u)) { se('buy'); bought(b); update(); } } },
        h('span', { class: 'uptop' }, h('b', null, t(`meta.up.${u.id}.n`)), lv), h('small', null, t(`meta.up.${u.id}.d`)), cost);
      return { u, b, lv, cost };
    });
    const autoRow = h('div', { class: 'row wrap' });
    const autoHead = h('h3');
    const autoBox = h('div', { class: 'box' }, autoHead, autoRow);
    let autoSig = '';
    let autoEls = [];
    // 一括管理：全ゲームへまとめて指示を出す
    const bulk = (key, fn) => h('button', { class: 'btn', onclick: () => {
      toast(t(`meta.bulk.${key}.done`, { v: fn(save) }), 'coin');
      update();
    } }, t(`meta.bulk.${key}`));
    const bulkCopyBtn = bulk('copy', bulkCopy);
    const bulkBox = h('div', { class: 'box' }, h('h3', null, t('meta.bulk')),
      h('div', { class: 'row wrap' }, bulk('buy', bulkBuy), bulk('prestige', bulkPrestige), bulkCopyBtn));
    // ルール変更：次の周に掛ける縛りを選ぶ
    const ruleNow = h('div');
    const ruleNext = h('div');
    const ruleChips = meta.RULES.map((r) => ({ r, el: h('button', { class: 'rule', onclick: () => {
      save.meta.rulesNext[r.id] = !save.meta.rulesNext[r.id];
      update();
    } }, h('b', null, `${t(`rule.${r.id}.n`)} ${fmtMult(r.bonus)}`), h('small', null, t(`rule.${r.id}.d`))) }));
    const ruleBox = h('div', { class: 'box' }, h('h3', null, t('meta.rules')), ruleNow,
      h('div', { class: 'rules' }, ruleChips.map((x) => x.el)), ruleNext);
    // 新世界（第 4 段階）：本部ごとたたんで、星を得る
    const figure = (key) => {
      const b = h('b');
      return { b, el: h('div', null, b, h('small', null, t(key))) };
    };
    const starsEl = figure('world.s.stars');
    const wTotal = figure('world.s.total');
    const wCoins = figure('world.s.coins');
    const wTrait = figure('world.s.trait');
    const wGain = h('div', { class: 'sub' });
    const wBtn = h('button', { class: 'btn primary', onclick: () => {
      const gain = meta.starGain(save);
      if (gain.lt(1)) return;
      let pick = 'plain';
      const traitEls = meta.TRAITS.map((tr) => {
        const open = meta.traitOpen(save, tr);
        const el = h('button', { class: 'rule', disabled: !open, onclick: () => {
          pick = tr.id;
          for (const x of traitEls) x.el.classList.toggle('on', x.tr.id === pick);
        } }, h('b', null, t(`world.trait.${tr.id}.n`)), h('small', null, open ? t(`world.trait.${tr.id}.d`) : t('world.trait.locked', { v: tr.stars })));
        return { tr, el };
      });
      traitEls[0].el.classList.add('on');
      modal(t('world.title'), [h('p', null, t('world.confirm', { v: fmt(gain) })), h('h3', null, t('world.trait')), h('div', { class: 'rules' }, traitEls.map((x) => x.el))], [
        { label: t('c.cancel') },
        { label: t('world.go'), primary: true, fn: () => {
          if (!meta.worldReset(save, pick)) return;
          se('grand');
          ceremony({ kind: 'world', title: t('world.title'), big: t('world.gain', { v: fmt(gain) }), sub: t(`world.trait.${pick}.n`) });
          update();
        } },
      ]);
    } }, t('world.go'));
    const jobs = meta.AUTOMATIONS.map((id) => ({ id, el: h('button', { class: 'chip', onclick: () => {
      meta.toggleAutomation(save, id);
      update();
    } }, t(`world.up.${id}.n`)) }));
    const jobsRow = h('div', { class: 'row wrap' }, h('span', { class: 'sub' }, t('world.jobs')), jobs.map((x) => x.el));
    const worldBox = h('div', { class: 'box' }, h('h3', null, h('span', { class: 'ticon', html: imgOr('star') }), t('world.title')), h('div', { class: 'stat' }, starsEl.el, wTotal.el, wCoins.el, wTrait.el), wGain, wBtn, jobsRow);
    const wRows = meta.WORLD_UP.map((u) => {
      const lv = h('span', { class: 'lv' });
      const cost = h('span', { class: 'cost' });
      const b = h('button', { class: 'up', onclick: () => { if (meta.buyWorld(save, u)) { se('buy'); bought(b); update(); } } },
        h('span', { class: 'uptop' }, h('b', null, t(`world.up.${u.id}.n`)), lv), h('small', null, t(`world.up.${u.id}.d`)), cost);
      return { u, b, lv, cost };
    });
    const wShop = h('div', { class: 'wshop' }, h('h3', null, t('world.upgrades')), ...wRows.map((r) => r.b));
    const ruleNames = (rules) => meta.RULES.filter((r) => rules[r.id]).map((r) => t(`rule.${r.id}.n`)).join('、') || t('meta.rules.none');
    panel.append(
      h('div', { class: 'ghead' }, h('span', { class: 'gicon big', html: imgOr('coin', '🏛️') }), h('div', null, h('h1', null, t('nav.meta')), h('div', { class: 'sub' }, t('res.meta'))), h('div', { class: 'grow' }), h('div', { class: 'right' }, coins)),
      h('div', { class: 'gbody' },
        h('div', { class: 'play col' }, h('div', { class: 'box' }, h('h3', null, t('meta.reset')), lines, total, gainEl, btn, road), worldBox, ruleBox, bulkBox, autoBox),
        h('div', { class: 'shop' }, h('h3', null, t('meta.upgrades')), ...rows.map((r) => r.b), wShop)));

    function update() {
      setText(coins, fmt(save.meta.coins));
      const owned = ORDER.filter((g) => save.games[g.id]);
      // ゲームごとの成長度は、アイコンと数字で並べる
      const digitSig = owned.map((g) => g.id).join();
      if (digitSig !== lines.dataset.sig) {
        lines.dataset.sig = digitSig;
        lines.replaceChildren(...owned.map((g) => h('span', { class: 'digit', title: gname(g.id) }, h('i', { html: icon(g) }), h('b'))));
      }
      owned.forEach((g, i) => setText(lines.children[i].lastChild, meta.digits(save.games[g.id]).toFixed(1)));
      setText(total, t('meta.total', { v: meta.score(save).toFixed(1) }));
      const gain = meta.coinGain(save);
      setText(gainEl, gain.gte(1) ? t('meta.gain', { v: fmt(gain) }) : t('meta.need', { v: meta.firstAt() }));
      btn.disabled = gain.lt(1);
      for (const r of rows) {
        const lv = meta.metaLvl(save, r.u.id);
        const maxed = r.u.max != null && lv >= r.u.max;
        setText(r.lv, r.u.max === 1 ? '' : t('c.lv', { v: lv }));
        setText(r.cost, maxed ? t('c.maxed') : fmt(meta.metaCost(save, r.u)));
        r.cost.classList.toggle('coin', !maxed);
        r.b.disabled = maxed || save.meta.coins.lt(meta.metaCost(save, r.u));
        r.b.classList.toggle('maxed', maxed);
      }
      const wOpen = meta.worldUnlocked(save);
      // 新世界が開くまでは、あとどれだけコインを稼げばよいかを見せる（総転生を何度かしたあとから）
      road.hidden = wOpen || save.meta.resets < 3;
      if (!road.hidden) {
        setText(roadTxt, t('world.road', { v: fmt(save.meta.got), n: fmt(meta.worldOpenAt()) }));
        roadBar.firstChild.style.width = `${Math.min(100, save.meta.got.div(meta.worldOpenAt()).toNumber() * 100)}%`;
      }
      worldBox.hidden = !wOpen;
      wShop.hidden = !wOpen;
      if (wOpen) {
        const stars = meta.starGain(save);
        setText(starsEl.b, fmt(save.world.stars));
        setText(wTotal.b, fmt(save.world.got));
        setText(wCoins.b, fmt(save.meta.got));
        setText(wTrait.b, t(`world.trait.${meta.trait(save).id}.n`));
        jobsRow.hidden = !jobs.some((x) => meta.worldLvl(save, x.id) > 0);
        for (const x of jobs) {
          x.el.hidden = meta.worldLvl(save, x.id) < 1;
          x.el.classList.toggle('on', meta.autoOn(save, x.id));
        }
        setText(wGain, stars.gte(1) ? t('world.gain', { v: fmt(stars) }) : t('world.need', { v: fmt(meta.worldOpenAt()) }));
        wBtn.disabled = stars.lt(1);
        for (const r of wRows) {
          const lv = meta.worldLvl(save, r.u.id);
          const maxed = r.u.max != null && lv >= r.u.max;
          setText(r.lv, r.u.max === 1 ? '' : t('c.lv', { v: lv }));
          setText(r.cost, maxed ? t('c.maxed') : fmt(meta.worldCost(save, r.u)));
          r.cost.classList.toggle('star', !maxed);
          r.b.disabled = maxed || save.world.stars.lt(meta.worldCost(save, r.u));
          r.b.classList.toggle('maxed', maxed);
        }
      }
      autoBox.hidden = !save.meta.up.auto;
      ruleBox.hidden = !save.meta.up.rules;
      setText(ruleNow, t('meta.rules.now', { v: ruleNames(save.meta.rules), m: fmtMult(meta.ruleBonus(save.meta.rules)) }));
      setText(ruleNext, t('meta.rules.next', { v: ruleNames(save.meta.rulesNext), m: fmtMult(meta.ruleBonus(save.meta.rulesNext)) }));
      for (const x of ruleChips) x.el.classList.toggle('on', !!save.meta.rulesNext[x.r.id]);
      bulkBox.hidden = save.meta.resets < 1;
      bulkCopyBtn.hidden = copySlots(save) < 1;
      const sig = owned.map((g) => g.id).join();
      if (sig !== autoSig) {
        autoSig = sig;
        autoEls = owned.map((g) => ({ id: g.id, el: h('button', { class: 'chip', onclick: () => {
          toggleAuto(save, g.id);
          update();
        } }, h('span', { class: 'gicon', html: icon(g) }), gname(g.id)) }));
        autoRow.replaceChildren(...autoEls.map((x) => x.el));
      }
      const autoOn = autoGames(save).map((g) => g.id);
      setText(autoHead, t('meta.auto', { v: autoOn.length, n: autoSlots(save) }));
      for (const x of autoEls) x.el.classList.toggle('on', autoOn.includes(x.id));
    }
    return { update };
  }

  // ---- 設定 ----
  function renderSettings() {
    const play = h('div', { class: 'sub' });
    const langRow = h('div', { class: 'row' }, LANGS.map((l) => h('button', { class: `mini${getLang() === l ? ' on' : ''}`, onclick: () => {
      save.lang = l;
      store(save);
      location.reload();
    } }, l === 'ja' ? '日本語' : 'English')));
    const slider = (key) => h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: save.settings[key], oninput: (ev) => {
      save.settings[key] = Number(ev.target.value);
      setVolume({ [key]: save.settings[key] });
    } });
    const doExport = () => {
      const ta = h('textarea', { readonly: true, rows: 6 });
      ta.value = exportString(save);
      modal(t('set.export'), [ta], [{ label: t('c.close'), primary: true }]);
      ta.select();
    };
    const doImport = () => {
      const ta = h('textarea', { rows: 6 });
      modal(t('set.import'), [h('p', { class: 'sub' }, t('set.importHelp')), ta], [{ label: t('c.cancel') }, { label: t('set.import'), primary: true, fn: () => {
        try {
          const next = importString(ta.value);
          app.stopSaving();
          store(next);
          location.reload();
        } catch {
          toast(t('set.importBad'));
        }
      } }]);
    };
    const doReset = () => modal(t('set.reset'), t('set.resetConfirm'), [{ label: t('c.cancel') }, { label: t('set.reset'), primary: true, fn: () => {
      app.stopSaving();
      wipe();
      location.reload();
    } }]);
    panel.append(...[
      h('div', { class: 'ghead' }, h('span', { class: 'gicon big', html: plainIcon('settings') }), h('div', null, h('h1', null, t('nav.settings')))),
      h('div', { class: 'box' }, h('h3', null, t('set.lang')), langRow),
      ASSETS.bgm.main ? h('div', { class: 'box' }, h('h3', null, t('set.bgm')), slider('bgm')) : null,
      Object.values(ASSETS.se).some(Boolean) ? h('div', { class: 'box' }, h('h3', null, t('set.se')), slider('se')) : null,
      h('div', { class: 'box' }, h('h3', null, t('set.save')),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: doExport }, t('set.export')), h('button', { class: 'btn', onclick: doImport }, t('set.import')), h('button', { class: 'btn danger', onclick: doReset }, t('set.reset'))),
        play),
      h('div', { class: 'box' }, h('h3', null, t('end.list')), h('div', { class: 'achgrid' }, MILESTONES.map((m) => h('div', { class: save.milestones[m.id] ? 'ach done' : 'ach' },
        h('span', { class: 'ticon', html: imgOr('badge') }), save.milestones[m.id] ? `${t(`end.${m.id}.n`)}（${fmtTime(save.milestones[m.id])}）` : t(`end.${m.id}.hint`)))),
        save.milestones.ending ? h('button', { class: 'btn', onclick: playEnding }, t('ending.again')) : null),
    ].filter(Boolean));
    return { update: () => setText(play, t('set.play', { t: fmtTime(save.stats.play) })) };
  }

  // ---- 節目（区切りのエンディング） ----
  // エンディング：全画面で、ここまでの歩みを見せる。設定の「実績」から、もう一度見られる
  function playEnding() {
    const games = ORDER.filter((x) => save.games[x.id]);
    const line = (k, v) => h('div', { class: 'cer-line' }, h('span', null, t(`ending.${k}`)), h('b', null, v));
    return ceremony({ kind: 'ending', title: t('ending.title'), big: t('ending.lead'), sub: t('ending.body'), icons: games.map((x) => gameIcon(x.id)), button: t('ending.cont'),
      body: [h('div', { class: 'cer-stats' }, line('play', fmtTime(save.stats.play)), line('games', String(games.length)), line('worlds', fmt(save.world.resets)),
        line('stars', fmt(save.world.got)), line('ach', String(games.reduce((a, x) => a + achCount(save.games[x.id]), 0)))),
      h('div', { class: 'cer-credits' }, t('ending.credits'))] });
  }
  function showEnding(m) {
    if (m.id === 'ending') {
      se('grand');
      playEnding();
      return;
    }
    se('born');
    modal(t('end.title'), [h('div', { class: 'shine', html: imgOr('badge', '🏅') }), h('h3', { class: 'center' }, t(`end.${m.id}.n`)), h('p', null, t(`end.${m.id}.d`)),
      h('p', { class: 'sub' }, t('end.stats', { t: fmtTime(save.stats.play), n: Object.keys(save.games).length }))],
    [{ label: t('end.cont'), primary: true }]);
  }

  // ---- おかえりなさい ----
  function showOffline(res) {
    const lines = res.gains.map((x) => h('div', null, `${gname(x.id)}${t('c.sep')}+${fmt(x.amount)} ${t(`res.${x.id}`)}`));
    const capped = res.used < res.elapsed - 1 ? h('p', { class: 'sub' }, t('offline.capped', { t: fmtTime(offlineCap(save)) })) : null;
    modal(t('offline.title'), [h('p', null, t('offline.body', { t: fmtTime(res.elapsed) })), capped, lines], [{ label: t('c.ok'), primary: true }]);
  }

  let labSeen = save.lab.unlocked;
  let metaSeen = save.meta.unlocked;
  const app = {
    saving: true,
    stopSaving() { app.saving = false; },
    activeGame: () => (GAMES[save.active] ? save.active : null),
    update() {
      if (lab.labUnlocked(save) && !labSeen) {
        labSeen = true;
        toast(t('toast.lab'), 'cut');
      }
      if (meta.metaUnlocked(save) && !metaSeen) {
        metaSeen = true;
        toast(t('toast.meta'), 'coin');
      }
      for (const m of checkMilestones(save)) showEnding(m);
      // 一度にたくさん達成したときは、まとめて 1 つの知らせにする
      for (const id of drainBorn()) {
        buildSide();
        se('born');
        toast(`${t('lab.res.born.t')}${t('c.sep')}${gname(id)}`, 'shine');
      }
      const news = drainAch();
      if (news.length > 3) toast(t('ach.many', { v: news.length }), 'badge');
      else for (const n of news) toast(`${t('ach.toast')}${t('c.sep')}${gname(n.game)} ― ${achName(n.game, n.ach)}`, 'badge');
      guideUpdate();
      sideUpdate();
      view?.update();
    },
    // ゲームの増減など、画面の構成が変わったあとに呼ぶ
    rebuild() {
      buildSide();
      select(save.active);
    },
    frame(dt) { view?.frame?.(dt); },
    showOffline,
    toast,
  };

  buildSide();
  buildGuide();
  select(save.active);
  return app;
}

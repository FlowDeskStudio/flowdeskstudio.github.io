// ゲームのアイコン。どれもポポーの形の宝石の中に、白い絵柄をひとつ入れる。
// 融合ゲームは、親 2 本の色で半分ずつ塗り分ける（何と何から生まれたかが色で分かる）。
import { ASSETS } from '../core/assets.js';

const RIM = '#e3c16f';

// ゲームごとの色（紺の地に映える、宝石のような色）
const COLOR = {
  clicker: '#5fb37a',
  mining: '#7f8bb8',
  breakout: '#3f8fe8',
  factory: '#6a63e0',
  farm: '#86c04e',
  maze: '#d99a3e',
  cell: '#2fbfae',
  drop: '#e8704f',
  smeltery: null, // 融合ゲームは親の色から作る
  blast: null,
  depot: null,
  breed: null,
  juggle: null,
  brewery: null,
  market: null,
  tower: null,
  neutral: '#5a67a0',
};

const W = 'fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="#ffffff"';

// 白い絵柄（64×64 の中央あたりに置く）
const GLYPH = {
  mining: `<path ${W} d="M24 46 41 29"/><path ${W} d="M30 23c8-2 15 3 17 11"/>`,
  breakout: `<rect ${F} x="19" y="26" width="11" height="6.5" rx="2"/><rect ${F} x="33" y="26" width="11" height="6.5" rx="2"/><rect ${F} x="26" y="35.5" width="11" height="6.5" rx="2"/><circle ${F} cx="34" cy="47" r="2.8"/>`,
  factory: `<path ${F} d="M19 46V33l8 4.5V33l8 4.5V26h9v20z"/>`,
  farm: `<path ${W} d="M32 47V35"/><path ${F} d="M32 37c-7 1-11-4-11-9 7-1 11 3 11 9zM32 35c0-6 4-10 11-9 0 5-4 10-11 9z"/>`,
  maze: `<path ${W} d="M21 26h22v20H27V32h10v8h-5"/>`,
  cell: `<circle ${F} cx="27" cy="32" r="6"/><circle ${F} cx="39" cy="35" r="4.6"/><circle ${F} cx="31" cy="43.5" r="3.8"/>`,
  drop: `<circle ${F} cx="32" cy="26" r="4"/><circle ${F} cx="26" cy="36" r="2.3"/><circle ${F} cx="38" cy="36" r="2.3"/><circle ${F} cx="20" cy="45" r="2.3"/><circle ${F} cx="32" cy="45" r="2.3"/><circle ${F} cx="44" cy="45" r="2.3"/>`,
  smeltery: `<path ${F} d="M32 22c7 7 11 12 8 20-2 6-13 7-16 1-3-6 2-9 3-14 3 3 5 1 5-7z"/>`,
  blast: `<path ${W} d="M32 22v6M32 42v6M19 35h6M39 35h6M23 26l4 4M37 40l4 4M41 26l-4 4M27 40l-4 4"/><circle ${F} cx="32" cy="35" r="3.4"/>`,
  depot: `<rect ${F} x="18" y="28" width="16" height="12" rx="2"/><path ${F} d="M35 31.5h6l4 5V40h-10z"/><circle ${F} cx="24" cy="43.5" r="3"/><circle ${F} cx="40" cy="43.5" r="3"/>`,
  breed: `<path ${W} d="M24 25l8 11 8-11M32 36v11"/><circle ${F} cx="24" cy="25" r="3.2"/><circle ${F} cx="40" cy="25" r="3.2"/>`,
  brewery: `<ellipse ${W} cx="32" cy="36" rx="12" ry="10"/><path ${W} d="M22 31h20M22 41h20"/>`,
  market: `<path ${W} d="M18 42c5-14 9-14 14 0s9 0 14-12"/><circle ${F} cx="46" cy="30" r="3.4"/>`,
  tower: `<path ${W} d="M25 47V30h14v17M22 30h20M28 30v-7h8v7"/><path ${W} d="M32 47v-7"/>`,
  juggle: `<path ${W} stroke-dasharray="1 5.5" d="M21 42c2-18 20-18 22 0"/><circle ${F} cx="21" cy="41" r="3.6"/><circle ${F} cx="32" cy="27" r="3.6"/><circle ${F} cx="43" cy="41" r="3.6"/>`,
  settings: `<circle ${W} cx="32" cy="35" r="5"/><path ${W} d="M32 23v4M32 43v4M20 35h4M40 35h4M23.5 26.5l3 3M37.5 40.5l3 3M40.5 26.5l-3 3M26.5 40.5l-3 3"/>`,
  unknown: `<path ${W} d="M27 29c0-7 11-7 11 0 0 4-5 4-6 8"/><circle ${F} cx="32" cy="45" r="2.2"/>`,
  // ゲームの中で使う小さな絵柄（工程、路線、作物）
  box: `<path ${W} d="M21 30h22v15H21zM21 36h22M32 30v6"/>`,
  gear: `<circle ${W} cx="32" cy="36" r="5"/><path ${W} d="M32 24v4M32 44v4M20 36h4M40 36h4M23.5 27.5l3 3M37.5 41.5l3 3M40.5 27.5l-3 3M26.5 41.5l-3 3"/>`,
  wrench: `<path ${W} d="M23 47 36 34"/><path ${W} d="M35 26a6.5 6.5 0 1 0 7 7l-5 1-3-3z"/>`,
  house: `<path ${F} d="M19 37 32 25l13 12v9H19z"/>`,
  city: `<rect ${F} x="19" y="31" width="10" height="15" rx="1.5"/><rect ${F} x="31" y="24" width="14" height="22" rx="1.5"/>`,
  mountain: `<path ${F} d="M16 46 27 27l6 9 4-5 11 15z"/>`,
  ship: `<path ${F} d="M18 39h28l-5 8H23z"/><path ${W} d="M32 36V25l8 8"/>`,
  plane: `<path ${F} d="M17 35 47 25 37 47l-5-10z"/>`,
  leaf: `<path ${F} d="M22 46c-3-12 6-21 21-21 1 14-8 23-21 21z"/>`,
  mushroom: `<path ${F} d="M18 36c0-15 28-15 28 0z"/><rect ${F} x="28" y="35" width="8" height="12" rx="3.5"/>`,
  carrot: `<path ${F} d="M25 31 40 35 26 48z"/><path ${W} d="M33 31l3-6M37 33l6-3"/>`,
  berry: `<path ${F} d="M32 48c-9-4-12-11-10-18h20c2 7-1 14-10 18z"/><path ${W} d="M26 27l6 3 6-3"/>`,
};

// 融合ゲームの親（色の塗り分けに使う。registry を読むと循環するので、ここに持つ）
const PARENTS = {
  smeltery: ['clicker', 'mining'],
  blast: ['mining', 'breakout'],
  depot: ['factory', 'maze'],
  breed: ['farm', 'cell'],
  juggle: ['clicker', 'drop'],
  brewery: ['farm', 'factory'],
  market: ['factory', 'drop'],
  tower: ['breakout', 'maze'],
};

let uid = 0;

// 明るい面から暗い面へ。同じ色でも、光が当たっているように見せる
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
};

function blob(fill, glyph, defs = '') {
  const id = `ic${uid++}`;
  const paint = fill.startsWith('url') ? fill : `url(#${id})`;
  const own = fill.startsWith('url') ? '' : `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(fill, 0.28)}"/><stop offset="1" stop-color="${shade(fill, -0.38)}"/></linearGradient>`;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${own}${defs}</defs>
<path d="M17 23c-6-2-9-7-8-12 6 0 10 3 11 9" fill="${RIM}"/>
<ellipse cx="33" cy="36" rx="25.5" ry="21" transform="rotate(-14 33 36)" fill="${paint}" stroke="${RIM}" stroke-opacity=".75" stroke-width="1.6"/>
<path d="M17 30c4-8 13-12 22-12" fill="none" stroke="#ffffff" stroke-opacity=".42" stroke-width="2.4" stroke-linecap="round"/>
${glyph}</svg>`;
}

export function gameColor(id) {
  return COLOR[id] || COLOR.neutral;
}

// ゲームのアイコン（HTML 文字列）
export function gameIcon(id) {
  if (id === 'clicker' && ASSETS.img.pawpaw) return `<img src="${ASSETS.img.pawpaw}" alt="" draggable="false">`;
  const pair = PARENTS[id];
  if (!pair) return blob(gameColor(id), GLYPH[id] || '');
  const gid = `fz${uid++}`;
  const [a, b] = pair.map(gameColor);
  // 親 2 本の色を、斜めに半分ずつ
  const grad = `<linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0" stop-color="${shade(a, 0.25)}"/><stop offset="50%" stop-color="${a}"/><stop offset="50%" stop-color="${b}"/><stop offset="1" stop-color="${shade(b, -0.35)}"/></linearGradient>`;
  return blob(`url(#${gid})`, GLYPH[id] || '', grad);
}

// 設定や「？」など、ゲーム以外の絵柄
export const plainIcon = (name) => blob(COLOR.neutral, GLYPH[name] || '');

// ゲームの中で使う小さなアイコン（色は呼ぶ側が決める）
export const miniIcon = (name, color) => blob(color, GLYPH[name] || '');

// 畑の芽（育ち具合で 2 段階）
export const sprout = (big) => `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M20 ${big ? 34 : 33}V${big ? 16 : 22}" fill="none" stroke="#2f7d58" stroke-width="2.4" stroke-linecap="round"/>
<path d="M20 ${big ? 20 : 25}c-${big ? 9 : 6} 1-${big ? 13 : 9}-${big ? 5 : 3}-${big ? 13 : 9}-${big ? 11 : 7} ${big ? 8 : 6}-1 ${big ? 13 : 9} ${big ? 4 : 2} ${big ? 13 : 9} ${big ? 11 : 7}z" fill="#c9eaa0"/>
<path d="M20 ${big ? 18 : 23}c0-${big ? 7 : 5} ${big ? 5 : 3}-${big ? 11 : 7} ${big ? 12 : 8}-${big ? 10 : 6} 0 ${big ? 6 : 4}-${big ? 5 : 3} ${big ? 11 : 7}-${big ? 12 : 8} ${big ? 10 : 6}z" fill="#7cc98f"/>
</svg>`;

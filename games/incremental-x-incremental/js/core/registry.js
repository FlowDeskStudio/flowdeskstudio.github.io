// ゲームの登録簿。並び順が画面の並びと組み合わせキーの順になる（基本ゲーム → 融合ゲーム）。
import clicker from '../games/clicker.js';
import mining from '../games/mining.js';
import breakout from '../games/breakout.js';
import factory from '../games/factory.js';
import farm from '../games/farm.js';
import maze from '../games/maze.js';
import cell from '../games/cell.js';
import drop from '../games/drop.js';
import smeltery from '../games/smeltery.js';
import blast from '../games/blast.js';
import depot from '../games/depot.js';
import breed from '../games/breed.js';
import juggle from '../games/juggle.js';
import brewery from '../games/brewery.js';
import market from '../games/market.js';
import tower from '../games/tower.js';

export const ORDER = [clicker, mining, breakout, factory, farm, maze, cell, drop, smeltery, blast, depot, breed, juggle, brewery, market, tower];
export const GAMES = Object.fromEntries(ORDER.map((g) => [g.id, g]));
export const BASES = ORDER.filter((g) => g.kind === 'base');
export const FUSIONS = ORDER.filter((g) => g.kind === 'fusion');
// 星を集めなくても生まれる、最初の世代の融合ゲーム
export const FUSIONS1 = FUSIONS.filter((g) => !g.stars);

export function pairKey(a, b) {
  const ia = ORDER.indexOf(GAMES[a]);
  const ib = ORDER.indexOf(GAMES[b]);
  return ia < ib ? `${a}+${b}` : `${b}+${a}`;
}

// 特別な組み合わせ → 生まれる融合ゲーム（方向差なしの A 方式）
export const RECIPES = Object.fromEntries(FUSIONS.map((g) => [pairKey(...g.parents), g.id]));

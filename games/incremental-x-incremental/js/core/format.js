import { N } from './num.js';
import { getLang } from './i18n.js';

const EN = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const JA = ['', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載'];

// dec: 100 未満の値に付ける小数桁
export function fmt(x, dec = 0) {
  const n = N(x);
  if (n.m === 0) return '0';
  if (n.m < 0) return '-' + fmt(n.neg(), dec);
  const ja = getLang() === 'ja';
  const g = ja ? 4 : 3;
  const suf = ja ? JA : EN;
  if (n.e < g) {
    const v = n.toNumber();
    if (dec && v < 100) return String(parseFloat(v.toFixed(dec)));
    return Math.floor(v + 1e-9).toLocaleString('en-US');
  }
  const idx = Math.floor(n.e / g);
  if (idx >= suf.length) return `${n.m.toFixed(2)}e${n.e}`;
  const v = n.m * 10 ** (n.e - idx * g);
  return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + suf[idx];
}

export function fmtMult(x) {
  const n = N(x);
  return '×' + (n.e < 3 ? String(parseFloat(n.toNumber().toFixed(2))) : fmt(n));
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ja = getLang() === 'ja';
  if (h) return ja ? `${h}時間${m}分` : `${h}h ${m}m`;
  if (m) return ja ? `${m}分${s}秒` : `${m}m ${s}s`;
  return ja ? `${s}秒` : `${s}s`;
}

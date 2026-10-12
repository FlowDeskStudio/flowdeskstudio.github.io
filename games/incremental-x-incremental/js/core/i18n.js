import ja from '../lang/ja.js';
import en from '../lang/en.js';

const DICT = { ja, en };
export const LANGS = ['ja', 'en'];
let lang = 'ja';

export const getLang = () => lang;

export function setLang(l) {
  if (DICT[l]) lang = l;
}

export function detectLang() {
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.startsWith('ja') ? 'ja' : 'en';
}

// 強化の名前と説明。個別の文言がない強化（自動生成したもの）は、強化自身が文言を作る
export const upName = (gid, u) => (u.name ? u.name(t) : t(`${gid}.up.${u.id}.n`));
export const upDesc = (gid, u, v) => (u.desc ? u.desc(t, v) : t(`${gid}.up.${u.id}.d`, { v }));

export function t(key, vars) {
  let s = DICT[lang][key] ?? DICT.ja[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  // 英語：回数が 1 のとき「1 times」にならないようにする（実績の文など）
  if (lang === 'en' && vars) s = s.replace(/\b1 times\b/, 'once');
  return s;
}

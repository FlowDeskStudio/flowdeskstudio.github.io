// 小さな DOM ヘルパー
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid);
  }
  return el;
}

// 値が変わったときだけ書き換える
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

// クリック位置から浮き上がる数字
export function floatText(parent, ev, text, cls = '') {
  const r = parent.getBoundingClientRect();
  const el = h('span', { class: `float ${cls}` }, text);
  el.style.left = `${ev.clientX - r.left}px`;
  el.style.top = `${ev.clientY - r.top}px`;
  parent.append(el);
  setTimeout(() => el.remove(), 800);
}

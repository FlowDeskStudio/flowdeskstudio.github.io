// 巨大数。仮数 m（1 <= |m| < 10）と指数 e の組で持つ。値は不変で、演算は新しい Num を返す。
export class Num {
  constructor(m, e) {
    this.m = m;
    this.e = e;
  }

  static from(x) {
    if (x instanceof Num) return x;
    if (typeof x === 'string') {
      const s = x[0] === '~' ? x.slice(1) : x;
      const i = s.indexOf('e');
      if (i < 0) return Num.from(Number(s));
      return norm(Number(s.slice(0, i)), Number(s.slice(i + 1)));
    }
    if (!x || !Number.isFinite(x)) return ZERO;
    return norm(x, 0);
  }

  // 10^l
  static pow10(l) {
    if (l === -Infinity || Number.isNaN(l)) return ZERO;
    const e = Math.floor(l);
    return norm(10 ** (l - e), e);
  }

  static pow(base, p) {
    return Num.from(base).pow(p);
  }

  neg() {
    return new Num(-this.m, this.e);
  }

  add(o) {
    o = Num.from(o);
    if (this.m === 0) return o;
    if (o.m === 0) return this;
    const d = this.e - o.e;
    if (d > 17) return this;
    if (d < -17) return o;
    return norm(this.m + o.m * 10 ** -d, this.e);
  }

  sub(o) {
    return this.add(Num.from(o).neg());
  }

  mul(o) {
    o = Num.from(o);
    return norm(this.m * o.m, this.e + o.e);
  }

  div(o) {
    o = Num.from(o);
    if (o.m === 0) return ZERO;
    return norm(this.m / o.m, this.e - o.e);
  }

  // 正の値のみ対象
  pow(p) {
    if (this.m <= 0) return ZERO;
    if (p === 0) return ONE;
    return Num.pow10((Math.log10(this.m) + this.e) * p);
  }

  log10() {
    return this.m <= 0 ? -Infinity : Math.log10(this.m) + this.e;
  }

  cmp(o) {
    o = Num.from(o);
    const sa = Math.sign(this.m);
    const sb = Math.sign(o.m);
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (sa === 0) return 0;
    if (this.e !== o.e) return (this.e > o.e ? 1 : -1) * sa;
    return this.m > o.m ? 1 : this.m < o.m ? -1 : 0;
  }

  gt(o) { return this.cmp(o) > 0; }
  gte(o) { return this.cmp(o) >= 0; }
  lt(o) { return this.cmp(o) < 0; }
  lte(o) { return this.cmp(o) <= 0; }
  max(o) { o = Num.from(o); return this.cmp(o) >= 0 ? this : o; }
  min(o) { o = Num.from(o); return this.cmp(o) <= 0 ? this : o; }

  floor() {
    if (this.e >= 15) return this;
    if (this.e < 0) return this.m > 0 ? ZERO : Num.from(-1);
    return Num.from(Math.floor(this.toNumber() * (1 + 1e-12)));
  }

  toNumber() {
    if (this.e > 308) return this.m > 0 ? Infinity : -Infinity;
    if (this.e < -320) return 0;
    return this.m * 10 ** this.e;
  }

  // セーブ用。先頭の ~ で復元時に見分ける
  toJSON() {
    return `~${this.m}e${this.e}`;
  }
}

function norm(m, e) {
  if (!m || !Number.isFinite(m) || !Number.isFinite(e)) return ZERO;
  const s = Math.floor(Math.log10(Math.abs(m)));
  if (s < -300) return ZERO;
  if (s !== 0) {
    m /= 10 ** s;
    e += s;
  }
  const a = Math.abs(m);
  if (a >= 10) {
    m /= 10;
    e++;
  } else if (a < 1) {
    m *= 10;
    e--;
  }
  return new Num(m, e);
}

export const ZERO = new Num(0, 0);
export const ONE = new Num(1, 0);
export const N = Num.from;

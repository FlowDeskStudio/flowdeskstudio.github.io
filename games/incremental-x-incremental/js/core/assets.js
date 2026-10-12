// 素材の一覧。絵や音を差し替えるときは web/assets/ に置き、ここのパスを書き換える。
// null のものは、絵は絵文字、音は無音で動く。
// ポポーの印は web/assets/img/royal/（ロイヤルブルーと金に合わせて描き起こしたもの）。
const P = 'assets/img/royal/';

export const ASSETS = {
  img: {
    pawpaw: `${P}whole.svg`, // クリッカーの果実、資源アイコン
    mark: `${P}mark.svg`, // タイトルの印
    seed: `${P}seed.svg`, // 転生
    coin: `${P}coin.svg`,
    badge: `${P}badge.svg`, // 目標
    shine: `${P}shine.svg`, // 発見
    cut: `${P}cut.svg`, // 実験室
    star: `${P}star.svg`, // 新世界の星
  },
  bgm: {
    main: 'assets/bgm/deepfield.mp3', // 仮BGM候補
  },
  // 効果音：Kenney の音素材（CC0。assets/se/License.txt）。操作の中身に合った音を、いくつかの中から選んで鳴らす
  se: {
    buy: ['assets/se/buy1.ogg', 'assets/se/buy2.ogg', 'assets/se/buy3.ogg'], // 強化を買う
    select: ['assets/se/select1.ogg', 'assets/se/select2.ogg'], // 切り替える、選ぶ
    prestige: ['assets/se/prestige.ogg'], // 転生
    grand: ['assets/se/grand.ogg'], // 総転生、新世界
    born: ['assets/se/born.ogg'], // 新しいゲームが生まれる、解放、節目
    bonus: ['assets/se/bonus.ogg'], // 金のポポー、カプセル、変異、決め技
    pluck: ['assets/se/pluck1.ogg', 'assets/se/pluck2.ogg', 'assets/se/pluck3.ogg'], // クリッカー：実をもぐ
    pick: ['assets/se/pick1.ogg', 'assets/se/pick2.ogg', 'assets/se/pick3.ogg', 'assets/se/pick4.ogg'], // 採掘：つるはし
    boom: ['assets/se/boom1.ogg', 'assets/se/boom2.ogg', 'assets/se/boom3.ogg'], // 発破、起爆
    brick: ['assets/se/brick1.ogg', 'assets/se/brick2.ogg', 'assets/se/brick3.ogg'], // ブロック崩し：ブロックをたたく
    crank: ['assets/se/crank1.ogg', 'assets/se/crank2.ogg', 'assets/se/crank3.ogg'], // 工場：手回し
    harvest: ['assets/se/harvest1.ogg', 'assets/se/harvest2.ogg', 'assets/se/harvest3.ogg'], // 農業：収穫／品種改良：植える
    water: ['assets/se/water1.ogg', 'assets/se/water2.ogg'], // 農業：水やり
    step: ['assets/se/step1.ogg', 'assets/se/step2.ogg', 'assets/se/step3.ogg'], // 迷路：歩く
    dash: ['assets/se/dash1.ogg', 'assets/se/dash2.ogg'], // 迷路：駆け足
    glass: ['assets/se/glass1.ogg', 'assets/se/glass2.ogg', 'assets/se/glass3.ogg'], // 細胞：採取／醸造所：びん詰め
    peg: ['assets/se/peg1.ogg', 'assets/se/peg2.ogg', 'assets/se/peg3.ogg'], // ボール落とし：玉を落とす
    bellows: ['assets/se/bellows1.ogg', 'assets/se/bellows2.ogg'], // 精錬所：ふいご
    cast: ['assets/se/cast1.ogg', 'assets/se/cast2.ogg'], // 精錬所：鋳込み
    tamp: ['assets/se/tamp1.ogg', 'assets/se/tamp2.ogg', 'assets/se/tamp3.ogg'], // 発破場：火薬を詰める
    crate: ['assets/se/crate1.ogg', 'assets/se/crate2.ogg', 'assets/se/crate3.ogg'], // 配送：積み込み／品種改良：出荷
    toss: ['assets/se/toss1.ogg', 'assets/se/toss2.ogg', 'assets/se/toss3.ogg'], // ジャグリング：受ける
    chime: ['assets/se/chime1.ogg', 'assets/se/chime2.ogg'], // ジャグリング：ぴったり
    coins: ['assets/se/coins1.ogg', 'assets/se/coins2.ogg', 'assets/se/coins3.ogg', 'assets/se/coins4.ogg'], // 市場：売る／塔：持ち帰る
  },
  // 光や煙の粒：Kenney「Particle Pack」（CC0。assets/img/fx/License.txt）。白い絵なので、描くときに色を付ける
  fx: Object.fromEntries(['star', 'flare', 'glint', 'smoke', 'cloud', 'flame', 'spark', 'burst', 'ring', 'debris', 'halo'].map((k) => [k, `assets/img/fx/${k}.png`])),
};

// 絵があれば <img>、なければ代わりの文字（絵文字など）を返す
export function imgOr(key, fallback = '') {
  const src = ASSETS.img[key];
  return src ? `<img src="${src}" alt="" draggable="false">` : fallback;
}

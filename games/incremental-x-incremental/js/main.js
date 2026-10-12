// 起動と時間の進行。計算は一定間隔、描画は画面の更新に合わせて行う。
import { setLang, detectLang, getLang } from './core/i18n.js';
import { load, store, newSave } from './core/save.js';
import { tickAll, simulate, runOffline } from './core/world.js';
import { setVolume, startBgm } from './core/audio.js';
import { createApp } from './ui/app.js';

const save = load() || newSave();
if (!save.lang) save.lang = detectLang();
setLang(save.lang);
document.documentElement.lang = getLang();
setVolume({ bgm: save.settings.bgm, se: save.settings.se });

const offline = runOffline(save);
const app = createApp(save);
if (offline) app.showOffline(offline);
document.getElementById('boot')?.remove(); // 読み込み中の印を外す

// 計算：表示していないゲームも、ウィンドウが隠れていても進む
const clock = { speed: 1 }; // 時間の倍率（通常は 1）
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const dt = ((now - last) / 1000) * clock.speed;
  last = now;
  if (dt > 2) simulate(save, dt); // スリープ明けや、裏に回って間隔が空いたとき
  else tickAll(save, dt, document.hidden ? null : app.activeGame());
}, 50);

// 描画
let lastFrame = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  app.frame(dt);
  acc += dt;
  if (acc >= 0.1) {
    acc = 0;
    app.update();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 保存
const persist = () => {
  if (app.saving) store(save);
};
setInterval(persist, 10000);
addEventListener('beforeunload', persist);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
});

// BGM は最初の操作のあとでないと鳴らせない
addEventListener('pointerdown', () => startBgm(), { once: true });

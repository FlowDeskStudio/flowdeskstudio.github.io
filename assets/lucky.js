"use strict";

(() => {
  const messages = {
    ja: [
      "寄り道からヒントが見つかる日",
      "最初の案を小さく試してみる日",
      "いつも選ばない方を選んでみる日",
      "誰かとの会話から視点が増える日",
      "身近な違和感をひとつ観察する日",
      "後回しにした小さなことを終える日"
    ],
    en: [
      "A detour may hold today's best clue",
      "Try the first idea on a small scale",
      "Choose the option you usually pass over",
      "A conversation may add a new angle",
      "Notice one small thing that feels out of place",
      "Finish one small thing you have postponed"
    ]
  };

  const randomBelow = (maximum) => {
    const range = 0x100000000;
    const limit = Math.floor(range / maximum) * maximum;
    const values = new Uint32Array(1);
    do {
      crypto.getRandomValues(values);
    } while (values[0] >= limit);
    return values[0] % maximum;
  };

  document.querySelectorAll("[data-lucky-draw]").forEach((draw) => {
    const locale = draw.dataset.locale === "en" ? "en" : "ja";
    const button = draw.querySelector("[data-draw-button]");
    const number = draw.querySelector("[data-lucky-number]");
    const message = draw.querySelector("[data-lucky-message]");

    if (!button || !number || !message) return;

    button.addEventListener("click", () => {
      number.textContent = String(randomBelow(99) + 1).padStart(2, "0");
      message.textContent = messages[locale][randomBelow(messages[locale].length)];
      button.textContent = locale === "en" ? "Draw again" : "もう一度引く";
      draw.classList.add("has-result");
    });
  });
})();

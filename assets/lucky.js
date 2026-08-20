"use strict";

(() => {
  const messages = {
    ja: [
      "寄り道からヒントが見つかる日",
      "最初に浮かんだ案を小さく試す日",
      "いつも選ばない方を選んでみる日",
      "誰かに話すと面白さが増える日",
      "身近な違和感をひとつ追いかける日",
      "後回しにした小さなことを片づける日"
    ],
    en: [
      "A detour may contain today's best clue",
      "Try the first idea in the smallest possible way",
      "Choose the option you usually skip",
      "Tell someone about an idea and see what changes",
      "Follow one small thing that feels out of place",
      "Finish one tiny thing you have been postponing"
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

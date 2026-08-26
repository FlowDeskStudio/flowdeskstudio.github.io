"use strict";

const BASE_DAY = 1000;
const DISPLAY_LIMIT = 100000;
const baseState = Object.freeze({
  day: 1000,
  coherence: 1574,
  divergence: 7003,
  rngState: 2294107141,
  registers: Object.freeze([
    Object.freeze({ tone: 3876, openness: 83 }),
    Object.freeze({ tone: 3680, openness: 91 }),
    Object.freeze({ tone: 2028, openness: 70 }),
    Object.freeze({ tone: 1721, openness: 86 }),
    Object.freeze({ tone: 2454, openness: 34 }),
    Object.freeze({ tone: 2502, openness: 85 })
  ])
});

function nextUint32(current) {
  let value = current >>> 0;
  value ^= (value << 13) >>> 0;
  value ^= value >>> 17;
  value ^= (value << 5) >>> 0;
  value >>>= 0;
  return value === 0 ? 0x9e3779b9 : value;
}

function randomZeroToSix(state) {
  state.rngState = nextUint32(state.rngState);
  return state.rngState % 7;
}

function stateAtDay(targetDay) {
  const state = {
    day: baseState.day,
    coherence: baseState.coherence,
    divergence: baseState.divergence,
    rngState: baseState.rngState,
    registers: baseState.registers.map((register) => ({ ...register }))
  };
  while (state.day < targetDay) {
    state.day += 1;
    state.coherence = (state.coherence + state.divergence + 1) % 10007;
    state.divergence = ((state.divergence * 3) + state.coherence) % 10009;
    for (const register of state.registers) {
      register.tone = ((register.tone * 5) + state.coherence + randomZeroToSix(state)) % 4093;
      register.openness = (register.openness + register.tone) % 101;
    }
  }
  return state;
}

function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function render(targetDay) {
  const state = stateAtDay(targetDay);
  text("observed-day", state.day);
  text("coherence-value", state.coherence);
  text("divergence-value", state.divergence);
  state.registers.forEach((register, index) => {
    text(`register-${index + 1}-tone`, register.tone);
    text(`register-${index + 1}-openness`, register.openness);
  });
  const mark = document.getElementById("mark-status");
  const locale = document.documentElement.lang === "ja" ? "ja" : "en";
  if (mark) {
    if (state.day % 64 === 0) {
      mark.textContent = locale === "ja" ? "このDayは64日ごとのconvergence_markです" : "This day is a scheduled convergence_mark";
      mark.dataset.active = "true";
    } else {
      const nextMark = state.day + (64 - (state.day % 64));
      mark.textContent = locale === "ja" ? `次のconvergence_markはDay ${nextMark}` : `Next convergence_mark: Day ${nextMark}`;
      mark.dataset.active = "false";
    }
  }
}

function showError(message) {
  const error = document.getElementById("observer-error");
  if (error) error.textContent = message;
}

const input = document.getElementById("day-input");
const button = document.getElementById("observe-button");

function observeInput() {
  if (!input) return;
  const locale = document.documentElement.lang === "ja" ? "ja" : "en";
  const day = Number(input.value);
  if (!Number.isSafeInteger(day) || day < BASE_DAY || day > DISPLAY_LIMIT) {
    showError(locale === "ja" ? `Day ${BASE_DAY}〜${DISPLAY_LIMIT}の整数を入力してください` : `Enter a whole day from ${BASE_DAY} to ${DISPLAY_LIMIT}`);
    return;
  }
  showError("");
  render(day);
}

if (button) button.addEventListener("click", observeInput);
if (input) input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") observeInput();
});
document.querySelectorAll("[data-observer-day]").forEach((control) => {
  control.addEventListener("click", () => {
    if (!input) return;
    input.value = control.dataset.observerDay;
    observeInput();
  });
});

render(BASE_DAY);

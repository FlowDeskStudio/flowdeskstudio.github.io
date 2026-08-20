"use strict";

(() => {
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const overlay = document.querySelector("#game-overlay");
  const introPanel = document.querySelector("#intro-panel");
  const upgradePanel = document.querySelector("#upgrade-panel");
  const upgradeChoices = document.querySelector("#upgrade-choices");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const overlayRules = document.querySelector("#overlay-rules");
  const startButton = document.querySelector("#start-button");
  const stageCount = document.querySelector("#stage-count");
  const savedCount = document.querySelector("#saved-count");
  const targetCount = document.querySelector("#target-count");
  const timeCount = document.querySelector("#time-count");
  const statusText = document.querySelector("#status-text");
  const totalCount = document.querySelector("#total-count");
  const carryCount = document.querySelector("#carry-count");
  const skillsText = document.querySelector("#skills-text");
  const directionButtons = document.querySelectorAll("[data-direction]");

  const width = canvas.width;
  const height = canvas.height;
  const fridge = { x: 380, y: 24, width: 200, height: 94 };
  const input = { up: false, down: false, left: false, right: false };
  const colors = ["#ffd86e", "#ffba61", "#ffe49a", "#f7c85f", "#ffd174", "#ffc75f"];

  const skillCatalog = [
    { id: "speed", code: "MOTOR+", name: "高速冷蔵係", description: "移動速度が10%上がる" },
    { id: "time", code: "TIME+", name: "冷却猶予", description: "毎ステージの制限時間が6秒増える" },
    { id: "reach", code: "REACH+", name: "ロングキャッチ", description: "プリンを捕まえる距離が広がる" },
    { id: "slow", code: "SPOON-", name: "重たいスプーン", description: "スプーンの速度が10%下がる" },
    { id: "capacity", code: "CARRY+", name: "二段トレー", description: "一度に運べるプリンが1個増える" },
    { id: "headStart", code: "SAVED+", name: "先回り冷蔵", description: "各ステージ開始時に1個救出済みになる" }
  ];

  let mode = "standby";
  let lastFrame = performance.now();
  let stage = 1;
  let stageTarget = 6;
  let stageSaved = 0;
  let totalSaved = 0;
  let timeLeft = 51;
  let carriedIds = [];
  let puddings = [];
  let spoons = [];
  let particles = [];
  let audioContext = null;
  let currentPuddingSpeed = 65;

  const upgrades = { speed: 0, time: 0, reach: 0, slow: 0, capacity: 0, headStart: 0 };
  const player = { x: width / 2, y: height - 76, radius: 23, speed: 285 };

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function distanceBetween(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function carryCapacity() {
    return Math.min(4, 1 + upgrades.capacity);
  }

  function pickupReach() {
    return Math.min(50, 5 + upgrades.reach * 9);
  }

  function createPuddings(count) {
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      x: randomBetween(72, width - 72),
      y: randomBetween(170, height - 92),
      vx: randomBetween(-currentPuddingSpeed, currentPuddingSpeed) || 38,
      vy: randomBetween(-currentPuddingSpeed, currentPuddingSpeed) || -42,
      radius: 22,
      color: colors[index % colors.length],
      carried: false,
      delivered: false,
      wobble: randomBetween(0, Math.PI * 2)
    }));
  }

  function createSpoons(count) {
    const baseSpeed = (160 + stage * 24) * Math.max(0.55, 1 - upgrades.slow * 0.1);
    return Array.from({ length: count }, (_, index) => ({
      x: index % 2 === 0 ? 80 : width - 80,
      y: 220 + index * 78,
      vx: (index % 2 === 0 ? 1 : -1) * baseSpeed * (1 + index * 0.07),
      radius: 22,
      phase: index * 1.7,
      cooldown: 0
    }));
  }

  function setupStage() {
    stageTarget = Math.min(12, 5 + stage);
    currentPuddingSpeed = 58 + stage * 7;
    const baseTime = Math.max(24, 54 - stage * 3);
    timeLeft = baseTime + Math.min(24, upgrades.time * 6);
    stageSaved = Math.min(3, upgrades.headStart, stageTarget - 1);
    totalSaved += stageSaved;
    carriedIds = [];
    puddings = createPuddings(stageTarget);
    puddings.slice(0, stageSaved).forEach((pudding) => {
      pudding.delivered = true;
    });
    const spoonCount = Math.min(4, 1 + Math.floor((stage - 1) / 2));
    spoons = createSpoons(spoonCount);
    particles = [];
    player.x = width / 2;
    player.y = height - 76;
    player.speed = 285 * Math.min(1.6, 1 + upgrades.speed * 0.1);
    stageCount.textContent = String(stage);
    savedCount.textContent = String(stageSaved);
    targetCount.textContent = String(stageTarget);
    timeCount.textContent = String(Math.ceil(timeLeft));
    totalCount.textContent = String(totalSaved);
    statusText.textContent = "RUNNING";
    updateCarryDisplay();
    updateSkillDisplay();
  }

  function resetUpgrades() {
    Object.keys(upgrades).forEach((key) => {
      upgrades[key] = 0;
    });
  }

  function startRun() {
    stage = 1;
    totalSaved = 0;
    resetUpgrades();
    setupStage();
    mode = "playing";
    overlay.hidden = true;
    introPanel.hidden = false;
    upgradePanel.hidden = true;
    overlayRules.hidden = false;
    lastFrame = performance.now();
    playTone(260, 0.08);
  }

  function beginNextStage(skillId) {
    upgrades[skillId] += 1;
    stage += 1;
    setupStage();
    mode = "playing";
    overlay.hidden = true;
    playTone(520, 0.12);
  }

  function showUpgradeChoice() {
    mode = "choosing";
    statusText.textContent = "STAGE CLEAR";
    introPanel.hidden = true;
    upgradePanel.hidden = false;
    upgradeChoices.replaceChildren();
    const available = skillCatalog.filter((skill) => {
      if (skill.id === "capacity") return upgrades.capacity < 3;
      if (skill.id === "headStart") return upgrades.headStart < 3;
      return true;
    });
    const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, 3);
    shuffled.forEach((skill) => {
      const button = document.createElement("button");
      const code = document.createElement("span");
      const name = document.createElement("strong");
      const description = document.createElement("span");
      button.type = "button";
      button.className = "skill-card";
      code.className = "skill-code";
      name.className = "skill-name";
      description.className = "skill-description";
      code.textContent = skill.code;
      name.textContent = skill.name;
      description.textContent = skill.description;
      button.append(code, name, description);
      button.addEventListener("click", () => beginNextStage(skill.id));
      upgradeChoices.append(button);
    });
    overlay.hidden = false;
    const firstChoice = upgradeChoices.querySelector("button");
    if (firstChoice) firstChoice.focus();
    playTone(690, 0.15);
  }

  function finishRun() {
    mode = "gameover";
    statusText.textContent = "TIME UP";
    introPanel.hidden = false;
    upgradePanel.hidden = true;
    overlayRules.hidden = true;
    overlayKicker.textContent = "RUN COMPLETE";
    overlayTitle.textContent = `STAGE ${stage}`;
    overlayCopy.textContent = `累計${totalSaved}個を冷蔵しました`;
    startButton.firstChild.textContent = "RESTART RUN ";
    overlay.hidden = false;
    playTone(130, 0.35);
  }

  function playTone(frequency, duration) {
    try {
      if (!audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioContext = new AudioContext();
      }
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_error) {
      audioContext = null;
    }
  }

  function updateCarryDisplay() {
    carryCount.textContent = `${carriedIds.length} / ${carryCapacity()}`;
  }

  function updateSkillDisplay() {
    const active = skillCatalog
      .filter((skill) => upgrades[skill.id] > 0)
      .map((skill) => `${skill.code}${upgrades[skill.id]}`);
    skillsText.textContent = active.length ? active.join(" / ") : "NONE";
  }

  function updatePlayer(delta) {
    let horizontal = Number(input.right) - Number(input.left);
    let vertical = Number(input.down) - Number(input.up);
    if (horizontal !== 0 && vertical !== 0) {
      horizontal *= Math.SQRT1_2;
      vertical *= Math.SQRT1_2;
    }
    player.x = clamp(player.x + horizontal * player.speed * delta, player.radius, width - player.radius);
    player.y = clamp(player.y + vertical * player.speed * delta, player.radius + 118, height - player.radius);
  }

  function updatePuddings(delta, elapsed) {
    puddings.forEach((pudding) => {
      if (pudding.delivered) return;

      if (pudding.carried) {
        const carryIndex = carriedIds.indexOf(pudding.id);
        const row = Math.floor(carryIndex / 2);
        const side = carryIndex % 2 === 0 ? -1 : 1;
        const targetX = player.x + side * (18 + row * 8);
        const targetY = player.y + 38 + row * 16;
        pudding.x += (targetX - pudding.x) * Math.min(1, delta * 11);
        pudding.y += (targetY - pudding.y) * Math.min(1, delta * 11);
        return;
      }

      const playerDistance = distanceBetween(pudding, player);
      if (playerDistance < 140 && playerDistance > 0) {
        pudding.vx += ((pudding.x - player.x) / playerDistance) * 110 * delta;
        pudding.vy += ((pudding.y - player.y) / playerDistance) * 110 * delta;
      }

      const speed = Math.hypot(pudding.vx, pudding.vy);
      if (speed > currentPuddingSpeed) {
        pudding.vx = (pudding.vx / speed) * currentPuddingSpeed;
        pudding.vy = (pudding.vy / speed) * currentPuddingSpeed;
      }

      pudding.x += pudding.vx * delta;
      pudding.y += pudding.vy * delta;
      pudding.wobble += delta * 4.5;

      if (pudding.x < pudding.radius || pudding.x > width - pudding.radius) {
        pudding.vx *= -1;
        pudding.x = clamp(pudding.x, pudding.radius, width - pudding.radius);
      }
      if (pudding.y < 148 || pudding.y > height - pudding.radius) {
        pudding.vy *= -1;
        pudding.y = clamp(pudding.y, 148, height - pudding.radius);
      }

      const canCarryMore = carriedIds.length < carryCapacity();
      if (canCarryMore && distanceBetween(pudding, player) < pudding.radius + player.radius + pickupReach()) {
        carriedIds.push(pudding.id);
        pudding.carried = true;
        statusText.textContent = carriedIds.length === carryCapacity() ? "TRAY FULL" : "CARRYING";
        updateCarryDisplay();
        playTone(390 + carriedIds.length * 35, 0.07);
      }

      pudding.x += Math.sin(elapsed * 0.0017 + pudding.id) * 0.18;
    });
  }

  function spoonHead(spoon) {
    const direction = spoon.vx >= 0 ? 1 : -1;
    return { x: spoon.x + direction * 34, y: spoon.y - 18, radius: 22 };
  }

  function updateSpoons(delta) {
    spoons.forEach((spoon, index) => {
      spoon.x += spoon.vx * delta;
      spoon.y = 238 + index * 66 + Math.sin(spoon.x * 0.011 + spoon.phase) * 76;
      spoon.cooldown = Math.max(0, spoon.cooldown - delta);
      if (spoon.x < 52 || spoon.x > width - 52) {
        spoon.vx *= -1;
        spoon.x = clamp(spoon.x, 52, width - 52);
      }

      const head = spoonHead(spoon);
      if (spoon.cooldown === 0 && carriedIds.length > 0 && distanceBetween(head, player) < head.radius + player.radius) {
        const droppedId = carriedIds.pop();
        const dropped = puddings.find((pudding) => pudding.id === droppedId);
        if (dropped) {
          dropped.carried = false;
          dropped.x = clamp(player.x - Math.sign(spoon.vx) * 64, 40, width - 40);
          dropped.y = clamp(player.y + 48, 155, height - 40);
          dropped.vx = -spoon.vx * 0.38;
          dropped.vy = 62;
        }
        spoon.cooldown = 0.85;
        statusText.textContent = "DROPPED";
        updateCarryDisplay();
        playTone(110, 0.16);
      }
    });
  }

  function depositPuddings() {
    if (carriedIds.length === 0) return;
    const insideFridge = player.x > fridge.x && player.x < fridge.x + fridge.width && player.y < fridge.y + fridge.height + 34;
    if (!insideFridge) return;

    const deposited = [...carriedIds];
    carriedIds = [];
    deposited.forEach((id, index) => {
      const pudding = puddings.find((item) => item.id === id);
      if (!pudding) return;
      pudding.carried = false;
      pudding.delivered = true;
      createCelebration(player.x + index * 8, player.y, pudding.color);
    });
    stageSaved += deposited.length;
    totalSaved += deposited.length;
    savedCount.textContent = String(stageSaved);
    totalCount.textContent = String(totalSaved);
    statusText.textContent = stageSaved >= stageTarget ? "STAGE CLEAR" : "FIND ANOTHER";
    updateCarryDisplay();
    playTone(620, 0.1);
    if (stageSaved >= stageTarget) showUpgradeChoice();
  }

  function createCelebration(x, y, color) {
    for (let index = 0; index < 14; index += 1) {
      particles.push({
        x,
        y,
        vx: randomBetween(-170, 170),
        vy: randomBetween(-230, -70),
        life: randomBetween(0.55, 1),
        color
      });
    }
  }

  function updateParticles(delta) {
    particles.forEach((particle) => {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 380 * delta;
      particle.life -= delta;
    });
    particles = particles.filter((particle) => particle.life > 0);
  }

  function update(delta, elapsed) {
    if (mode !== "playing") return;
    timeLeft = Math.max(0, timeLeft - delta);
    timeCount.textContent = String(Math.ceil(timeLeft));
    updatePlayer(delta);
    updatePuddings(delta, elapsed);
    updateSpoons(delta);
    updateParticles(delta);
    depositPuddings();
    if (timeLeft <= 0 && mode === "playing") finishRun();
  }

  function roundedRectangle(x, y, rectangleWidth, rectangleHeight, radius) {
    context.beginPath();
    context.roundRect(x, y, rectangleWidth, rectangleHeight, radius);
  }

  function drawBackground() {
    context.fillStyle = "#f4f0e5";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(17, 18, 15, 0.10)";
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 48) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 48) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.fillStyle = "rgba(116, 130, 255, 0.14)";
    context.fillRect(0, 120, width, 8);
  }

  function drawFridge() {
    context.fillStyle = "#11120f";
    roundedRectangle(fridge.x, fridge.y, fridge.width, fridge.height, 8);
    context.fill();
    context.fillStyle = "#fffef8";
    roundedRectangle(fridge.x + 10, fridge.y + 10, fridge.width - 20, fridge.height - 20, 4);
    context.fill();
    context.strokeStyle = "#11120f";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(fridge.x + fridge.width / 2, fridge.y + 10);
    context.lineTo(fridge.x + fridge.width / 2, fridge.y + fridge.height - 10);
    context.stroke();
    context.fillStyle = "#7482ff";
    context.fillRect(fridge.x + 28, fridge.y + 38, 8, 28);
    context.fillRect(fridge.x + fridge.width - 36, fridge.y + 38, 8, 28);
    context.fillStyle = "#11120f";
    context.font = "900 15px Consolas, monospace";
    context.textAlign = "center";
    context.fillText(`STAGE ${stage} FRIDGE`, fridge.x + fridge.width / 2, fridge.y + fridge.height + 24);
  }

  function drawPudding(pudding) {
    if (pudding.delivered) return;
    const bounce = Math.sin(pudding.wobble) * 2;
    context.save();
    context.translate(pudding.x, pudding.y + bounce);
    context.fillStyle = pudding.color;
    context.beginPath();
    context.moveTo(-20, -10);
    context.quadraticCurveTo(-23, 8, -16, 20);
    context.quadraticCurveTo(0, 27, 16, 20);
    context.quadraticCurveTo(23, 8, 20, -10);
    context.closePath();
    context.fill();
    context.strokeStyle = "#11120f";
    context.lineWidth = 3;
    context.stroke();
    context.fillStyle = "#8f4a27";
    context.beginPath();
    context.ellipse(0, -10, 20, 8, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = "#11120f";
    context.beginPath();
    context.arc(-7, 3, 2.3, 0, Math.PI * 2);
    context.arc(7, 3, 2.3, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(0, 9, 5, 0, Math.PI);
    context.stroke();
    context.restore();
  }

  function drawPlayer() {
    context.save();
    context.translate(player.x, player.y);
    context.fillStyle = "#7482ff";
    context.beginPath();
    context.arc(0, 0, player.radius, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#11120f";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = "#fffef8";
    context.fillRect(-10, -7, 6, 6);
    context.fillRect(4, -7, 6, 6);
    context.fillRect(-8, 8, 16, 4);
    context.fillStyle = "#11120f";
    context.font = "900 11px Consolas, monospace";
    context.textAlign = "center";
    context.fillText(`YOU ×${carryCapacity()}`, 0, 42);
    context.restore();
  }

  function drawSpoon(spoon) {
    context.save();
    context.translate(spoon.x, spoon.y);
    if (spoon.vx < 0) context.scale(-1, 1);
    context.strokeStyle = "#11120f";
    context.lineWidth = 10;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(-32, 18);
    context.lineTo(25, -13);
    context.stroke();
    context.fillStyle = spoon.cooldown > 0 ? "#c8ff43" : "#ff705b";
    context.beginPath();
    context.ellipse(34, -18, 22, 15, -0.35, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#11120f";
    context.lineWidth = 4;
    context.stroke();
    context.restore();
  }

  function drawParticles() {
    particles.forEach((particle) => {
      context.globalAlpha = Math.max(0, particle.life);
      context.fillStyle = particle.color;
      context.fillRect(particle.x - 4, particle.y - 4, 8, 8);
    });
    context.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    drawFridge();
    puddings.forEach(drawPudding);
    spoons.forEach(drawSpoon);
    drawPlayer();
    drawParticles();
  }

  function frame(now) {
    const delta = Math.min(0.035, (now - lastFrame) / 1000);
    lastFrame = now;
    update(delta, now);
    draw();
    requestAnimationFrame(frame);
  }

  const keyMap = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right"
  };

  window.addEventListener("keydown", (event) => {
    const direction = keyMap[event.key];
    if (!direction) return;
    event.preventDefault();
    input[direction] = true;
  });

  window.addEventListener("keyup", (event) => {
    const direction = keyMap[event.key];
    if (!direction) return;
    event.preventDefault();
    input[direction] = false;
  });

  window.addEventListener("blur", () => {
    Object.keys(input).forEach((direction) => {
      input[direction] = false;
    });
  });

  directionButtons.forEach((button) => {
    const direction = button.dataset.direction;
    const release = () => {
      input[direction] = false;
      button.classList.remove("is-active");
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      input[direction] = true;
      button.classList.add("is-active");
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  startButton.addEventListener("click", startRun);

  stageTarget = 6;
  currentPuddingSpeed = 65;
  puddings = createPuddings(stageTarget);
  spoons = createSpoons(1);
  requestAnimationFrame(frame);
})();

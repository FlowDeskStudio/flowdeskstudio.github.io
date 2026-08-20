"use strict";

(() => {
  const canvas = document.querySelector("#game-canvas");
  const context = canvas.getContext("2d");
  const overlay = document.querySelector("#game-overlay");
  const overlayKicker = document.querySelector("#overlay-kicker");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const overlayRules = document.querySelector("#overlay-rules");
  const startButton = document.querySelector("#start-button");
  const savedCount = document.querySelector("#saved-count");
  const timeCount = document.querySelector("#time-count");
  const statusText = document.querySelector("#status-text");
  const directionButtons = document.querySelectorAll("[data-direction]");

  const width = canvas.width;
  const height = canvas.height;
  const fridge = { x: 380, y: 24, width: 200, height: 94 };
  const input = { up: false, down: false, left: false, right: false };
  const colors = ["#ffd86e", "#ffba61", "#ffe49a", "#f7c85f", "#ffd174"];

  let mode = "standby";
  let lastFrame = performance.now();
  let timeLeft = 60;
  let saved = 0;
  let carriedId = null;
  let puddings = [];
  let particles = [];
  let audioContext = null;

  const player = { x: width / 2, y: height - 76, radius: 23, speed: 285 };
  const spoon = { x: 120, y: 245, vx: 185, radius: 24 };

  function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
  }

  function createPuddings() {
    return Array.from({ length: 5 }, (_, index) => ({
      id: index,
      x: randomBetween(90, width - 90),
      y: randomBetween(190, height - 120),
      vx: randomBetween(-72, 72) || 42,
      vy: randomBetween(-72, 72) || -38,
      radius: 22,
      color: colors[index],
      carried: false,
      delivered: false,
      wobble: randomBetween(0, Math.PI * 2)
    }));
  }

  function resetGame() {
    timeLeft = 60;
    saved = 0;
    carriedId = null;
    puddings = createPuddings();
    particles = [];
    player.x = width / 2;
    player.y = height - 76;
    spoon.x = 120;
    spoon.y = 245;
    spoon.vx = 185;
    savedCount.textContent = "0";
    timeCount.textContent = "60";
    statusText.textContent = "RUNNING";
  }

  function startGame() {
    resetGame();
    mode = "playing";
    overlay.hidden = true;
    overlayRules.hidden = false;
    lastFrame = performance.now();
    playTone(260, 0.08);
  }

  function finishGame(didWin) {
    mode = didWin ? "won" : "lost";
    statusText.textContent = didWin ? "ALL SAFE" : "TIME UP";
    overlayKicker.textContent = didWin ? "MISSION COMPLETE" : "THEY ARE STILL WARM";
    overlayTitle.textContent = didWin ? "全員ひんやり" : `${saved}個は救出`;
    overlayCopy.textContent = didWin
      ? "5個のプリンが冷蔵庫へ戻りました"
      : "逃げたプリンは次の機会を待っています";
    overlayRules.hidden = true;
    startButton.firstChild.textContent = "PLAY AGAIN ";
    overlay.hidden = false;
    playTone(didWin ? 520 : 130, didWin ? 0.22 : 0.35);
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

  function distanceBetween(first, second) {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
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
        pudding.x += (player.x - pudding.x) * Math.min(1, delta * 10);
        pudding.y += (player.y + 38 - pudding.y) * Math.min(1, delta * 10);
        return;
      }

      const playerDistance = distanceBetween(pudding, player);
      if (playerDistance < 125 && playerDistance > 0) {
        pudding.vx += ((pudding.x - player.x) / playerDistance) * 95 * delta;
        pudding.vy += ((pudding.y - player.y) / playerDistance) * 95 * delta;
      }

      const speed = Math.hypot(pudding.vx, pudding.vy);
      if (speed > 92) {
        pudding.vx = (pudding.vx / speed) * 92;
        pudding.vy = (pudding.vy / speed) * 92;
      }

      pudding.x += pudding.vx * delta;
      pudding.y += pudding.vy * delta;
      pudding.wobble += delta * 4;

      if (pudding.x < pudding.radius || pudding.x > width - pudding.radius) {
        pudding.vx *= -1;
        pudding.x = clamp(pudding.x, pudding.radius, width - pudding.radius);
      }
      if (pudding.y < 148 || pudding.y > height - pudding.radius) {
        pudding.vy *= -1;
        pudding.y = clamp(pudding.y, 148, height - pudding.radius);
      }

      if (carriedId === null && distanceBetween(pudding, player) < pudding.radius + player.radius + 5) {
        carriedId = pudding.id;
        pudding.carried = true;
        statusText.textContent = "CARRYING";
        playTone(390, 0.07);
      }

      pudding.x += Math.sin(elapsed * 0.0015 + pudding.id) * 0.15;
    });
  }

  function updateSpoon(delta) {
    spoon.x += spoon.vx * delta;
    spoon.y = 270 + Math.sin(spoon.x * 0.012) * 92;
    if (spoon.x < 50 || spoon.x > width - 50) {
      spoon.vx *= -1;
      spoon.x = clamp(spoon.x, 50, width - 50);
    }

    if (carriedId !== null && distanceBetween(spoon, player) < spoon.radius + player.radius) {
      const carried = puddings.find((pudding) => pudding.id === carriedId);
      if (carried) {
        carried.carried = false;
        carried.x = clamp(player.x + (spoon.vx > 0 ? -60 : 60), 40, width - 40);
        carried.y = clamp(player.y + 48, 155, height - 40);
        carried.vx = -spoon.vx * 0.35;
        carried.vy = 55;
      }
      carriedId = null;
      statusText.textContent = "DROPPED";
      playTone(110, 0.16);
    }
  }

  function depositPudding() {
    if (carriedId === null) return;
    const insideFridge = player.x > fridge.x && player.x < fridge.x + fridge.width && player.y < fridge.y + fridge.height + 34;
    if (!insideFridge) return;

    const carried = puddings.find((pudding) => pudding.id === carriedId);
    if (!carried) return;
    carried.carried = false;
    carried.delivered = true;
    carriedId = null;
    saved += 1;
    savedCount.textContent = String(saved);
    statusText.textContent = saved === 5 ? "ALL SAFE" : "FIND ANOTHER";
    createCelebration(player.x, player.y, carried.color);
    playTone(620, 0.1);
    if (saved === 5) finishGame(true);
  }

  function createCelebration(x, y, color) {
    for (let index = 0; index < 18; index += 1) {
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
    updateSpoon(delta);
    updateParticles(delta);
    depositPudding();
    if (timeLeft <= 0 && mode === "playing") finishGame(false);
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
    context.fillText("FRIDGE", fridge.x + fridge.width / 2, fridge.y + fridge.height + 24);
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
    context.fillText("YOU", 0, 42);
    context.restore();
  }

  function drawSpoon() {
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
    context.fillStyle = "#ff705b";
    context.beginPath();
    context.ellipse(34, -18, 22, 15, -0.35, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#11120f";
    context.lineWidth = 4;
    context.stroke();
    context.fillStyle = "#11120f";
    context.font = "900 11px Consolas, monospace";
    context.textAlign = "center";
    context.fillText("SPOON", 0, 46);
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
    drawSpoon();
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
    ArrowUp: "up",
    w: "up",
    W: "up",
    ArrowDown: "down",
    s: "down",
    S: "down",
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right"
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

  startButton.addEventListener("click", startGame);

  puddings = createPuddings();
  requestAnimationFrame(frame);
})();

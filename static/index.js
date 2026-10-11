"use strict";

const COLS = 10;
const ROWS = 20;
const API = "/api/highscores";

const COLORS = {
  I: "#4fd1c5",
  O: "#f6e05e",
  T: "#b794f4",
  S: "#68d391",
  Z: "#fc8181",
  J: "#63b3ed",
  L: "#f6ad55",
};

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

const LINE_POINTS = [0, 100, 300, 500, 800];

const boardCanvas = document.getElementById("board");
const ctx = boardCanvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
const CELL = boardCanvas.width / COLS;

const el = {
  score: document.getElementById("score"),
  lines: document.getElementById("lines"),
  level: document.getElementById("level"),
  overlay: document.getElementById("overlay"),
  overlayText: document.getElementById("overlay-text"),
  startBtn: document.getElementById("start-btn"),
  form: document.getElementById("score-form"),
  name: document.getElementById("player-name"),
  highscores: document.getElementById("highscores"),
};

let grid, piece, nextType, bag;
let score, lines, level;
let dropInterval, dropAcc, lastTime;
let state = "idle"; // idle | running | paused | over
let highscores = [];

/* ---------- Spiellogik ---------- */

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function nextFromBag() {
  if (!bag || bag.length === 0) {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function spawn(type) {
  const matrix = SHAPES[type].map((row) => row.slice());
  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: type === "I" ? -1 : 0,
  };
}

function collides(matrix, x, y) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const gx = x + c;
      const gy = y + r;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
      if (gy >= 0 && grid[gy][gx]) return true;
    }
  }
  return false;
}

function rotate(matrix) {
  const n = matrix.length;
  return matrix.map((row, r) => row.map((_, c) => matrix[n - 1 - c][r]));
}

function tryRotate() {
  if (piece.type === "O") return;
  const rotated = rotate(piece.matrix);
  for (const dx of [0, -1, 1, -2, 2]) {
    if (!collides(rotated, piece.x + dx, piece.y)) {
      piece.matrix = rotated;
      piece.x += dx;
      return;
    }
  }
}

function move(dx) {
  if (!collides(piece.matrix, piece.x + dx, piece.y)) piece.x += dx;
}

function softDrop() {
  if (!collides(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
    score += 1;
  } else {
    lock();
  }
  dropAcc = 0;
}

function hardDrop() {
  let dist = 0;
  while (!collides(piece.matrix, piece.x, piece.y + 1)) {
    piece.y++;
    dist++;
  }
  score += dist * 2;
  lock();
}

function ghostY() {
  let y = piece.y;
  while (!collides(piece.matrix, piece.x, y + 1)) y++;
  return y;
}

function lock() {
  for (let r = 0; r < piece.matrix.length; r++) {
    for (let c = 0; c < piece.matrix[r].length; c++) {
      if (!piece.matrix[r][c]) continue;
      const gy = piece.y + r;
      if (gy < 0) {
        gameOver();
        return;
      }
      grid[gy][piece.x + c] = piece.type;
    }
  }
  clearLines();
  piece = spawn(nextType);
  nextType = nextFromBag();
  if (collides(piece.matrix, piece.x, piece.y)) gameOver();
  updateStats();
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[r].every(Boolean)) {
      grid.splice(r, 1);
      grid.unshift(Array(COLS).fill(null));
      cleared++;
      r++;
    }
  }
  if (cleared === 0) return;
  score += LINE_POINTS[cleared] * level;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  dropInterval = speedFor(level);
}

function speedFor(lvl) {
  return Math.max(80, 1000 * Math.pow(0.85, lvl - 1));
}

/* ---------- Ablauf ---------- */

function start() {
  grid = emptyGrid();
  bag = [];
  piece = spawn(nextFromBag());
  nextType = nextFromBag();
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = speedFor(level);
  dropAcc = 0;
  lastTime = performance.now();
  state = "running";
  hideOverlay();
  updateStats();
  requestAnimationFrame(loop);
}

function togglePause() {
  if (state === "running") {
    state = "paused";
    showOverlay("Pause – <kbd>P</kbd> zum Fortsetzen", false);
  } else if (state === "paused") {
    state = "running";
    hideOverlay();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }
}

function gameOver() {
  state = "over";
  draw();
  const qualifies =
    score > 0 &&
    (highscores.length < 10 || score > highscores[highscores.length - 1].score);
  showOverlay(`Game Over – ${score} Punkte`, qualifies);
}

function loop(time) {
  if (state !== "running") return;
  dropAcc += time - lastTime;
  lastTime = time;
  if (dropAcc >= dropInterval) {
    dropAcc = 0;
    if (!collides(piece.matrix, piece.x, piece.y + 1)) {
      piece.y++;
    } else {
      lock();
    }
  }
  draw();
  if (state === "running") requestAnimationFrame(loop);
}

/* ---------- Darstellung ---------- */

function drawCell(c, x, y, size, color, alpha = 1) {
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  c.fillStyle = "rgba(255,255,255,0.18)";
  c.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  c.globalAlpha = 1;
}

function draw() {
  ctx.fillStyle = "#090a16";
  ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, boardCanvas.height);
    ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(boardCanvas.width, y * CELL);
    ctx.stroke();
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c]) drawCell(ctx, c, r, CELL, COLORS[grid[r][c]]);
    }
  }

  if (state === "running" || state === "paused") {
    const gy = ghostY();
    eachBlock(piece, (x, y) => drawCell(ctx, x, gy - piece.y + y, CELL, COLORS[piece.type], 0.2));
    eachBlock(piece, (x, y) => drawCell(ctx, x, y, CELL, COLORS[piece.type]));
  }

  drawNext();
}

function eachBlock(p, fn) {
  for (let r = 0; r < p.matrix.length; r++) {
    for (let c = 0; c < p.matrix[r].length; c++) {
      if (p.matrix[r][c] && p.y + r >= 0) fn(p.x + c, p.y + r);
    }
  }
}

function drawNext() {
  const size = 24;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextType) return;
  const m = SHAPES[nextType];
  const rows = m.filter((row) => row.some(Boolean));
  const width = Math.max(...rows.map((row) => row.lastIndexOf(1) + 1));
  const minCol = Math.min(...rows.map((row) => row.indexOf(1)));
  const offX = (nextCanvas.width - (width - minCol) * size) / 2;
  const offY = (nextCanvas.height - rows.length * size) / 2;
  nextCtx.save();
  nextCtx.translate(offX - minCol * size, offY);
  rows.forEach((row, r) =>
    row.forEach((v, c) => v && drawCell(nextCtx, c, r, size, COLORS[nextType]))
  );
  nextCtx.restore();
}

function updateStats() {
  el.score.textContent = score;
  el.lines.textContent = lines;
  el.level.textContent = level;
}

function showOverlay(html, askName) {
  el.overlayText.innerHTML = html;
  el.form.classList.toggle("hidden", !askName);
  el.startBtn.textContent = state === "paused" ? "Weiter" : "Neues Spiel";
  el.overlay.classList.remove("hidden");
  if (askName) {
    el.name.value = localStorage.getItem("tetris-name") || "";
    el.name.focus();
  }
}

function hideOverlay() {
  el.overlay.classList.add("hidden");
}

/* ---------- Highscores ---------- */

function renderHighscores(highlight) {
  el.highscores.replaceChildren();
  if (highscores.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "noch keine Einträge";
    el.highscores.append(li);
    return;
  }
  for (const entry of highscores) {
    const li = document.createElement("li");
    li.textContent = entry.name;
    const s = document.createElement("span");
    s.textContent = entry.score;
    li.append(s);
    if (highlight && entry.created_at === highlight.created_at && entry.name === highlight.name && entry.score === highlight.score) {
      li.classList.add("me");
    }
    el.highscores.append(li);
  }
}

async function loadHighscores() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(res.statusText);
    highscores = await res.json();
    renderHighscores();
  } catch {
    el.highscores.innerHTML = '<li class="muted">Backend nicht erreichbar</li>';
  }
}

async function submitHighscore(name) {
  const payload = { name, score, lines, level };
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(res.statusText);
  highscores = await res.json();
  const mine = highscores.find((e) => e.name === name && e.score === score);
  renderHighscores(mine);
}

/* ---------- Eingabe ---------- */

document.addEventListener("keydown", (e) => {
  if (e.target === el.name) return;

  if (state === "running") {
    switch (e.key) {
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowDown": softDrop(); updateStats(); break;
      case "ArrowUp":
      case "x":
      case "X": tryRotate(); break;
      case " ": hardDrop(); break;
      case "p":
      case "P": togglePause(); return;
      default: return;
    }
    e.preventDefault();
    if (state === "running") draw();
  } else if (state === "paused" && (e.key === "p" || e.key === "P" || e.key === "Enter")) {
    togglePause();
  } else if ((state === "idle" || state === "over") && e.key === "Enter") {
    e.preventDefault();
    start();
  }
});

el.startBtn.addEventListener("click", () => {
  if (state === "paused") togglePause();
  else start();
});

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el.name.value.trim().replace(/[<>]/g, "");
  if (!name) return;
  localStorage.setItem("tetris-name", name);
  const btn = el.form.querySelector("button");
  btn.disabled = true;
  try {
    await submitHighscore(name);
    el.form.classList.add("hidden");
    el.overlayText.textContent = `Gespeichert! ${score} Punkte`;
  } catch {
    el.overlayText.textContent = "Speichern fehlgeschlagen";
  } finally {
    btn.disabled = false;
  }
});

grid = emptyGrid();
draw();
loadHighscores();

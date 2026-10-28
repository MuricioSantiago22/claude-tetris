'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#90caf9', // L - pale blue
  '#c0c0c0', // R - silver (anillo)
  '#f5f5f5', // W - comodín (Tinte)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // R (anillo)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const WILD = 9;
const POWERUP_INTERVAL = 25000; // ms de juego entre power-ups
const FREEZE_TIME = 5000;
const POWERUPS = {
  bomb:      { name: 'Bomba',    desc: 'destruye 3×3' },
  lightning: { name: 'Rayo',     desc: 'fila/columna a elección' },
  tint:      { name: 'Tinte',    desc: 'color → comodín' },
  gravity:   { name: 'Gravedad', desc: 'compacta huecos' },
  freeze:    { name: 'Congelar', desc: 'pausa la caída 5s' },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const powerupEl = document.getElementById('powerup');

let gridColor = '#22222e';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const light = theme === 'light';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggle.textContent = light ? '☾ Oscuro' : '☀ Claro';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let powerup, powerTimer, freezeLeft, aiming;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function updatePowerupHUD() {
  let text;
  if (aiming) {
    text = `Rayo: ${aiming.axis === 'row' ? 'FILA' : 'COLUMNA'} — flechas mover, R cambiar, Enter disparar, Esc cancelar`;
  } else if (powerup) {
    text = `${POWERUPS[powerup].name} (${POWERUPS[powerup].desc}) — Enter para usar`;
  } else {
    text = `Próximo en ${Math.ceil((POWERUP_INTERVAL - powerTimer) / 1000)}s`;
  }
  if (freezeLeft > 0) text += ` · Congelado ${Math.ceil(freezeLeft / 1000)}s`;
  powerupEl.textContent = text;
}

function activatePowerup() {
  if (!powerup || aiming) return;
  const type = powerup;
  if (type === 'lightning') {
    aiming = { axis: 'row', row: ROWS - 1, col: Math.floor(COLS / 2) };
    updatePowerupHUD();
    return;
  }
  powerup = null;
  powerTimer = 0;
  if (type === 'bomb') useBomb();
  else if (type === 'tint') useTint();
  else if (type === 'gravity') useGravity();
  else if (type === 'freeze') freezeLeft = FREEZE_TIME;
  updatePowerupHUD();
}

// Explota en el bloque más alto de la columna central de la pieza actual.
function useBomb() {
  const cx = Math.min(COLS - 1, Math.max(0, current.x + Math.floor(current.shape[0].length / 2)));
  let cy = ROWS - 1;
  for (let r = 0; r < ROWS; r++) {
    if (board[r][cx]) { cy = r; break; }
  }
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

function fireLightning() {
  if (aiming.axis === 'row') board[aiming.row].fill(0);
  else for (let r = 0; r < ROWS; r++) board[r][aiming.col] = 0;
  aiming = null;
  powerup = null;
  powerTimer = 0;
}

// Convierte en comodines todos los bloques del color más abundante.
function useTint() {
  const counts = {};
  for (const row of board)
    for (const v of row)
      if (v && v !== WILD) counts[v] = (counts[v] || 0) + 1;
  let best = 0;
  for (const k in counts) if (!best || counts[k] > counts[best]) best = Number(k);
  if (!best) return;
  for (const row of board)
    for (let c = 0; c < COLS; c++)
      if (row[c] === best) row[c] = WILD;
}

function useGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        const v = board[r][c];
        board[r][c] = 0;
        board[write--][c] = v;
      }
    }
  }
  clearLines();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // objetivo del rayo
  if (aiming) {
    ctx.fillStyle = 'rgba(255, 235, 59, 0.35)';
    if (aiming.axis === 'row') ctx.fillRect(0, aiming.row * BLOCK, COLS * BLOCK, BLOCK);
    else ctx.fillRect(aiming.col * BLOCK, 0, BLOCK, ROWS * BLOCK);
  }

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (!aiming) {
    if (freezeLeft > 0) {
      freezeLeft = Math.max(0, freezeLeft - dt);
    } else {
      dropAccum += dt;
    }
    if (!powerup) {
      powerTimer += dt;
      if (powerTimer >= POWERUP_INTERVAL) {
        const types = Object.keys(POWERUPS);
        powerup = types[Math.floor(Math.random() * types.length)];
        powerTimer = 0;
      }
    }
  }
  updatePowerupHUD();
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  powerup = null;
  powerTimer = 0;
  freezeLeft = 0;
  aiming = null;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  if (aiming) {
    e.preventDefault();
    switch (e.code) {
      case 'ArrowLeft':  aiming.col = Math.max(0, aiming.col - 1); break;
      case 'ArrowRight': aiming.col = Math.min(COLS - 1, aiming.col + 1); break;
      case 'ArrowUp':    aiming.row = Math.max(0, aiming.row - 1); break;
      case 'ArrowDown':  aiming.row = Math.min(ROWS - 1, aiming.row + 1); break;
      case 'KeyR':       aiming.axis = aiming.axis === 'row' ? 'col' : 'row'; break;
      case 'Enter':      fireLightning(); break;
      case 'Escape':     aiming = null; break;
    }
    updatePowerupHUD();
    return;
  }
  switch (e.code) {
    case 'Enter':
      activatePowerup();
      break;
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  restartBtn.blur(); // evita que Space reactive el botón
  init();
});

themeToggle.addEventListener('click', () => {
  const newTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  try { localStorage.setItem('theme', newTheme); } catch (e) {}
  themeToggle.blur(); // evita que Space active el botón
  if (paused || gameOver) draw(); // el loop no repinta en pausa
});

applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

init();

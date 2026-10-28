# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No build, no dependencies, no package.json, no tests, no linter. UI text and README are in Spanish.

## Run

Open `index.html` directly, or serve statically: `python3 -m http.server 8000` then visit `http://localhost:8000`.

## Architecture

Three files, loaded by `index.html` (`style.css` + `<script src="game.js">`). All logic lives in `game.js`, a single script using module-level globals (`board`, `current`, `next`, `score`, `lines`, `level`, ...), declared together and reset in `init()`.

- `game.js` looks up DOM elements by id at load: `board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`. Renaming any of these in `index.html` breaks the game.
- Board is a `ROWS × COLS` matrix; cell is `0` or a color/piece index 1–7. The same index keys `COLORS` and `PIECES` (index 0 is `null`), and piece shape matrices store that index in their filled cells.
- Game loop (`loop`) runs on `requestAnimationFrame`, accumulates `dropAccum`, and gravity-drops when it exceeds `dropInterval`. Pause/game over use `cancelAnimationFrame(animId)`; `init()` is also the restart handler.
- Lock flow: `lockPiece()` → `merge()` → `clearLines()` (updates score/level/`dropInterval`) → `spawn()`. `spawn()` calls `endGame()` if the new piece collides.
- Rotation (`tryRotate`) is rotate-clockwise plus simple horizontal kicks `[0,-1,1,-2,2]` only. No SRS tables, no 7-bag (`randomPiece` is uniform random).
- Scoring: `LINE_SCORES[cleared] * level`; soft drop +1/row, hard drop +2/row. Level = `floor(lines/10)+1`; `dropInterval = max(100, 1000 - (level-1)*90)`.

## Gotchas

- Changing `COLS`, `ROWS`, or `BLOCK` requires updating the `<canvas id="board">` `width`/`height` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`) by hand.
- `drawNext()` assumes a 4×4 grid with 30px cells in the 120×120 `#next-canvas`.
- `README.md` describes the project in Spanish and says `game.js` is ~300 lines; keep it in sync if behavior changes.

/**
 * Canvas UI for the sliding puzzle (数字华容道), dark blue theme.
 *
 * This is the browser port of the Python `main.py` (pygame) UI; the rules,
 * timings and colours are kept identical.
 *
 * Flow:
 *   - A size-selection screen is shown first (3x3 .. 8x8 buttons, each showing
 *     the best score recorded for that size).
 *   - Choosing a size starts the game with a solvable shuffle.
 *   - Click a tile in the same row or column as the blank to slide it (and the
 *     tiles in between) toward the blank.
 *   - 撤销 (Undo) / 重来本局 (Restart) / 求解 (Solve) / 新游戏 (New Game)
 *     buttons. "Solve" auto-solves the board without counting time or steps and
 *     without recording a best score.
 *   - On completion only 新游戏 and 退出 are clickable.
 *   - Step count and elapsed time are tracked; the best of each is saved to
 *     localStorage (see scores.js) when a game is won.
 */
(function (global) {
  'use strict';

  var Puzzle = global.Puzzle;
  var Layout = global.Layout;
  var Scores = global.Scores;

  var WINDOW_WIDTH = 560;
  var WINDOW_HEIGHT = 700;
  var SOLVE_INTERVAL = 5; // ms between each auto-solver move (one move per step)
  var MAX_FRAME_MS = 1000; // ignore longer gaps (tab was hidden) when timing

  // Board geometry (kept in sync with Layout.computeLayout defaults).
  var MARGIN = 17;
  var GAP = 6;
  var TOP_OFFSET = 100;
  var BOTTOM_BAR = 74; // vertical space reserved for the control buttons

  var SIZES = [3, 4, 5, 6, 7, 8]; // board sizes available for selection

  // Dark blue theme palette (deeper blue; background is darker than the tiles).
  var COLOR_BG = '#16203e';
  var COLOR_PANEL = '#0a0f1e';
  var COLOR_TILE = '#204a91';
  var COLOR_TILE_EDGE = '#3e6eb9';
  var COLOR_TEXT = '#ecf0f8';
  var COLOR_EMPTY = '#070a12';
  var COLOR_EMPTY_EDGE = '#202c46';
  var COLOR_BUTTON = '#204a91';
  var COLOR_BUTTON_HOVER = '#2e60af';
  var COLOR_BUTTON_TEXT = '#ecf0f8';
  var COLOR_ACCENT = '#5aaaf5';
  var COLOR_MUTED = '#9aa8c4';

  // System CJK fonts, in preference order: Windows / macOS / Linux, then any
  // sans-serif the browser can find.
  var FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", ' +
    '"Noto Sans SC", "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif';

  function font(size, weight) {
    return (weight ? weight + ' ' : '') + size + 'px ' + FONT_STACK;
  }

  function roundRect(ctx, x, y, w, h, r) {
    var radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  }

  function now() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function rect(x, y, w, h) {
    return { x: x, y: y, w: w, h: h };
  }

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.round(WINDOW_WIDTH * this.dpr);
    canvas.height = Math.round(WINDOW_HEIGHT * this.dpr);
    this.fitToWindow();

    this.mouse = [-1, -1];
    this.rafId = 0;
    this.running = true;
    this.exited = false;

    this._buildActionButtons();
    this._buildSizeButtons();
    this._buildWinButtons();

    this.size = 4;
    this.selectingSize = true;
    this.board = [];
    this.initialBoard = [];
    this.history = [];
    this.layout = Layout.computeLayout(WINDOW_WIDTH, WINDOW_HEIGHT, this.size, MARGIN, GAP, TOP_OFFSET);

    this.steps = 0;
    this.timeMs = 0;
    this.lastTicks = now();
    this.clockStarted = false;
    this.newRecord = false;
    this.scores = Scores.load();

    this.solving = false;
    this.solution = [];
    this.solveIndex = 0;
    this.solveLast = 0;
    this.autoSolved = false;

    // Value of the tile the last 提示 asked the player to move, or null.
    this.hintTile = null;

    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  /**
   * Space actually available for the canvas, in CSS pixels.
   *
   * `visualViewport` reflects what is really on screen (Android's collapsing
   * URL bar makes `innerHeight` unreliable there); the safe-area insets that
   * style.css applies as body padding are subtracted so the board never slides
   * under a display cutout or the gesture bar.
   */
  Game.prototype._availableViewport = function () {
    var vv = global.visualViewport;
    var vw = (vv && vv.width) || global.innerWidth || WINDOW_WIDTH;
    var vh = (vv && vv.height) || global.innerHeight || WINDOW_HEIGHT;

    var insetX = 0;
    var insetY = 0;
    if (global.getComputedStyle && global.document && global.document.body) {
      var style = global.getComputedStyle(global.document.body);
      insetX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      insetY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    }
    return [vw - insetX, vh - insetY];
  };

  Game.prototype.fitToWindow = function () {
    var view = this._availableViewport();
    // Never enlarge past 1:1 (the canvas would only get blurry), but shrink to
    // fit narrow phones. Pointer coordinates are rescaled back in _bindEvents.
    var scale = Math.min(1, (view[0] - 24) / WINDOW_WIDTH, (view[1] - 24) / WINDOW_HEIGHT);
    this.canvas.style.width = Math.round(WINDOW_WIDTH * scale) + 'px';
    this.canvas.style.height = Math.round(WINDOW_HEIGHT * scale) + 'px';
  };

  Game.prototype._bindEvents = function () {
    var self = this;

    function pos(event) {
      var bounds = self.canvas.getBoundingClientRect();
      var scale = bounds.width > 0 ? WINDOW_WIDTH / bounds.width : 1;
      return [(event.clientX - bounds.left) * scale, (event.clientY - bounds.top) * scale];
    }

    this.canvas.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      var p = pos(event);
      self.handleClick(p[0], p[1]);
    });
    this.canvas.addEventListener('pointermove', function (event) {
      var p = pos(event);
      self.mouse = p;
    });
    this.canvas.addEventListener('pointerleave', function () {
      self.mouse = [-1, -1];
    });
    // Touch scrolling / double-tap zoom would fight the board.
    this.canvas.style.touchAction = 'none';
    if (typeof global.addEventListener === 'function') {
      var refit = function () {
        self.fitToWindow();
      };
      global.addEventListener('resize', refit);
      global.addEventListener('orientationchange', refit);
      // On Android the URL bar collapsing fires a visual-viewport resize but
      // not always a window resize.
      if (global.visualViewport && global.visualViewport.addEventListener) {
        global.visualViewport.addEventListener('resize', refit);
      }
    }
  };

  /** Lay out 撤销 / 重来本局 / 提示 / 求解 / 新游戏 along the bottom bar. */
  Game.prototype._buildActionButtons = function () {
    var boardBottom = TOP_OFFSET + (WINDOW_WIDTH - 2 * MARGIN);
    // Five buttons have to fit the board's width, so they are a little narrower
    // and closer together than the original four (which were 100px / 12px).
    var buttonW = 96, buttonH = 44, gap = 8;
    var startX = Math.floor((WINDOW_WIDTH - (5 * buttonW + 4 * gap)) / 2);
    var y = boardBottom + Math.floor((BOTTOM_BAR - buttonH) / 2);
    var labels = ['撤销', '重来本局', '提示', '求解', '新游戏'];
    var actions = [
      this.undo.bind(this),
      this.restart.bind(this),
      this.showHint.bind(this),
      this.startSolve.bind(this),
      this.showSizeSelection.bind(this),
    ];
    this.actionButtons = [];
    for (var i = 0; i < labels.length; i++) {
      this.actionButtons.push({
        rect: rect(startX + i * (buttonW + gap), y, buttonW, buttonH),
        label: labels[i],
        action: actions[i],
      });
    }
  };

  /** Lay out the size-selection buttons (two per row). */
  Game.prototype._buildSizeButtons = function () {
    var buttonW = 150, buttonH = 64, gap = 18;
    var rows = Math.ceil(SIZES.length / 2);
    var gridW = 2 * buttonW + gap;
    var gridH = rows * buttonH + (rows - 1) * gap;
    var left = Math.floor((WINDOW_WIDTH - gridW) / 2);
    var top = Math.floor((WINDOW_HEIGHT - gridH) / 2) + 20;
    this.sizeButtons = [];
    for (var i = 0; i < SIZES.length; i++) {
      var row = Math.floor(i / 2);
      var col = i % 2;
      this.sizeButtons.push({
        rect: rect(left + col * (buttonW + gap), top + row * (buttonH + gap), buttonW, buttonH),
        label: SIZES[i] + '×' + SIZES[i],
        size: SIZES[i],
      });
    }
  };

  /** Lay out the 新游戏 / 退出 buttons shown on completion. */
  Game.prototype._buildWinButtons = function () {
    var buttonW = 160, buttonH = 52, gap = 20;
    var startX = Math.floor((WINDOW_WIDTH - (2 * buttonW + gap)) / 2);
    var y = Math.floor(WINDOW_HEIGHT / 2) + 40;
    this.winButtons = [
      { rect: rect(startX, y, buttonW, buttonH), label: '新游戏', action: this.showSizeSelection.bind(this) },
      { rect: rect(startX + buttonW + gap, y, buttonW, buttonH), label: '退出', action: this.quit.bind(this) },
    ];

    var backW = 160, backH = 52;
    this.exitedButton = {
      rect: rect(Math.floor((WINDOW_WIDTH - backW) / 2), Math.floor(WINDOW_HEIGHT / 2) + 40, backW, backH),
      label: '返回游戏',
      action: this.resume.bind(this),
    };
  };

  // ---------------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------------

  Game.prototype.showSizeSelection = function () {
    this.selectingSize = true;
    this.board = [];
    this.initialBoard = [];
    this.history = [];
    this.scores = Scores.load();
    this._cancelSolve();
    this._clearHint();
  };

  Game.prototype.startNewGame = function (size) {
    this.size = size;
    this.selectingSize = false;
    this.layout = Layout.computeLayout(WINDOW_WIDTH, WINDOW_HEIGHT, size, MARGIN, GAP, TOP_OFFSET);
    this.fontTilePx = Math.max(22, Math.min(72, Math.round(this.layout.cell * 0.6)));
    this.newGame();
  };

  /** Deal a fresh, solvable (non-solved) board and reset history/progress. */
  Game.prototype.newGame = function () {
    var steps = Math.max(200, this.size * this.size * 12);
    for (;;) {
      var board = Puzzle.shuffle(Puzzle.solvedBoard(this.size), steps);
      // shuffle() already guarantees solvability via a random walk, but
      // double-check here so an unsolvable board can never be dealt.
      if (!Puzzle.isSolved(board) && Puzzle.isSolvable(board)) {
        this.board = board;
        this.initialBoard = board.slice();
        this.history = [];
        this._resetProgress();
        return;
      }
    }
  };

  /** Reset to this game's starting position. */
  Game.prototype.restart = function () {
    this.board = this.initialBoard.slice();
    this.history = [];
    this._resetProgress();
  };

  /** Leave the game: close the tab if the browser allows it. */
  Game.prototype.quit = function () {
    this.exited = true;
    try {
      global.close();
    } catch (err) {
      // Most browsers refuse to close a tab the script did not open.
    }
  };

  /** Come back from the "感谢游玩" screen. */
  Game.prototype.resume = function () {
    this.exited = false;
    this.showSizeSelection();
  };

  /** Undo the most recent move, if any. */
  Game.prototype.undo = function () {
    if (this.solving) {
      return; // ignore undo while the solver is animating
    }
    if (this.history.length) {
      this.board = this.history.pop();
      this.steps -= 1;
      this._clearHint();
    }
  };

  Game.prototype._resetProgress = function () {
    this.steps = 0;
    this.timeMs = 0;
    this.lastTicks = now();
    this.clockStarted = false;
    this.newRecord = false;
    this._cancelSolve();
    this.autoSolved = false;
    this._clearHint();
  };

  Game.prototype.formatTime = function (ms) {
    var total = Math.floor(ms / 1000);
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
  };

  Game.prototype._recordBest = function () {
    var result = Scores.update(this.scores, this.size, this.steps, this.timeMs);
    if (result[0] || result[1]) {
      this.newRecord = true;
      Scores.save(this.scores);
    }
  };

  Game.prototype._cancelSolve = function () {
    this.solving = false;
    this.solution = [];
    this.solveIndex = 0;
  };

  /** Drop the highlighted hint (the position it referred to has changed). */
  Game.prototype._clearHint = function () {
    this.hintTile = null;
  };

  /**
   * Highlight the next move, without playing it.
   *
   * Reuses the 求解 solver: its first move is always a tile adjacent to the
   * blank, which is also a legal slide here, so the whole solution never needs
   * to be kept — only the one tile to move. Hints do not count as moves: they
   * leave the step count, the clock and the best scores alone.
   */
  Game.prototype.showHint = function () {
    if (this.selectingSize || this.exited || this.solving || this.isSolved()) {
      return;
    }
    var solution;
    try {
      solution = Puzzle.solve(this.board);
    } catch (err) {
      return; // unsolvable: should not happen for a dealt board
    }
    if (!solution.length) {
      return;
    }
    this.hintTile = solution[0];
  };

  /** Compute a solution and begin animating it (no time/steps counted). */
  Game.prototype.startSolve = function () {
    if (this.solving || this.isSolved()) {
      return;
    }
    var solution;
    try {
      solution = Puzzle.solve(this.board);
    } catch (err) {
      return; // should not happen for a solvable board
    }
    if (!solution.length) {
      return;
    }
    this.solution = solution;
    this.solveIndex = 0;
    this.history = [];
    this.solving = true;
    this.solveLast = now();
    this._clearHint(); // the solver is taking over; drop any hint highlight
  };

  /** Advance the auto-solver one move per SOLVE_INTERVAL ms. */
  Game.prototype._updateSolve = function () {
    if (!this.solving) {
      return;
    }
    var time = now();
    if (time - this.solveLast <= SOLVE_INTERVAL) {
      return;
    }
    this.solveLast = time;
    this.board = Puzzle.moveTile(this.board, this.solution[this.solveIndex]);
    this.solveIndex += 1;
    if (this.solveIndex >= this.solution.length) {
      this.solving = false;
      this.autoSolved = true;
    }
  };

  /** Accumulate elapsed time while actively playing. */
  Game.prototype._tick = function () {
    var time = now();
    var delta = Math.min(time - this.lastTicks, MAX_FRAME_MS);
    if (!this.selectingSize && this.board.length && this.clockStarted &&
        !this.isSolved() && !this.solving) {
      this.timeMs += delta;
    }
    this.lastTicks = time;
  };

  Game.prototype.isSolved = function () {
    return this.board.length > 0 && Puzzle.isSolved(this.board);
  };

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  Game.prototype.handleClick = function (x, y) {
    if (this.exited) {
      if (pointInRect(x, y, this.exitedButton.rect)) {
        this.exitedButton.action();
      }
      return;
    }

    if (this.selectingSize) {
      for (var i = 0; i < this.sizeButtons.length; i++) {
        var sizeButton = this.sizeButtons[i];
        if (pointInRect(x, y, sizeButton.rect)) {
          this.startNewGame(sizeButton.size);
          return;
        }
      }
      return;
    }

    if (this.isSolved()) {
      // On completion only 新游戏 / 退出 are active.
      for (var w = 0; w < this.winButtons.length; w++) {
        if (pointInRect(x, y, this.winButtons[w].rect)) {
          this.winButtons[w].action();
          return;
        }
      }
      return;
    }

    for (var b = 0; b < this.actionButtons.length; b++) {
      if (pointInRect(x, y, this.actionButtons[b].rect)) {
        this.actionButtons[b].action();
        return;
      }
    }
    if (this.solving) {
      return; // ignore tile clicks while auto-solving
    }
    var index = Layout.indexAtPos(x, y, this.layout);
    if (index !== null && Puzzle.canSlide(this.board, this.board[index])) {
      this.history.push(this.board.slice());
      this.board = Puzzle.slideTile(this.board, this.board[index]);
      this.steps += 1;
      this.clockStarted = true;
      this._clearHint(); // the hinted position is gone; re-hint on the next press
      if (this.isSolved()) {
        this._recordBest();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  Game.prototype.run = function () {
    var self = this;
    function frame() {
      self._updateSolve();
      self._tick();
      self.draw();
      self.rafId = global.requestAnimationFrame(frame);
    }
    this.rafId = global.requestAnimationFrame(frame);
  };

  Game.prototype.draw = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    if (this.exited) {
      this._drawExited();
      return;
    }
    if (this.selectingSize) {
      this._drawSizeSelection();
      return;
    }

    this._drawTitle();
    this._drawStats();
    this._drawBoard();
    if (this.isSolved()) {
      this._drawWinOverlay();
    } else {
      this._drawActionButtons();
    }
  };

  Game.prototype._text = function (text, x, y, fontSpec, color) {
    var ctx = this.ctx;
    ctx.font = fontSpec;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  };

  Game.prototype._drawTitle = function () {
    this._text('数字华容道', WINDOW_WIDTH / 2, 42, font(46, 'bold'), COLOR_TEXT);
  };

  Game.prototype._drawStats = function () {
    this._text(
      '步数 ' + this.steps + '    用时 ' + this.formatTime(this.timeMs),
      WINDOW_WIDTH / 2, 82, font(24), COLOR_TEXT
    );
  };

  Game.prototype._drawSizeSelection = function () {
    this._text('数字华容道', WINDOW_WIDTH / 2, 80, font(46, 'bold'), COLOR_TEXT);
    this._text('请选择棋盘大小', WINDOW_WIDTH / 2, 130, font(22), COLOR_TEXT);

    for (var i = 0; i < this.sizeButtons.length; i++) {
      var button = this.sizeButtons[i];
      var r = button.rect;
      var hovered = pointInRect(this.mouse[0], this.mouse[1], r);
      this.ctx.fillStyle = hovered ? COLOR_BUTTON_HOVER : COLOR_BUTTON;
      roundRect(this.ctx, r.x, r.y, r.w, r.h, 12);
      this.ctx.fill();

      this._text(button.label, r.x + r.w / 2, r.y + r.h / 2 - 9, font(30), COLOR_BUTTON_TEXT);
      this._text(this._bestLabel(button.size), r.x + r.w / 2, r.y + r.h / 2 + 18,
        font(15), COLOR_MUTED);
    }
  };

  /** Compact "最佳 12步 · 00:34" line for a size button, or a placeholder. */
  Game.prototype._bestLabel = function (size) {
    var bestSteps = Scores.bestSteps(this.scores, size);
    var bestTime = Scores.bestTimeMs(this.scores, size);
    if (bestSteps === null && bestTime === null) {
      return '暂无记录';
    }
    var parts = [];
    if (bestSteps !== null) {
      parts.push(bestSteps + '步');
    }
    if (bestTime !== null) {
      parts.push(this.formatTime(bestTime));
    }
    return '最佳 ' + parts.join(' · ');
  };

  Game.prototype._drawBoard = function () {
    var ctx = this.ctx;
    var ox = this.layout.origin[0];
    var oy = this.layout.origin[1];
    var boardPx = this.layout.boardPx;

    ctx.fillStyle = COLOR_PANEL;
    roundRect(ctx, ox - GAP, oy - GAP, boardPx + 2 * GAP, boardPx + 2 * GAP, 12);
    ctx.fill();

    var radius = Math.max(4, Math.floor(this.layout.cell / 12));
    for (var index = 0; index < this.board.length; index++) {
      var row = Math.floor(index / this.size);
      var col = index % this.size;
      var box = Layout.tileRect(row, col, this.layout);
      var value = this.board[index];

      if (value === Puzzle.EMPTY) {
        ctx.fillStyle = COLOR_EMPTY;
        roundRect(ctx, box[0], box[1], box[2], box[3], radius);
        ctx.fill();
        ctx.strokeStyle = COLOR_EMPTY_EDGE;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = COLOR_TILE;
        roundRect(ctx, box[0], box[1], box[2], box[3], radius);
        ctx.fill();
        ctx.strokeStyle = COLOR_TILE_EDGE;
        ctx.lineWidth = 2;
        ctx.stroke();
        this._text(String(value), box[0] + box[2] / 2, box[1] + box[3] / 2,
          font(this.fontTilePx || 56), COLOR_TEXT);
      }
    }
    this._drawHint();
  };

  /**
   * Pulse an outline around the tile the current hint points at, plus an arrow
   * towards the blank, so it is obvious which way it will slide.
   *
   * The hinted tile is always next to the blank, so the arrow is one step long.
   */
  Game.prototype._drawHint = function () {
    if (this.hintTile === null || this.hintTile === undefined) {
      return;
    }
    var index = this.board.indexOf(this.hintTile);
    if (index < 0 || index === Puzzle.findEmpty(this.board)) {
      return; // stale hint (should not happen: it is cleared on every move)
    }

    var ctx = this.ctx;
    var n = this.size;
    var box = Layout.tileRect(Math.floor(index / n), index % n, this.layout);
    var empty = Puzzle.findEmpty(this.board);
    var emptyBox = Layout.tileRect(Math.floor(empty / n), empty % n, this.layout);

    // 0.55 .. 1.0, so the highlight breathes instead of blinking.
    var pulse = 0.55 + 0.45 * Math.sin(now() / 260);
    var radius = Math.max(4, Math.floor(this.layout.cell / 12));

    ctx.save();
    ctx.globalAlpha = pulse;

    ctx.strokeStyle = COLOR_ACCENT;
    ctx.lineWidth = Math.max(3, this.layout.cell * 0.07);
    roundRect(ctx, box[0], box[1], box[2], box[3], radius);
    ctx.stroke();

    // Arrowhead halfway between the tile and the cell it will slide into.
    var cx = box[0] + box[2] / 2;
    var cy = box[1] + box[3] / 2;
    var ex = emptyBox[0] + emptyBox[2] / 2;
    var ey = emptyBox[1] + emptyBox[3] / 2;
    var dx = ex - cx;
    var dy = ey - cy;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len;
    var uy = dy / len;
    var midX = (cx + ex) / 2;
    var midY = (cy + ey) / 2;
    var head = this.layout.cell * 0.17;

    ctx.fillStyle = COLOR_ACCENT;
    ctx.beginPath();
    ctx.moveTo(midX + ux * head, midY + uy * head);
    ctx.lineTo(midX - ux * head - uy * head * 0.8, midY - uy * head + ux * head * 0.8);
    ctx.lineTo(midX - ux * head + uy * head * 0.8, midY - uy * head - ux * head * 0.8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  };

  Game.prototype._drawActionButtons = function () {
    // 20px keeps 「重来本局」 (4 full-width glyphs) inside the 96px buttons.
    for (var i = 0; i < this.actionButtons.length; i++) {
      this._drawButton(this.actionButtons[i], font(20));
    }
  };

  Game.prototype._drawWinButtons = function () {
    for (var i = 0; i < this.winButtons.length; i++) {
      this._drawButton(this.winButtons[i], font(28));
    }
  };

  Game.prototype._drawButton = function (button, fontSpec) {
    var r = button.rect;
    var hovered = pointInRect(this.mouse[0], this.mouse[1], r);
    this.ctx.fillStyle = hovered ? COLOR_BUTTON_HOVER : COLOR_BUTTON;
    roundRect(this.ctx, r.x, r.y, r.w, r.h, 10);
    this.ctx.fill();
    this._text(button.label, r.x + r.w / 2, r.y + r.h / 2, fontSpec, COLOR_BUTTON_TEXT);
  };

  Game.prototype._drawWinOverlay = function () {
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.67)';
    ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    var cx = WINDOW_WIDTH / 2;
    var cy = WINDOW_HEIGHT / 2;
    if (this.autoSolved) {
      this._text('已求解', cx, cy - 80, font(56, 'bold'), COLOR_ACCENT);
    } else {
      this._text('You Win!', cx, cy - 100, font(56, 'bold'), COLOR_ACCENT);
      this._text('步数 ' + this.steps + ' · 用时 ' + this.formatTime(this.timeMs),
        cx, cy - 52, font(22), COLOR_TEXT);
      if (this.newRecord) {
        this._text('新纪录!', cx, cy - 20, font(22), COLOR_ACCENT);
      }
    }
    this._drawWinButtons();
  };

  Game.prototype._drawExited = function () {
    var cx = WINDOW_WIDTH / 2;
    var cy = WINDOW_HEIGHT / 2;
    this._text('感谢游玩', cx, cy - 90, font(48, 'bold'), COLOR_ACCENT);
    this._text('浏览器不允许脚本关闭本页，请手动关闭标签页', cx, cy - 40, font(18), COLOR_MUTED);
    this._drawButton(this.exitedButton, font(24));
  };

  global.HuarongGame = Game;
})(typeof globalThis !== 'undefined' ? globalThis : this);

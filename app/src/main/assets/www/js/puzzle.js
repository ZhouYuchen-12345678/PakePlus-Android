/**
 * Core logic for the sliding puzzle (N-puzzle), free of any UI code.
 *
 * A board is a flat array of `size * size` integers; `EMPTY` (0) marks the
 * blank cell. The solved board is `1..size*size-1` followed by the blank:
 *
 *     [1, 2, 3, 4, 5, 6, 7, 8, ..., size*size-1, 0]
 *
 * The board size is derived from the array length, so the same functions work
 * for 3x3, 4x4, 5x5, 6x6, etc. Only `solvedBoard` needs the size explicitly.
 *
 * This is a direct port of the Python `puzzle.py`.
 */
(function (global) {
  'use strict';

  var EMPTY = 0;

  /** Return the solved board for a `size` x `size` puzzle. */
  function solvedBoard(size) {
    var board = [];
    for (var value = 1; value < size * size; value++) {
      board.push(value);
    }
    board.push(EMPTY);
    return board;
  }

  /** Board size (e.g. 4 for a 4x4 board), derived from the flat length. */
  function size(board) {
    return Math.round(Math.sqrt(board.length));
  }

  /** Return true if `board` contains exactly the tiles 0..len-1 once each. */
  function isValidBoard(board) {
    var seen = [];
    for (var i = 0; i < board.length; i++) {
      var value = board[i];
      if (!Number.isInteger(value) || value < 0 || value >= board.length || seen[value]) {
        return false;
      }
      seen[value] = true;
    }
    return true;
  }

  /** Return the flat index of the blank cell. */
  function findEmpty(board) {
    return board.indexOf(EMPTY);
  }

  /** Return true if `board` is in the solved configuration. */
  function isSolved(board) {
    var n = size(board);
    if (n * n !== board.length) {
      return false;
    }
    for (var i = 0; i < board.length - 1; i++) {
      if (board[i] !== i + 1) {
        return false;
      }
    }
    return board[board.length - 1] === EMPTY;
  }

  /** Flat indices of the up/down/left/right neighbours of `index`. */
  function neighbors(index, n) {
    var row = Math.floor(index / n);
    var col = index % n;
    var result = [];
    if (row > 0) {
      result.push(index - n);
    }
    if (row < n - 1) {
      result.push(index + n);
    }
    if (col > 0) {
      result.push(index - 1);
    }
    if (col < n - 1) {
      result.push(index + 1);
    }
    return result;
  }

  /** Tile values currently adjacent to (able to slide into) the blank. */
  function movableTiles(board) {
    var n = size(board);
    return neighbors(findEmpty(board), n).map(function (i) {
      return board[i];
    });
  }

  /** Return true if `value` is adjacent to the blank cell. */
  function canMove(board, value) {
    return movableTiles(board).indexOf(value) !== -1;
  }

  /**
   * Return a new board with `value` slid into the blank cell.
   * Throws if `value` is not currently movable.
   */
  function moveTile(board, value) {
    if (!canMove(board, value)) {
      throw new Error('Tile ' + value + ' is not adjacent to the blank cell');
    }
    var empty = findEmpty(board);
    var tile = board.indexOf(value);
    var next = board.slice();
    next[empty] = next[tile];
    next[tile] = EMPTY;
    return next;
  }

  /** Tile values in the same row or column as the blank cell. */
  function slidableTiles(board) {
    var n = size(board);
    var empty = findEmpty(board);
    var erow = Math.floor(empty / n);
    var ecol = empty % n;
    var result = [];
    for (var i = 0; i < n; i++) {
      if (i !== ecol) {
        result.push(board[erow * n + i]); // same row
      }
      if (i !== erow) {
        result.push(board[i * n + ecol]); // same column
      }
    }
    return result;
  }

  /** Return true if `value` shares a row or column with the blank cell. */
  function canSlide(board, value) {
    return slidableTiles(board).indexOf(value) !== -1;
  }

  /**
   * Slide `value` toward the blank, moving every tile in between.
   *
   * The tile must share a row or column with the blank (an adjacent tile is the
   * single-step case). Returns a new board; throws otherwise.
   */
  function slideTile(board, value) {
    if (value === EMPTY) {
      throw new Error('Cannot slide the blank cell');
    }

    var n = size(board);
    var empty = findEmpty(board);
    var tile = board.indexOf(value);
    var erow = Math.floor(empty / n);
    var ecol = empty % n;
    var trow = Math.floor(tile / n);
    var tcol = tile % n;

    if (erow !== trow && ecol !== tcol) {
      throw new Error('Tile ' + value + ' is not in the same row or column as the blank cell');
    }

    var next = board.slice();
    var step;
    if (erow === trow) {
      step = ecol < tcol ? 1 : -1;
      for (var col = ecol; col !== tcol; col += step) {
        var idx = trow * n + col;
        next[idx] = board[idx + step];
      }
    } else {
      step = erow < trow ? 1 : -1;
      for (var row = erow; row !== trow; row += step) {
        var jdx = row * n + ecol;
        next[jdx] = board[jdx + step * n];
      }
    }
    next[tile] = EMPTY;
    return next;
  }

  /**
   * Return a shuffled copy of `board` guaranteed to stay solvable.
   *
   * Instead of permuting blindly (which can produce unsolvable boards), the
   * board is scrambled by performing `steps` random legal moves from the solved
   * state. Every intermediate state is reachable, hence solvable.
   *
   * `rng` may be a function returning a float in [0, 1) for deterministic
   * shuffles; it defaults to `Math.random`.
   */
  function shuffle(board, steps, rng) {
    steps = steps === undefined ? 200 : steps;
    rng = rng || Math.random;
    var current = board.slice();
    var previous = null; // tile moved last step; avoid immediately reversing it
    for (var i = 0; i < steps; i++) {
      var moves = movableTiles(current);
      var candidates = moves.filter(function (m) {
        return m !== previous;
      });
      if (candidates.length === 0) {
        candidates = moves;
      }
      var pick = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
      var value = candidates[pick];
      current = moveTile(current, value);
      previous = value;
    }
    return current;
  }

  /**
   * Independent inversion-parity solvability check for the N-puzzle.
   *
   * - Odd board (3x3, 5x5): solvable iff the number of inversions is even.
   * - Even board (4x4, 6x6): solvable iff inversions + the blank's row counted
   *   from the bottom is odd.
   *
   * Independent of `shuffle`, so it cross-checks that a random-walk shuffle
   * really yields a reachable configuration.
   */
  function isSolvable(board) {
    if (!isValidBoard(board)) {
      return false;
    }

    var n = size(board);
    var tiles = board.filter(function (t) {
      return t !== EMPTY;
    });
    var inversions = 0;
    for (var i = 0; i < tiles.length; i++) {
      for (var j = i + 1; j < tiles.length; j++) {
        if (tiles[i] > tiles[j]) {
          inversions++;
        }
      }
    }

    if (n % 2 === 1) {
      return inversions % 2 === 0;
    }

    var blankRowFromBottom = n - Math.floor(findEmpty(board) / n);
    return (inversions + blankRowFromBottom) % 2 === 1;
  }

  // ---------------------------------------------------------------------------
  // Constructive solver
  // ---------------------------------------------------------------------------

  /**
   * Slide `value` into `goal` without disturbing `protected` cells.
   *
   * Uses BFS over `(blank position, tile position)` states so it cannot get
   * stuck the way a greedy walk can. `protected` is a Set of flat indices whose
   * tiles must not move. Mutates `board` in place and returns the tile values
   * slid.
   */
  function place(board, n, value, goal, protectedCells) {
    if (board[goal] === value) {
      return [];
    }

    var cells = n * n;
    var free = [];
    for (var i = 0; i < cells; i++) {
      free[i] = !protectedCells.has(i);
    }

    var startBlank = findEmpty(board);
    var startTile = board.indexOf(value);
    var startKey = startBlank * cells + startTile;

    var prev = new Map();
    prev.set(startKey, -1);
    var queue = [startKey];
    var head = 0;
    var foundKey = -1;

    while (head < queue.length) {
      var key = queue[head++];
      var blank = Math.floor(key / cells);
      var tile = key % cells;
      if (tile === goal) {
        foundKey = key;
        break;
      }
      var around = neighbors(blank, n);
      for (var k = 0; k < around.length; k++) {
        var nb = around[k];
        if (!free[nb]) {
          continue;
        }
        // The blank swaps with `value` when stepping onto it, otherwise it
        // swaps with whatever free tile sits there.
        var nextKey = nb === tile ? tile * cells + blank : nb * cells + tile;
        if (prev.has(nextKey)) {
          continue;
        }
        prev.set(nextKey, key);
        queue.push(nextKey);
      }
    }

    if (foundKey < 0) {
      throw new Error('cannot place tile ' + value);
    }
    return executePath(board, prev, foundKey, cells); // key = blank * cells + tile
  }

  /**
   * Bring `valueA` and `valueB` to the adjacent goals `goalA`/`goalB`.
   *
   * Uses BFS over `(blank, a, b)` positions, which can route around obstacles
   * (e.g. the last two cells of a row, where a single-tile approach gets stuck
   * because the last cell has only one entrance). Mutates `board` in place and
   * returns the tile values slid.
   */
  function placePair(board, n, valueA, valueB, goalA, goalB, protectedCells) {
    if (board[goalA] === valueA && board[goalB] === valueB) {
      return [];
    }

    var cells = n * n;
    var free = [];
    for (var i = 0; i < cells; i++) {
      free[i] = !protectedCells.has(i);
    }

    var startKey = (findEmpty(board) * cells + board.indexOf(valueA)) * cells + board.indexOf(valueB);

    var prev = new Map();
    prev.set(startKey, -1);
    var queue = [startKey];
    var head = 0;
    var foundKey = -1;

    while (head < queue.length) {
      var key = queue[head++];
      var b = key % cells;
      var a = Math.floor(key / cells) % cells;
      var blank = Math.floor(key / (cells * cells));
      if (a === goalA && b === goalB) {
        foundKey = key;
        break;
      }
      var around = neighbors(blank, n);
      for (var k = 0; k < around.length; k++) {
        var nb = around[k];
        if (!free[nb]) {
          continue;
        }
        var nextKey;
        if (nb === a) {
          nextKey = (a * cells + blank) * cells + b; // valueA slides into the blank
        } else if (nb === b) {
          nextKey = (b * cells + a) * cells + blank; // valueB slides into the blank
        } else {
          nextKey = (nb * cells + a) * cells + b; // a free tile slides into the blank
        }
        if (prev.has(nextKey)) {
          continue;
        }
        prev.set(nextKey, key);
        queue.push(nextKey);
      }
    }

    if (foundKey < 0) {
      throw new Error('cannot place pair ' + valueA + ', ' + valueB);
    }
    // key = (blank * cells + a) * cells + b
    return executePath(board, prev, foundKey, cells * cells, cells);
  }

  /**
   * Walk the BFS parent chain back from `endKey` and play the moves on `board`.
   *
   * Every key encodes the blank position as its most significant digit, so the
   * blank's new position (`key / blankDivisor`) names the tile that slides into
   * the current blank.
   */
  function executePath(board, prev, endKey, blankDivisor) {
    var chain = [];
    for (var key = endKey; key !== -1; key = prev.get(key)) {
      chain.push(key);
    }
    chain.reverse();

    var moves = [];
    for (var i = 1; i < chain.length; i++) {
      var dst = Math.floor(chain[i] / blankDivisor);
      var empty = findEmpty(board);
      var tile = board[dst];
      board[empty] = tile;
      board[dst] = EMPTY;
      moves.push(tile);
    }
    return moves;
  }

  /** Rotate the bottom-right 2x2 block into the solved arrangement. */
  function solve2x2(board, n) {
    var cells = n * n;
    var tl = (n - 2) * n + (n - 2);
    var tr = tl + 1;
    var bl = (n - 1) * n + (n - 2);
    var br = bl + 1;
    var target = [cells - n - 1, cells - n, cells - 1, EMPTY];
    var start = [board[tl], board[tr], board[bl], board[br]];
    var targetKey = target.join(',');
    var startKey = start.join(',');
    if (startKey === targetKey) {
      return [];
    }

    // BFS within the 2x2 block (the blank stays inside it).
    var edges = [[0, 1], [0, 2], [1, 3], [2, 3]];
    var prev = new Map();
    prev.set(startKey, null);
    var queue = [start];
    var found = null;

    while (queue.length) {
      var state = queue.shift();
      var stateKey = state.join(',');
      if (stateKey === targetKey) {
        found = state;
        break;
      }
      var blank = state.indexOf(EMPTY);
      for (var e = 0; e < edges.length; e++) {
        var a = edges[e][0];
        var b = edges[e][1];
        var other = blank === b ? a : (blank === a ? b : -1);
        if (other < 0) {
          continue;
        }
        var next = state.slice();
        next[blank] = state[other];
        next[other] = EMPTY;
        var nextKey = next.join(',');
        if (prev.has(nextKey)) {
          continue;
        }
        prev.set(nextKey, [stateKey, state[other]]);
        queue.push(next);
      }
    }

    if (found === null) {
      throw new Error('cannot solve final 2x2 block');
    }

    var moves = [];
    var cursor = targetKey;
    while (cursor !== startKey) {
      var step = prev.get(cursor);
      moves.push(step[1]);
      cursor = step[0];
    }
    moves.reverse();

    for (var m = 0; m < moves.length; m++) {
      var empty = findEmpty(board);
      var ti = board.indexOf(moves[m]);
      board[empty] = board[ti];
      board[ti] = EMPTY;
    }
    return moves;
  }

  /**
   * Return the ordered list of tile values to slide to solve `board`.
   *
   * Uses a constructive row-by-row / column-by-column reduction that works for
   * any solvable board size (it is not optimal, but always terminates and is
   * fast). Returns `[]` if already solved; throws if the board is unsolvable.
   */
  function solve(board) {
    var n = size(board);
    if (isSolved(board)) {
      return [];
    }
    if (!isSolvable(board)) {
      throw new Error('Board is unsolvable');
    }

    var b = board.slice();
    var moves = [];
    var protectedCells = new Set();

    // Top rows (all but the last two): single tiles, then the last two of each
    // row as a horizontal pair.
    for (var r = 0; r < n - 2; r++) {
      for (var c = 0; c < n - 2; c++) {
        var goal = r * n + c;
        moves = moves.concat(place(b, n, goal + 1, goal, protectedCells));
        protectedCells.add(goal);
      }
      var ga = r * n + (n - 2);
      var gb = r * n + (n - 1);
      moves = moves.concat(placePair(b, n, ga + 1, gb + 1, ga, gb, protectedCells));
      protectedCells.add(ga);
      protectedCells.add(gb);
    }

    // Last two rows: vertical pairs, left to right (columns 0 .. n-3).
    for (var col = 0; col < n - 2; col++) {
      var va = (n - 2) * n + col;
      var vb = (n - 1) * n + col;
      moves = moves.concat(placePair(b, n, va + 1, vb + 1, va, vb, protectedCells));
      protectedCells.add(va);
      protectedCells.add(vb);
    }

    // Remaining bottom-right 2x2 block.
    moves = moves.concat(solve2x2(b, n));

    return moves;
  }

  var Puzzle = {
    EMPTY: EMPTY,
    solvedBoard: solvedBoard,
    size: size,
    isValidBoard: isValidBoard,
    findEmpty: findEmpty,
    isSolved: isSolved,
    neighbors: neighbors,
    movableTiles: movableTiles,
    canMove: canMove,
    moveTile: moveTile,
    slidableTiles: slidableTiles,
    canSlide: canSlide,
    slideTile: slideTile,
    shuffle: shuffle,
    isSolvable: isSolvable,
    solve: solve,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Puzzle;
  } else {
    global.Puzzle = Puzzle;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

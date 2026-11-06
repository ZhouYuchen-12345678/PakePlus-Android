/**
 * Pure board geometry for the sliding puzzle, free of any drawing code.
 *
 * The UI needs to map pixel coordinates to board indices and back. These
 * helpers keep that math separate from rendering so it can be unit-tested.
 *
 * This is a direct port of the Python `layout.py`.
 */
(function (global) {
  'use strict';

  /**
   * Compute the board geometry for a canvas of the given pixel size.
   *
   * Returns an object describing the square board (origin, per-tile size, gaps)
   * drawn with `margin` pixels of padding and `top` pixels reserved above.
   * `height` is accepted for signature symmetry but the board is square, so only
   * `width` affects its size.
   */
  function computeLayout(width, height, size, margin, gap, top) {
    size = size === undefined ? 4 : size;
    margin = margin === undefined ? 17 : margin;
    gap = gap === undefined ? 6 : gap;
    top = top === undefined ? 80 : top;

    var boardPx = width - 2 * margin;
    var cell = (boardPx - (size - 1) * gap) / size;
    return {
      origin: [margin, top],
      cell: cell,
      gap: gap,
      size: size,
      boardPx: boardPx,
    };
  }

  /** Return the `[x, y, w, h]` pixel rectangle of the tile at (row, col). */
  function tileRect(row, col, layout) {
    var ox = layout.origin[0];
    var oy = layout.origin[1];
    var cell = layout.cell;
    var gap = layout.gap;
    var x = ox + col * (cell + gap);
    var y = oy + row * (cell + gap);
    return [Math.round(x), Math.round(y), cell, cell];
  }

  /**
   * Map a pixel position to a flat board index, or null if outside a tile.
   *
   * Positions that fall in the gaps between tiles (or outside the board) return
   * null.
   */
  function indexAtPos(x, y, layout) {
    var ox = layout.origin[0];
    var oy = layout.origin[1];
    var cell = layout.cell;
    var gap = layout.gap;
    var size = layout.size;

    var col = Math.floor((x - ox) / (cell + gap));
    var row = Math.floor((y - oy) / (cell + gap));
    if (!(row >= 0 && row < size && col >= 0 && col < size)) {
      return null;
    }

    // Reject clicks that land in the gap just outside the tile's own cell.
    var px = x - ox - col * (cell + gap);
    var py = y - oy - row * (cell + gap);
    if (px >= 0 && px <= cell && py >= 0 && py <= cell) {
      return row * size + col;
    }
    return null;
  }

  var Layout = {
    computeLayout: computeLayout,
    tileRect: tileRect,
    indexAtPos: indexAtPos,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Layout;
  } else {
    global.Layout = Layout;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

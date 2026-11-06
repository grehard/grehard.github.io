// Uniform grid over world space. Rendering and hit testing only look at shapes in nearby cells,
// so their cost tracks what is on screen rather than how many shapes are on the board.
(function (DB) {
  'use strict';

  const CELL = 256;
  const MAX_CELLS_PER_SHAPE = 64;
  const KEY_OFFSET = 1048576;
  const KEY_STRIDE = 2097152;

  const cellKey = (cx, cy) => (cx + KEY_OFFSET) * KEY_STRIDE + (cy + KEY_OFFSET);

  function cellRange(box) {
    return {
      x0: Math.floor(box.x / CELL), y0: Math.floor(box.y / CELL),
      x1: Math.floor((box.x + box.w) / CELL), y1: Math.floor((box.y + box.h) / CELL),
    };
  }

  class SpatialIndex {
    constructor() {
      this.cells = new Map();
      this.entries = new Map();
      this.oversized = new Set();
    }

    put(id, box) {
      this.remove(id);
      const { x0, y0, x1, y1 } = cellRange(box);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS_PER_SHAPE) {
        this.oversized.add(id);
        this.entries.set(id, null);
        return;
      }
      const keys = [];
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cy = y0; cy <= y1; cy += 1) {
          const key = cellKey(cx, cy);
          let cell = this.cells.get(key);
          if (!cell) { cell = new Set(); this.cells.set(key, cell); }
          cell.add(id);
          keys.push(key);
        }
      }
      this.entries.set(id, keys);
    }

    remove(id) {
      const keys = this.entries.get(id);
      if (keys === undefined) return;
      this.entries.delete(id);
      if (keys === null) { this.oversized.delete(id); return; }
      keys.forEach((key) => {
        const cell = this.cells.get(key);
        cell.delete(id);
        if (cell.size === 0) this.cells.delete(key);
      });
    }

    // Candidates whose cells touch the rectangle. Callers still test exact geometry.
    query(box) {
      const { x0, y0, x1, y1 } = cellRange(box);
      const result = new Set(this.oversized);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) >= this.cells.size) {
        // Zoomed far out it is cheaper to walk the occupied cells than the requested range.
        this.cells.forEach((cell, key) => {
          const cx = Math.floor(key / KEY_STRIDE) - KEY_OFFSET;
          const cy = (key % KEY_STRIDE) - KEY_OFFSET;
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) cell.forEach((id) => result.add(id));
        });
        return Array.from(result);
      }
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cy = y0; cy <= y1; cy += 1) {
          const cell = this.cells.get(cellKey(cx, cy));
          if (cell) cell.forEach((id) => result.add(id));
        }
      }
      return Array.from(result);
    }
  }

  DB.SpatialIndex = SpatialIndex;
})(window.DB);

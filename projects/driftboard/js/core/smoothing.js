// Freehand stroke conditioning, in three steps: a moving average while drawing, so the live stroke
// already looks steady; a low-pass pass on release, which cancels sample-to-sample jitter; and
// Ramer-Douglas-Peucker simplification, which drops the points the curve no longer needs.
(function (DB) {
  'use strict';

  const SMOOTHING = 0.45;

  function createStroke(x, y) {
    const points = [[x, y]];
    let sx = x;
    let sy = y;
    return {
      points,
      add(px, py) {
        sx += (px - sx) * SMOOTHING;
        sy += (py - sy) * SMOOTHING;
        const last = points[points.length - 1];
        if (Math.hypot(sx - last[0], sy - last[1]) >= 0.5) points.push([sx, sy]);
      },
    };
  }

  // A [1, 2, 1] kernel. Jitter that alternates sample to sample cancels completely, and the ends stay put.
  function relax(points, passes) {
    let current = points;
    for (let pass = 0; pass < passes; pass += 1) {
      const previous = current;
      current = previous.map((p, i) => {
        if (i === 0 || i === previous.length - 1) return p;
        return [(previous[i - 1][0] + p[0] * 2 + previous[i + 1][0]) / 4, (previous[i - 1][1] + p[1] * 2 + previous[i + 1][1]) / 4];
      });
    }
    return current;
  }

  function perpendicularDistance(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
  }

  // Iterative, because a long stroke could overflow the call stack if this recursed.
  function simplify(points, tolerance) {
    if (points.length < 3) return points.slice();
    const keep = new Array(points.length).fill(false);
    keep[0] = true;
    keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop();
      let worst = 0;
      let index = -1;
      for (let i = first + 1; i < last; i += 1) {
        const d = perpendicularDistance(points[i], points[first], points[last]);
        if (d > worst) { worst = d; index = i; }
      }
      if (worst > tolerance && index > 0) {
        keep[index] = true;
        stack.push([first, index], [index, last]);
      }
    }
    return points.filter((_, i) => keep[i]);
  }

  DB.smoothing = { createStroke, relax, simplify };
})(window.DB);

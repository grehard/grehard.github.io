// Connector binding and routing. A bound endpoint stores a shape id and a side, never a position,
// so its coordinates are always derived from the shape it is attached to.
(function (DB) {
  'use strict';
  const { rotatePoint, center, BINDABLE, hitShape } = DB.geometry;
  const { round } = DB.util;

  const NORMALS = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
  const SIDES = Object.keys(NORMALS);
  const STUB = 20;

  function normalOf(shape, side) {
    const [nx, ny] = NORMALS[side];
    return rotatePoint(nx, ny, 0, 0, shape.rotation);
  }

  function anchor(shape, side) {
    const c = center(shape);
    const [nx, ny] = NORMALS[side];
    const p = rotatePoint(c.x + (nx * shape.w) / 2, c.y + (ny * shape.h) / 2, c.x, c.y, shape.rotation);
    const n = normalOf(shape, side);
    return { x: p.x, y: p.y, nx: n.x, ny: n.y };
  }

  // The side whose outward normal points most directly at the target. Ties favor horizontal sides.
  function autoSide(shape, tx, ty) {
    const c = center(shape);
    const dx = tx - c.x;
    const dy = ty - c.y;
    let best = 'e';
    let bestDot = -Infinity;
    SIDES.forEach((side) => {
      const n = normalOf(shape, side);
      const dot = n.x * dx + n.y * dy;
      if (dot > bestDot + 1e-9) { bestDot = dot; best = side; }
    });
    return best;
  }

  const unit = (v) => (v > 0 ? 1 : -1);

  function travelAxis(end, other) {
    if (end.nx || end.ny) {
      return Math.abs(end.nx) >= Math.abs(end.ny) ? { x: unit(end.nx), y: 0 } : { x: 0, y: unit(end.ny) };
    }
    const dx = other.x - end.x;
    const dy = other.y - end.y;
    return Math.abs(dx) >= Math.abs(dy) ? { x: unit(dx || 1), y: 0 } : { x: 0, y: unit(dy || 1) };
  }

  function routeParallel(a, da, b, db) {
    if (da.x === -db.x && (b.x - a.x) * da.x > 0) {
      const mid = (a.x + b.x) / 2;
      return [[a.x, a.y], [mid, a.y], [mid, b.y], [b.x, b.y]];
    }
    const ax = a.x + da.x * STUB;
    const bx = b.x + db.x * STUB;
    if (da.x === db.x) {
      const extreme = da.x > 0 ? Math.max(ax, bx) : Math.min(ax, bx);
      return [[a.x, a.y], [extreme, a.y], [extreme, b.y], [b.x, b.y]];
    }
    const midY = (a.y + b.y) / 2;
    return [[a.x, a.y], [ax, a.y], [ax, midY], [bx, midY], [bx, b.y], [b.x, b.y]];
  }

  function routeCorner(a, da, b, db) {
    if ((b.x - a.x) * da.x > 0 && (a.y - b.y) * db.y > 0) return [[a.x, a.y], [b.x, a.y], [b.x, b.y]];
    const ax = a.x + da.x * STUB;
    const by = b.y + db.y * STUB;
    return [[a.x, a.y], [ax, a.y], [ax, by], [b.x, by], [b.x, b.y]];
  }

  const swapPoint = (p) => ({ x: p.y, y: p.x });
  const swapList = (list) => list.map(([x, y]) => [y, x]);

  // Vertical cases swap x and y, so only the horizontal variants need writing out.
  function elbow(a, b) {
    const da = travelAxis(a, b);
    const db = travelAxis(b, a);
    if (da.x && db.x) return routeParallel(a, da, b, db);
    if (da.y && db.y) return swapList(routeParallel(swapPoint(a), swapPoint(da), swapPoint(b), swapPoint(db)));
    if (da.x) return routeCorner(a, da, b, db);
    return swapList(routeCorner(swapPoint(a), swapPoint(da), swapPoint(b), swapPoint(db)));
  }

  function tidy(points) {
    const rounded = points.map(([x, y]) => [round(x), round(y)]);
    const out = [];
    rounded.forEach((p) => {
      const last = out[out.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) return;
      const prev = out[out.length - 2];
      if (prev && ((prev[0] === last[0] && last[0] === p[0]) || (prev[1] === last[1] && last[1] === p[1]))) out.pop();
      out.push(p);
    });
    return out.length >= 2 ? out : [rounded[0], rounded[rounded.length - 1]];
  }

  function endpointState(binding, freePoint, otherCenter, doc) {
    const shape = binding && doc.shapes.get(binding.id);
    if (!shape) return { x: freePoint[0], y: freePoint[1], nx: 0, ny: 0, binding: null };
    const side = binding.side === 'auto' ? autoSide(shape, otherCenter.x, otherCenter.y) : binding.side;
    return { ...anchor(shape, side), binding };
  }

  // Recomputes a connector from its bindings and returns the updated shape.
  function resolve(line, doc) {
    const firstPoint = line.points[0];
    const lastPoint = line.points[line.points.length - 1];
    const startShape = line.start && doc.shapes.get(line.start.id);
    const endShape = line.end && doc.shapes.get(line.end.id);
    const startCenter = startShape ? center(startShape) : { x: firstPoint[0], y: firstPoint[1] };
    const endCenter = endShape ? center(endShape) : { x: lastPoint[0], y: lastPoint[1] };
    const a = endpointState(line.start, firstPoint, endCenter, doc);
    const b = endpointState(line.end, lastPoint, startCenter, doc);
    const points = tidy(line.route === 'elbow' ? elbow(a, b) : [[a.x, a.y], [b.x, b.y]]);
    return { ...line, points, start: a.binding, end: b.binding };
  }

  // Finds what a dragged endpoint would attach to: the topmost shape under the point, plus a pinned
  // side when the point is close to one of the four anchors.
  function findTarget(doc, x, y, zoom, excludeId) {
    const reach = 10 / zoom;
    const candidates = doc.spatial.query({ x: x - reach, y: y - reach, w: reach * 2, h: reach * 2 })
      .sort((p, q) => doc.zIndex.get(q) - doc.zIndex.get(p));
    for (let i = 0; i < candidates.length; i += 1) {
      const shape = doc.shapes.get(candidates[i]);
      if (shape && !shape.locked && shape.id !== excludeId && BINDABLE.has(shape.type) && hitShape(shape, x, y, reach)) {
        let side = 'auto';
        SIDES.forEach((candidate) => {
          const p = anchor(shape, candidate);
          if (Math.hypot(p.x - x, p.y - y) <= 14 / zoom) side = candidate;
        });
        return { shape, side };
      }
    }
    return null;
  }

  DB.connectors = { SIDES, anchor, autoSide, elbow, resolve, findTarget };
})(window.DB);

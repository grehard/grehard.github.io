// Pure geometry: bounds, rotation, hit testing and the path data shared by canvas and SVG export.
(function (DB) {
  'use strict';
  const { round } = DB.util;

  const LINE_TYPES = new Set(['line', 'arrow']);
  const BOX_TYPES = new Set(['rect', 'ellipse', 'diamond', 'text', 'sticky', 'pen']);
  const BINDABLE = new Set(['rect', 'ellipse', 'diamond', 'text', 'sticky']);
  const TEXT_TYPES = new Set(['rect', 'ellipse', 'diamond', 'text', 'sticky', 'line', 'arrow']);
  const isLine = (s) => LINE_TYPES.has(s.type);

  function rotatePoint(x, y, cx, cy, degrees) {
    if (!degrees) return { x, y };
    const a = (degrees * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const dx = x - cx;
    const dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

  function normalizeAngle(degrees) {
    const n = ((degrees % 360) + 360) % 360;
    const r = Math.round(n * 1000) / 1000;
    return r === 360 ? 0 : r;
  }

  function pointsBounds(points) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    points.forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function corners(s) {
    const c = center(s);
    return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]]
      .map(([x, y]) => rotatePoint(x, y, c.x, c.y, s.rotation))
      .map((p) => [p.x, p.y]);
  }

  // Shapes are immutable, so bounds can be cached against the object itself.
  const boundsCache = new WeakMap();
  function aabb(s) {
    let box = boundsCache.get(s);
    if (!box) {
      if (isLine(s)) box = pointsBounds(s.points);
      else box = s.rotation ? pointsBounds(corners(s)) : { x: s.x, y: s.y, w: s.w, h: s.h };
      boundsCache.set(s, box);
    }
    return box;
  }

  function unionBounds(shapes) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    shapes.forEach((s) => {
      const b = aabb(s);
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    });
    return shapes.length ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
  }

  const rectsOverlap = (a, b) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
  const rectContains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distToPolyline(px, py, points, offsetX, offsetY) {
    const ox = offsetX || 0;
    const oy = offsetY || 0;
    if (points.length === 1) return Math.hypot(px - points[0][0] - ox, py - points[0][1] - oy);
    let best = Infinity;
    for (let i = 1; i < points.length; i += 1) {
      const d = distToSegment(px, py, points[i - 1][0] + ox, points[i - 1][1] + oy, points[i][0] + ox, points[i][1] + oy);
      if (d < best) best = d;
    }
    return best;
  }

  // An unfilled shape with no text is only hit on its outline, so you can click through a frame.
  function isSolid(s) {
    return s.type === 'text' || s.type === 'sticky' || s.fill !== 'none' || !!s.text;
  }

  function hitBox(s, lx, ly, tol) {
    const rx = s.w / 2;
    const ry = s.h / 2;
    const dx = Math.abs(lx - (s.x + rx));
    const dy = Math.abs(ly - (s.y + ry));
    const solid = isSolid(s);
    if (s.type === 'rect' || s.type === 'text' || s.type === 'sticky') {
      if (dx > rx + tol || dy > ry + tol) return false;
      return solid || dx >= rx - tol || dy >= ry - tol;
    }
    const value = s.type === 'ellipse'
      ? Math.hypot(dx / Math.max(rx, 0.5), dy / Math.max(ry, 0.5))
      : dx / Math.max(rx, 0.5) + dy / Math.max(ry, 0.5);
    const band = tol / Math.max(Math.min(rx, ry), 0.5);
    return value <= 1 + band && (solid || value >= 1 - band);
  }

  function hitShape(s, px, py, tol) {
    const reach = tol + (s.width || 0) / 2;
    if (isLine(s)) return distToPolyline(px, py, s.points) <= reach;
    const c = center(s);
    const local = rotatePoint(px, py, c.x, c.y, -s.rotation);
    if (s.type === 'pen') return distToPolyline(local.x, local.y, s.points, s.x, s.y) <= reach;
    return hitBox(s, local.x, local.y, reach);
  }

  function segmentHitsRect(ax, ay, bx, by, r) {
    const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inside(ax, ay) || inside(bx, by)) return true;
    const edges = [[r.x, r.y, r.x + r.w, r.y], [r.x + r.w, r.y, r.x + r.w, r.y + r.h], [r.x + r.w, r.y + r.h, r.x, r.y + r.h], [r.x, r.y + r.h, r.x, r.y]];
    return edges.some(([cx, cy, dx, dy]) => {
      const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (d === 0) return false;
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    });
  }

  // Crossing selection: bounds overlap is enough for boxes; lines need a segment test to avoid false hits.
  function touchesRect(s, rect) {
    if (!rectsOverlap(aabb(s), rect)) return false;
    if (!isLine(s)) return true;
    for (let i = 1; i < s.points.length; i += 1) {
      const [ax, ay] = s.points[i - 1];
      const [bx, by] = s.points[i];
      if (segmentHitsRect(ax, ay, bx, by, rect)) return true;
    }
    return false;
  }

  const num = (v) => String(round(v));

  function polylineData(points) {
    return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`).join(' ');
  }

  // Arrow shafts stop inside the head, so a thick line never blunts the tip.
  function arrowParts(s) {
    const pts = s.points;
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const length = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]) || 1;
    const size = Math.min(8 + s.width * 2.5, Math.max(length * 0.9, 6));
    const ux = (tip[0] - prev[0]) / length;
    const uy = (tip[1] - prev[1]) / length;
    const half = size * 0.42;
    const base = [tip[0] - ux * size, tip[1] - uy * size];
    const head = [tip, [base[0] - uy * half, base[1] + ux * half], [base[0] + uy * half, base[1] - ux * half]];
    const shaft = pts.slice(0, -1).concat([[tip[0] - ux * size * 0.8, tip[1] - uy * size * 0.8]]);
    return { shaft, head };
  }

  // Pen strokes render as quadratic curves through segment midpoints, which hides the sampled corners.
  function penData(s) {
    const pts = s.points.map(([x, y]) => [x + s.x, y + s.y]);
    if (pts.length < 3) return polylineData(pts.length === 1 ? [pts[0], pts[0]] : pts);
    let d = `M${num(pts[0][0])} ${num(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ` Q${num(pts[i][0])} ${num(pts[i][1])} ${num(mx)} ${num(my)}`;
    }
    const last = pts[pts.length - 1];
    return `${d} L${num(last[0])} ${num(last[1])}`;
  }

  function pathData(s) {
    const { x, y, w, h } = s;
    switch (s.type) {
      case 'ellipse':
        return `M${num(x)} ${num(y + h / 2)} A${num(w / 2)} ${num(h / 2)} 0 1 1 ${num(x + w)} ${num(y + h / 2)} A${num(w / 2)} ${num(h / 2)} 0 1 1 ${num(x)} ${num(y + h / 2)} Z`;
      case 'diamond':
        return `M${num(x + w / 2)} ${num(y)} L${num(x + w)} ${num(y + h / 2)} L${num(x + w / 2)} ${num(y + h)} L${num(x)} ${num(y + h / 2)} Z`;
      case 'pen':
        return penData(s);
      case 'line':
        return polylineData(s.points);
      case 'arrow':
        return polylineData(arrowParts(s).shaft);
      default:
        return `M${num(x)} ${num(y)} H${num(x + w)} V${num(y + h)} H${num(x)} Z`;
    }
  }

  // The halfway point along a polyline's length; connector labels sit here.
  function polylineMidpoint(points) {
    const lengths = [];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const len = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      lengths.push(len);
      total += len;
    }
    let remaining = total / 2;
    for (let i = 0; i < lengths.length; i += 1) {
      if (remaining <= lengths[i] && lengths[i] > 0) {
        const t = remaining / lengths[i];
        return { x: points[i][0] + (points[i + 1][0] - points[i][0]) * t, y: points[i][1] + (points[i + 1][1] - points[i][1]) * t };
      }
      remaining -= lengths[i];
    }
    return { x: points[0][0], y: points[0][1] };
  }

  DB.geometry = {
    LINE_TYPES, BOX_TYPES, BINDABLE, TEXT_TYPES, isLine, rotatePoint, center, normalizeAngle, pointsBounds, corners, aabb, unionBounds,
    rectsOverlap, rectContains, distToPolyline, hitShape, touchesRect, arrowParts, pathData, polylineMidpoint, num,
  };
})(window.DB);

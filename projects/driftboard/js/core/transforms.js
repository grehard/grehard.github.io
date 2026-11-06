// Move, resize and rotate. Each function takes the shape as it was when the gesture began and returns
// the new shape, so a long drag never accumulates rounding error.
(function (DB) {
  'use strict';
  const { rotatePoint, center, normalizeAngle, isLine } = DB.geometry;
  const { round, clamp } = DB.util;

  const MIN_SIZE = 4;
  const MIN_SCALE = 0.02;
  const MIN_FONT = 6;
  const MAX_FONT = 200;

  function translate(s, dx, dy) {
    if (isLine(s)) return { ...s, points: s.points.map(([x, y]) => [round(x + dx), round(y + dy)]) };
    return { ...s, x: round(s.x + dx), y: round(s.y + dy) };
  }

  function withSize(s, x, y, w, h) {
    const next = { ...s, x: round(x), y: round(y), w: round(w), h: round(h) };
    if (s.type === 'pen' && s.w > 0 && s.h > 0) {
      const sx = w / s.w;
      const sy = h / s.h;
      next.points = s.points.map(([px, py]) => [round(px * sx), round(py * sy)]);
    }
    if (s.type === 'text') next.auto = false;
    return next;
  }

  function applyAspect(edges, handle, ratio) {
    const e = edges;
    const horizontal = handle.includes('e') || handle.includes('w');
    const vertical = handle.includes('n') || handle.includes('s');
    let w = e.x2 - e.x1;
    let h = e.y2 - e.y1;
    if (horizontal && vertical) {
      if (w / ratio > h) h = w / ratio; else w = h * ratio;
      if (handle.includes('w')) e.x1 = e.x2 - w; else e.x2 = e.x1 + w;
      if (handle.includes('n')) e.y1 = e.y2 - h; else e.y2 = e.y1 + h;
    } else if (horizontal) {
      const mid = (e.y1 + e.y2) / 2;
      h = w / ratio;
      e.y1 = mid - h / 2;
      e.y2 = mid + h / 2;
    } else {
      const mid = (e.x1 + e.x2) / 2;
      w = h * ratio;
      e.x1 = mid - w / 2;
      e.x2 = mid + w / 2;
    }
  }

  // Resizes along the shape's own axes while holding the opposite handle still in world space.
  function resizeBox(s, handle, px, py, keepAspect) {
    const c = center(s);
    const local = rotatePoint(px, py, c.x, c.y, -s.rotation);
    const e = { x1: s.x, y1: s.y, x2: s.x + s.w, y2: s.y + s.h };
    if (handle.includes('e')) e.x2 = Math.max(local.x, e.x1 + MIN_SIZE);
    if (handle.includes('w')) e.x1 = Math.min(local.x, e.x2 - MIN_SIZE);
    if (handle.includes('s')) e.y2 = Math.max(local.y, e.y1 + MIN_SIZE);
    if (handle.includes('n')) e.y1 = Math.min(local.y, e.y2 - MIN_SIZE);
    if (keepAspect && s.h > 0) applyAspect(e, handle, s.w / s.h);
    const anchorX = handle.includes('w') ? s.x + s.w : handle.includes('e') ? s.x : c.x;
    const anchorY = handle.includes('n') ? s.y + s.h : handle.includes('s') ? s.y : c.y;
    const anchorWorld = rotatePoint(anchorX, anchorY, c.x, c.y, s.rotation);
    const offset = rotatePoint((e.x1 + e.x2) / 2 - anchorX, (e.y1 + e.y2) / 2 - anchorY, 0, 0, s.rotation);
    const w = e.x2 - e.x1;
    const h = e.y2 - e.y1;
    return withSize(s, anchorWorld.x + offset.x - w / 2, anchorWorld.y + offset.y - h / 2, w, h);
  }

  // Scale factors for a selection frame's handle dragged to a point, plus the fixed anchor.
  function frameScale(frame, handle, px, py, uniform) {
    const anchorX = handle.includes('w') ? frame.x + frame.w : handle.includes('e') ? frame.x : frame.x + frame.w / 2;
    const anchorY = handle.includes('n') ? frame.y + frame.h : handle.includes('s') ? frame.y : frame.y + frame.h / 2;
    const horizontal = handle.includes('e') || handle.includes('w');
    const vertical = handle.includes('n') || handle.includes('s');
    let sx = 1;
    let sy = 1;
    if (handle.includes('e')) sx = (px - anchorX) / Math.max(frame.w, 1);
    if (handle.includes('w')) sx = (anchorX - px) / Math.max(frame.w, 1);
    if (handle.includes('s')) sy = (py - anchorY) / Math.max(frame.h, 1);
    if (handle.includes('n')) sy = (anchorY - py) / Math.max(frame.h, 1);
    if (uniform) {
      const k = horizontal && vertical ? Math.max(sx, sy) : (horizontal ? sx : sy);
      sx = k;
      sy = k;
    }
    return { sx: Math.max(sx, MIN_SCALE), sy: Math.max(sy, MIN_SCALE), anchorX, anchorY };
  }

  function scaleShape(s, scale) {
    const { sx, sy, anchorX, anchorY } = scale;
    if (isLine(s)) {
      return { ...s, points: s.points.map(([x, y]) => [round(anchorX + (x - anchorX) * sx), round(anchorY + (y - anchorY) * sy)]) };
    }
    const c = center(s);
    const cx = anchorX + (c.x - anchorX) * sx;
    const cy = anchorY + (c.y - anchorY) * sy;
    const w = Math.max(s.w * sx, 1);
    const h = Math.max(s.h * sy, 1);
    const next = withSize(s, cx - w / 2, cy - h / 2, w, h);
    if (sx === sy) next.fontSize = clamp(round(s.fontSize * sx), MIN_FONT, MAX_FONT);
    return next;
  }

  function rotateShape(s, cx, cy, degrees) {
    if (isLine(s)) {
      return { ...s, points: s.points.map(([x, y]) => { const p = rotatePoint(x, y, cx, cy, degrees); return [round(p.x), round(p.y)]; }) };
    }
    const c = center(s);
    const p = rotatePoint(c.x, c.y, cx, cy, degrees);
    return { ...s, x: round(p.x - s.w / 2), y: round(p.y - s.h / 2), rotation: normalizeAngle(s.rotation + degrees) };
  }

  // A connector dragged with a selection stays attached only to shapes inside that selection.
  function detachOutside(line, movingIds) {
    let next = line;
    if (line.start && !movingIds.has(line.start.id)) next = { ...next, start: null };
    if (line.end && !movingIds.has(line.end.id)) next = { ...next, end: null };
    return next;
  }

  // Applies a per-shape transform to a snapshot inside a transaction. Boxes go first so that any
  // connector resolving against them sees their final position.
  function applyToSnapshot(tx, snapshot, fn) {
    const movingIds = new Set(snapshot.map((s) => s.id));
    snapshot.filter((s) => !isLine(s)).forEach((s) => tx.set(fn(s)));
    snapshot.filter(isLine).forEach((s) => {
      tx.set(DB.connectors.resolve(detachOutside(fn(s), movingIds), tx.doc));
    });
    tx.flush();
  }

  DB.transforms = { translate, resizeBox, frameScale, scaleShape, rotateShape, applyToSnapshot, MIN_SIZE, MIN_FONT, MAX_FONT };
})(window.DB);

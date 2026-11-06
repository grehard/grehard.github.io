// The selection frame and its handles, in screen space. The overlay draws them and input picks them.
(function (DB) {
  'use strict';
  const { rotatePoint, isLine, center, unionBounds, aabb } = DB.geometry;

  const ROTATE_OFFSET = 24;
  const BOX_HANDLES = [['nw', -1, -1], ['n', 0, -1], ['ne', 1, -1], ['e', 1, 0], ['se', 1, 1], ['s', 0, 1], ['sw', -1, 1], ['w', -1, 0]];
  const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
  const BASE_ANGLE = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };

  // Returns what the selection frame is: one line (endpoints), one box (rotated frame), or several (axis-aligned union).
  function frame(doc, override) {
    if (!doc || doc.selection.size === 0) return null;
    const shapes = [];
    doc.selection.forEach((id) => { const s = doc.shapes.get(id); if (s) shapes.push(s); });
    if (!shapes.length) return null;
    const locked = shapes.every((s) => s.locked);
    if (shapes.length === 1 && isLine(shapes[0])) return { kind: 'line', shape: shapes[0], locked };
    if (shapes.length === 1) {
      const s = shapes[0];
      const c = center(s);
      return { kind: 'box', shape: s, cx: c.x, cy: c.y, w: s.w, h: s.h, rotation: s.rotation, locked };
    }
    if (override) return { kind: 'multi', shapes, ...override, locked };
    const b = unionBounds(shapes);
    return { kind: 'multi', shapes, cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, rotation: 0, locked };
  }

  function framePoint(f, ux, uy, camera) {
    const p = rotatePoint(f.cx + (ux * f.w) / 2, f.cy + (uy * f.h) / 2, f.cx, f.cy, f.rotation);
    return camera.toScreen(p.x, p.y);
  }

  function frameCorners(f, camera) {
    if (f.kind === 'line') {
      const b = aabb(f.shape);
      return [camera.toScreen(b.x, b.y), camera.toScreen(b.x + b.w, b.y), camera.toScreen(b.x + b.w, b.y + b.h), camera.toScreen(b.x, b.y + b.h)];
    }
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([ux, uy]) => framePoint(f, ux, uy, camera));
  }

  function list(f, camera) {
    if (f.locked) return [];
    if (f.kind === 'line') {
      const pts = f.shape.points;
      const a = pts[0];
      const b = pts[pts.length - 1];
      return [{ id: 'start', ...camera.toScreen(a[0], a[1]) }, { id: 'end', ...camera.toScreen(b[0], b[1]) }];
    }
    const widthOnScreen = f.w * camera.zoom;
    const heightOnScreen = f.h * camera.zoom;
    const handles = [];
    BOX_HANDLES.forEach(([id, ux, uy]) => {
      if (id.length === 1 && ((ux !== 0 && heightOnScreen < 28) || (uy !== 0 && widthOnScreen < 28))) return;
      handles.push({ id, ...framePoint(f, ux, uy, camera) });
    });
    const base = framePoint(f, 0, -1, camera);
    const tip = rotatePoint(0, -ROTATE_OFFSET, 0, 0, f.rotation);
    handles.push({ id: 'rotate', x: base.x + tip.x, y: base.y + tip.y, base });
    return handles;
  }

  function pick(doc, camera, sx, sy, radius) {
    const f = frame(doc);
    if (!f) return null;
    const handles = list(f, camera);
    let best = null;
    let bestDistance = radius;
    handles.forEach((h) => {
      const d = Math.hypot(h.x - sx, h.y - sy);
      if (d <= bestDistance) { best = h; bestDistance = d; }
    });
    return best ? { handle: best.id, frame: f } : null;
  }

  function cursorFor(id, rotation) {
    if (id === 'rotate') return 'grab';
    if (id === 'start' || id === 'end') return 'move';
    const angle = (BASE_ANGLE[id] + (rotation || 0) + 360) % 180;
    return CURSORS[Math.round(angle / 45) % 4];
  }

  DB.handles = { frame, frameCorners, list, pick, cursorFor };
})(window.DB);

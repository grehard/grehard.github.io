// Grid snapping and smart alignment guides. Guides win over the grid, one axis at a time.
(function (DB) {
  'use strict';
  const { aabb, isLine } = DB.geometry;
  const { round } = DB.util;

  const GRID = 20;
  const GUIDE_PX = 6;
  const MAX_TARGETS = 300;

  const snapToGrid = (v) => Math.round(v / GRID) * GRID;

  // Collects edges and centers of the visible shapes that are not being dragged.
  function collectTargets(doc, camera, excludeIds) {
    const xs = [];
    const ys = [];
    doc.spatial.query(camera.visibleRect()).slice(0, MAX_TARGETS).forEach((id) => {
      if (excludeIds.has(id)) return;
      const s = doc.shapes.get(id);
      if (!s || isLine(s)) return;
      const b = aabb(s);
      [b.x, b.x + b.w / 2, b.x + b.w].forEach((v) => xs.push({ v, from: b.y, to: b.y + b.h }));
      [b.y, b.y + b.h / 2, b.y + b.h].forEach((v) => ys.push({ v, from: b.x, to: b.x + b.w }));
    });
    return { xs, ys };
  }

  function closest(values, targets, threshold) {
    let best = null;
    values.forEach((value) => {
      targets.forEach((t) => {
        const delta = t.v - value;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target: t };
      });
    });
    return best;
  }

  function buildGuides(xHit, yHit, rect) {
    const guides = [];
    if (xHit) guides.push({ axis: 'x', at: xHit.target.v, from: Math.min(xHit.target.from, rect.y), to: Math.max(xHit.target.to, rect.y + rect.h) });
    if (yHit) guides.push({ axis: 'y', at: yHit.target.v, from: Math.min(yHit.target.from, rect.x), to: Math.max(yHit.target.to, rect.x + rect.w) });
    return guides;
  }

  // Adjusts a proposed rectangle. Returns the correction to apply and any guides to draw.
  function snapRect(rect, targets, settings, zoom) {
    const threshold = GUIDE_PX / zoom;
    const useGuides = settings.guides && targets;
    const xHit = useGuides ? closest([rect.x, rect.x + rect.w / 2, rect.x + rect.w], targets.xs, threshold) : null;
    const yHit = useGuides ? closest([rect.y, rect.y + rect.h / 2, rect.y + rect.h], targets.ys, threshold) : null;
    let dx = xHit ? xHit.delta : 0;
    let dy = yHit ? yHit.delta : 0;
    if (!xHit && settings.snapGrid) dx = snapToGrid(rect.x) - rect.x;
    if (!yHit && settings.snapGrid) dy = snapToGrid(rect.y) - rect.y;
    return { dx, dy, guides: buildGuides(xHit, yHit, { x: rect.x + dx, y: rect.y + dy, w: rect.w, h: rect.h }) };
  }

  function snapPoint(x, y, targets, settings, zoom) {
    const threshold = GUIDE_PX / zoom;
    const useGuides = settings.guides && targets;
    const xHit = useGuides ? closest([x], targets.xs, threshold) : null;
    const yHit = useGuides ? closest([y], targets.ys, threshold) : null;
    let sx = x;
    let sy = y;
    if (xHit) sx = x + xHit.delta; else if (settings.snapGrid) sx = snapToGrid(x);
    if (yHit) sy = y + yHit.delta; else if (settings.snapGrid) sy = snapToGrid(y);
    return { x: round(sx), y: round(sy), guides: buildGuides(xHit, yHit, { x: sx, y: sy, w: 0, h: 0 }) };
  }

  DB.snapping = { GRID, snapToGrid, collectTargets, snapRect, snapPoint };
})(window.DB);

// Everything drawn above the shapes: selection frames, handles, guides, marquee, pen preview, rulers.
(function (DB) {
  'use strict';
  const { isLine, center, unionBounds } = DB.geometry;
  const { CANVAS, resolve } = DB.palette;

  const RULER = 20;
  const RULER_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const MIN_RULER_WIDTH = 700;

  function outline(ctx, s, camera, dpr, color, width) {
    ctx.save();
    ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.ox, dpr * camera.oy);
    if (!isLine(s) && s.rotation) {
      const c = center(s);
      ctx.translate(c.x, c.y);
      ctx.rotate((s.rotation * Math.PI) / 180);
      ctx.translate(-c.x, -c.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width / camera.zoom;
    ctx.setLineDash([]);
    if (s.type === 'text' || s.type === 'sticky') ctx.strokeRect(s.x, s.y, s.w, s.h);
    else ctx.stroke(DB.painter.pathOf(s));
    ctx.restore();
  }

  function framePath(ctx, frame, camera) {
    const corners = DB.handles.frameCorners(frame, camera);
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }

  function paintHandles(ctx, frame, app, colors) {
    const handles = DB.handles.list(frame, app.camera);
    const rotate = handles.find((h) => h.id === 'rotate');
    if (rotate) {
      ctx.beginPath();
      ctx.moveTo(rotate.base.x, rotate.base.y);
      ctx.lineTo(rotate.x, rotate.y);
      ctx.stroke();
    }
    handles.forEach((h) => {
      ctx.beginPath();
      if (h.id === 'rotate' || h.id === 'start' || h.id === 'end') ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      else ctx.rect(h.x - 4, h.y - 4, 8, 8);
      ctx.fillStyle = colors.handleFill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colors.accent;
      ctx.stroke();
    });
  }

  function paintLockBadge(ctx, frame, camera, colors) {
    const corners = DB.handles.frameCorners(frame, camera);
    const { x, y } = corners[1];
    ctx.fillStyle = colors.muted;
    ctx.fillRect(x + 4, y - 3, 10, 8);
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 9, y - 3, 3, Math.PI, 0);
    ctx.stroke();
  }

  function paintSelection(ctx, app, colors) {
    const doc = DB.boards.current();
    const frame = DB.handles.frame(doc, app.transient.frameOverride);
    if (!frame) return;
    const selected = DB.actions.selectedShapes();
    const { camera } = app;
    const dpr = app.renderer.dpr;
    if (selected.length > 1) selected.forEach((s) => outline(ctx, s, camera, dpr, colors.accent, 1));
    if (frame.kind === 'line') {
      outline(ctx, frame.shape, camera, dpr, colors.accent, 1);
    } else {
      framePath(ctx, frame, camera);
      ctx.strokeStyle = frame.locked ? colors.muted : colors.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash(frame.kind === 'multi' ? [4, 3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (frame.locked) paintLockBadge(ctx, frame, camera, colors);
    else {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      paintHandles(ctx, frame, app, colors);
    }
  }

  function paintAnchors(ctx, shape, app, colors, activeSide) {
    DB.connectors.SIDES.forEach((side) => {
      const a = DB.connectors.anchor(shape, side);
      const p = app.camera.toScreen(a.x, a.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, side === activeSide ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = side === activeSide ? colors.accent : colors.handleFill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colors.accent;
      ctx.stroke();
    });
  }

  function paintGuides(ctx, guides, app, colors) {
    const { camera } = app;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    guides.forEach((g) => {
      const a = g.axis === 'x' ? camera.toScreen(g.at, g.from) : camera.toScreen(g.from, g.at);
      const b = g.axis === 'x' ? camera.toScreen(g.at, g.to) : camera.toScreen(g.to, g.at);
      const crisp = (v) => Math.round(v) + 0.5;
      ctx.beginPath();
      ctx.moveTo(crisp(a.x), crisp(a.y));
      ctx.lineTo(crisp(b.x), crisp(b.y));
      [a, b].forEach((p) => {
        ctx.moveTo(crisp(p.x) - 3, crisp(p.y) - 3);
        ctx.lineTo(crisp(p.x) + 3, crisp(p.y) + 3);
        ctx.moveTo(crisp(p.x) + 3, crisp(p.y) - 3);
        ctx.lineTo(crisp(p.x) - 3, crisp(p.y) + 3);
      });
      ctx.stroke();
    });
  }

  // A window selection (dragged rightward) is solid; a crossing selection (leftward) is dashed.
  function paintMarquee(ctx, marquee, app, colors) {
    const a = app.camera.toScreen(marquee.x, marquee.y);
    const w = marquee.w * app.camera.zoom;
    const h = marquee.h * app.camera.zoom;
    ctx.fillStyle = colors.accent;
    ctx.globalAlpha = 0.07;
    ctx.fillRect(a.x, a.y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash(marquee.crossing ? [5, 4] : []);
    ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
    ctx.setLineDash([]);
  }

  function paintPenPreview(ctx, pen, app) {
    const { camera } = app;
    const dpr = app.renderer.dpr;
    ctx.save();
    ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.ox, dpr * camera.oy);
    ctx.strokeStyle = resolve(pen.stroke, app.theme());
    ctx.globalAlpha = pen.opacity;
    ctx.lineWidth = pen.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pen.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }

  function rulerStep(zoom) {
    return RULER_STEPS.find((step) => step * zoom >= 56) || RULER_STEPS[RULER_STEPS.length - 1];
  }

  function paintRulers(ctx, app, colors) {
    const { camera } = app;
    ctx.fillStyle = colors.ruler;
    ctx.fillRect(0, 0, camera.width, RULER);
    ctx.fillRect(0, 0, RULER, camera.height);
    const selected = DB.actions.selectedShapes();
    const span = selected.length ? unionBounds(selected) : null;
    if (span) {
      const a = camera.toScreen(span.x, span.y);
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(a.x, 0, span.w * camera.zoom, RULER);
      ctx.fillRect(0, a.y, RULER, span.h * camera.zoom);
      ctx.globalAlpha = 1;
    }
    const step = rulerStep(camera.zoom);
    const start = camera.toWorld(RULER, RULER);
    ctx.strokeStyle = colors.rulerTick;
    ctx.fillStyle = colors.rulerText;
    ctx.lineWidth = 1;
    ctx.font = '10px ui-monospace, Consolas, Menlo, monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.beginPath();
    for (let x = Math.floor(start.x / step) * step; x * camera.zoom + camera.ox < camera.width; x += step) {
      const sx = Math.round(x * camera.zoom + camera.ox) + 0.5;
      if (sx < RULER) continue;
      ctx.moveTo(sx, RULER - 8);
      ctx.lineTo(sx, RULER);
      ctx.fillText(String(x), sx + 3, 10);
    }
    for (let y = Math.floor(start.y / step) * step; y * camera.zoom + camera.oy < camera.height; y += step) {
      const sy = Math.round(y * camera.zoom + camera.oy) + 0.5;
      if (sy < RULER) continue;
      ctx.moveTo(RULER - 8, sy);
      ctx.lineTo(RULER, sy);
      ctx.save();
      ctx.translate(10, sy - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(String(y), 0, 0);
      ctx.restore();
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, RULER + 0.5);
    ctx.lineTo(camera.width, RULER + 0.5);
    ctx.moveTo(RULER + 0.5, 0);
    ctx.lineTo(RULER + 0.5, camera.height);
    ctx.stroke();
  }

  function paint(app, ctx, dpr) {
    const { camera, transient: t } = app;
    const colors = CANVAS[app.theme()];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, camera.width, camera.height);
    const doc = DB.boards.current();
    if (!doc) return;
    if (t.hover && doc.shapes.has(t.hover) && !doc.selection.has(t.hover)) {
      outline(ctx, doc.shapes.get(t.hover), camera, dpr, colors.accent, 1.5);
    }
    if (t.candidates) t.candidates.forEach((id) => { const s = doc.shapes.get(id); if (s) outline(ctx, s, camera, dpr, colors.accent, 1); });
    if (t.erase) t.erase.forEach((id) => { const s = doc.shapes.get(id); if (s) outline(ctx, s, camera, dpr, colors.accent, 2.5); });
    paintSelection(ctx, app, colors);
    if (t.anchorTarget && doc.shapes.has(t.anchorTarget.id)) paintAnchors(ctx, doc.shapes.get(t.anchorTarget.id), app, colors, t.anchorTarget.side);
    if (t.pen) paintPenPreview(ctx, t.pen, app);
    if (t.guides && t.guides.length) paintGuides(ctx, t.guides, app, colors);
    if (t.marquee) paintMarquee(ctx, t.marquee, app, colors);
    if (app.settings.rulers && camera.width >= MIN_RULER_WIDTH) paintRulers(ctx, app, colors);
  }

  DB.overlay = { paint };
})(window.DB);

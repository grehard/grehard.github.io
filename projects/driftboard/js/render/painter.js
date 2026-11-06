// Draws one shape onto a 2D context. The on-screen scene and PNG export share this.
(function (DB) {
  'use strict';
  const { isLine, center, arrowParts, pathData } = DB.geometry;
  const { resolve } = DB.palette;
  const { FONT_FAMILY, layout } = DB.text;

  // Parsing path data is the slow part of a draw call, and shapes are immutable, so each keeps its Path2D.
  const pathCache = new WeakMap();
  function pathOf(s) {
    let path = pathCache.get(s);
    if (!path) {
      path = new Path2D(pathData(s));
      pathCache.set(s, path);
    }
    return path;
  }

  function dashPattern(s) {
    if (s.dash === 'dashed') return [s.width * 4, s.width * 3];
    if (s.dash === 'dotted') return [0.01, s.width * 2.5];
    return [];
  }

  function prepareStroke(ctx, s, theme) {
    ctx.strokeStyle = resolve(s.stroke, theme);
    ctx.lineWidth = s.width;
    ctx.setLineDash(dashPattern(s));
    const rounded = s.type === 'pen' || s.dash === 'dotted';
    ctx.lineCap = rounded ? 'round' : 'butt';
    ctx.lineJoin = s.type === 'pen' || isLine(s) ? 'round' : 'miter';
  }

  function paintArrowHead(ctx, s, theme) {
    const { head } = arrowParts(s);
    ctx.fillStyle = resolve(s.stroke, theme);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(head[0][0], head[0][1]);
    ctx.lineTo(head[1][0], head[1][1]);
    ctx.lineTo(head[2][0], head[2][1]);
    ctx.closePath();
    ctx.fill();
  }

  function paintLabelBackground(ctx, s, info, background) {
    const pad = 3;
    ctx.fillStyle = background;
    ctx.fillRect(info.box.x + info.box.w / 2 - info.width / 2 - pad, info.box.y - 1, info.width + pad * 2, info.height + 2);
  }

  function paintText(ctx, s, theme, background) {
    const info = layout(s);
    if (!info) return;
    if (isLine(s)) paintLabelBackground(ctx, s, info, background);
    ctx.fillStyle = resolve(s.stroke, theme);
    ctx.font = `${s.fontSize}px ${FONT_FAMILY}`;
    ctx.textAlign = info.align;
    ctx.textBaseline = 'alphabetic';
    info.lines.forEach((line) => ctx.fillText(line.text, line.x, line.y));
  }

  // opts: { theme, background, zoom, skipTextId }
  function paintShape(ctx, s, opts) {
    const { theme } = opts;
    ctx.globalAlpha = s.opacity;
    const rotated = !isLine(s) && s.rotation;
    if (rotated) {
      const c = center(s);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate((s.rotation * Math.PI) / 180);
      ctx.translate(-c.x, -c.y);
    }
    if (s.type !== 'text') {
      const path = pathOf(s);
      if (s.fill !== 'none') {
        ctx.fillStyle = resolve(s.fill, theme);
        ctx.fill(path);
      }
      if (s.type !== 'sticky') {
        prepareStroke(ctx, s, theme);
        ctx.stroke(path);
      }
      if (s.type === 'arrow') paintArrowHead(ctx, s, theme);
    }
    // Text under about 2.5 screen pixels is unreadable, and skipping it is the largest saving when zoomed out.
    if (s.text && s.fontSize * opts.zoom >= 2.5 && s.id !== opts.skipTextId) paintText(ctx, s, theme, opts.background);
    if (rotated) ctx.restore();
    ctx.globalAlpha = 1;
  }

  DB.painter = { paintShape, pathOf };
})(window.DB);

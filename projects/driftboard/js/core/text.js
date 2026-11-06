// Text layout shared by the canvas renderer, the inline editor and SVG export, so all three wrap alike.
(function (DB) {
  'use strict';

  const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const LINE_HEIGHT = 1.3;
  const UNBOUNDED = 1e7;
  const measureCtx = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();

  function measureWidth(text, fontSize) {
    const key = `${fontSize}|${text}`;
    let width = widthCache.get(key);
    if (width === undefined) {
      measureCtx.font = `${fontSize}px ${FONT_FAMILY}`;
      width = measureCtx.measureText(text).width;
      if (widthCache.size > 8000) widthCache.clear();
      widthCache.set(key, width);
    }
    return width;
  }

  function breakLongWord(word, fontSize, maxWidth, out) {
    let chunk = '';
    Array.from(word).forEach((ch) => {
      if (chunk && measureWidth(chunk + ch, fontSize) > maxWidth) { out.push(chunk); chunk = ''; }
      chunk += ch;
    });
    return chunk;
  }

  function wrap(text, fontSize, maxWidth) {
    const lines = [];
    String(text).split('\n').forEach((paragraph) => {
      if (!paragraph) { lines.push(''); return; }
      let current = '';
      paragraph.split(' ').forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (measureWidth(candidate, fontSize) <= maxWidth) { current = candidate; return; }
        if (current) lines.push(current);
        current = measureWidth(word, fontSize) > maxWidth ? breakLongWord(word, fontSize, maxWidth, lines) : word;
      });
      lines.push(current);
    });
    return lines;
  }

  function lineLabelBox(s) {
    const mid = DB.geometry.polylineMidpoint(s.points);
    const width = Math.min(240, Math.max(60, measureWidth(s.text || '', s.fontSize) + 4));
    const height = Math.max(wrap(s.text || ' ', s.fontSize, width).length, 1) * s.fontSize * LINE_HEIGHT;
    return { x: mid.x - width / 2, y: mid.y - height / 2, w: width, h: height, align: 'center', valign: 'middle' };
  }

  // The inner box text flows in, in the shape's unrotated coordinates.
  function textBox(s) {
    if (DB.geometry.isLine(s)) return lineLabelBox(s);
    if (s.type === 'text') return { x: s.x, y: s.y, w: s.w, h: s.h, align: 'left', valign: 'top' };
    if (s.type === 'sticky') {
      return { x: s.x + 12, y: s.y + 12, w: Math.max(s.w - 24, 8), h: Math.max(s.h - 24, 8), align: 'left', valign: 'top' };
    }
    let insetX = 8;
    let insetY = 6;
    if (s.type === 'ellipse') { insetX = s.w * 0.146 + 2; insetY = s.h * 0.146 + 2; }
    if (s.type === 'diamond') { insetX = s.w * 0.22; insetY = s.h * 0.22; }
    return { x: s.x + insetX, y: s.y + insetY, w: Math.max(s.w - insetX * 2, 8), h: Math.max(s.h - insetY * 2, 8), align: 'center', valign: 'middle' };
  }

  const layoutCache = new WeakMap();

  // Resolves a shape's text into lines with a baseline for each, ready to draw.
  function layout(s) {
    if (!s.text) return null;
    let result = layoutCache.get(s);
    if (result) return result;
    const box = textBox(s);
    const maxWidth = s.type === 'text' && s.auto ? UNBOUNDED : box.w;
    const lines = wrap(s.text, s.fontSize, maxWidth);
    const lineHeight = s.fontSize * LINE_HEIGHT;
    const blockHeight = lines.length * lineHeight;
    const top = box.valign === 'middle' ? box.y + (box.h - blockHeight) / 2 : box.y;
    const x = box.align === 'center' ? box.x + box.w / 2 : box.x;
    const width = lines.reduce((max, line) => Math.max(max, measureWidth(line, s.fontSize)), 0);
    result = {
      lines: lines.map((text, i) => ({ text, x, y: top + i * lineHeight + lineHeight / 2 + s.fontSize * 0.35 })),
      align: box.align, width, height: blockHeight, lineHeight, box,
    };
    layoutCache.set(s, result);
    return result;
  }

  // Returns a shape whose box fits its text: text shapes hug it, others only ever grow taller.
  function refit(s) {
    if (DB.geometry.isLine(s) || s.type === 'pen') return s;
    if (s.type === 'text') {
      const lines = wrap(s.text || ' ', s.fontSize, s.auto ? UNBOUNDED : s.w);
      const height = lines.length * s.fontSize * LINE_HEIGHT;
      const width = s.auto ? Math.max(...lines.map((line) => measureWidth(line, s.fontSize)), s.fontSize) + 2 : s.w;
      return { ...s, w: Math.ceil(width), h: Math.ceil(height) };
    }
    if (!s.text) return s;
    const box = textBox(s);
    const needed = wrap(s.text, s.fontSize, box.w).length * s.fontSize * LINE_HEIGHT;
    return needed <= box.h ? s : { ...s, h: Math.ceil(s.h + (needed - box.h)) };
  }

  DB.text = { FONT_FAMILY, LINE_HEIGHT, measureWidth, wrap, textBox, layout, refit };
})(window.DB);

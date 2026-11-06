// PNG, SVG and JSON output. SVG is written as semantic elements (rect, ellipse, text), so the file
// stays editable in other tools, and always uses the light palette for predictable results.
(function (DB) {
  'use strict';
  const { isLine, center, unionBounds, arrowParts, pathData, num } = DB.geometry;
  const { resolve, CANVAS } = DB.palette;
  const { layout, FONT_FAMILY } = DB.text;
  const { round, slugify } = DB.util;

  const THEME = 'light';
  const PAD = 24;
  const MAX_PNG_SIDE = 8192;

  const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const color = (token) => resolve(token, THEME);

  function dashAttrs(s) {
    if (s.dash === 'dashed') return ` stroke-dasharray="${num(s.width * 4)} ${num(s.width * 3)}"`;
    if (s.dash === 'dotted') return ` stroke-dasharray="0.01 ${num(s.width * 2.5)}" stroke-linecap="round"`;
    return '';
  }

  const strokeAttrs = (s) => `stroke="${escapeXml(color(s.stroke))}" stroke-width="${num(s.width)}"${dashAttrs(s)}`;
  const fillAttr = (s) => `fill="${escapeXml(color(s.fill))}"`;

  function commonAttrs(s) {
    let attrs = '';
    if (s.opacity < 1) attrs += ` opacity="${num(s.opacity)}"`;
    if (!isLine(s) && s.rotation) {
      const c = center(s);
      attrs += ` transform="rotate(${num(s.rotation)} ${num(c.x)} ${num(c.y)})"`;
    }
    return attrs;
  }

  function textMarkup(s, background) {
    const info = layout(s);
    if (!info) return '';
    const anchor = info.align === 'center' ? ' text-anchor="middle"' : '';
    const spans = info.lines.map((line) => `<tspan x="${num(line.x)}" y="${num(line.y)}">${escapeXml(line.text)}</tspan>`).join('');
    let backing = '';
    if (isLine(s)) {
      const x = info.box.x + info.box.w / 2 - info.width / 2 - 3;
      backing = `<rect x="${num(x)}" y="${num(info.box.y - 1)}" width="${num(info.width + 6)}" height="${num(info.height + 2)}" fill="${escapeXml(background)}"/>`;
    }
    return `${backing}<text font-family="${escapeXml(FONT_FAMILY)}" font-size="${num(s.fontSize)}" fill="${escapeXml(color(s.stroke))}"${anchor}>${spans}</text>`;
  }

  function boxMarkup(s) {
    const { x, y, w, h } = s;
    if (s.type === 'rect') return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${fillAttr(s)} ${strokeAttrs(s)}/>`;
    if (s.type === 'sticky') return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${fillAttr(s)}/>`;
    if (s.type === 'ellipse') return `<ellipse cx="${num(x + w / 2)}" cy="${num(y + h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}" ${fillAttr(s)} ${strokeAttrs(s)}/>`;
    if (s.type === 'diamond') {
      return `<polygon points="${num(x + w / 2)},${num(y)} ${num(x + w)},${num(y + h / 2)} ${num(x + w / 2)},${num(y + h)} ${num(x)},${num(y + h / 2)}" ${fillAttr(s)} ${strokeAttrs(s)}/>`;
    }
    return '';
  }

  function connectorMarkup(s) {
    const first = s.points[0];
    const last = s.points[s.points.length - 1];
    let markup = `<path d="${pathData(s)}" fill="none" ${strokeAttrs(s)} stroke-linejoin="round"/>`;
    if (s.type === 'arrow') {
      const points = arrowParts(s).head.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
      markup += `<polygon points="${points}" fill="${escapeXml(color(s.stroke))}"/>`;
    }
    return `data-from="${num(first[0])},${num(first[1])}" data-to="${num(last[0])},${num(last[1])}">${markup}`;
  }

  function shapeMarkup(s, background) {
    const attrs = commonAttrs(s);
    if (isLine(s)) return `<g data-type="${s.type}"${attrs} ${connectorMarkup(s)}${textMarkup(s, background)}</g>`;
    if (s.type === 'pen') return `<path data-type="pen" d="${pathData(s)}" fill="none" ${strokeAttrs(s)} stroke-linecap="round" stroke-linejoin="round"${attrs}/>`;
    return `<g data-type="${s.type}"${attrs}>${boxMarkup(s)}${textMarkup(s, background)}</g>`;
  }

  function exportBounds(shapes) {
    const b = unionBounds(shapes);
    return { x: round(b.x - PAD), y: round(b.y - PAD), w: Math.ceil(b.w + PAD * 2), h: Math.ceil(b.h + PAD * 2) };
  }

  function toSvg(shapes, withBackground) {
    const box = exportBounds(shapes);
    const background = CANVAS[THEME].bg;
    const body = [];
    let openGroup = null;
    shapes.forEach((s) => {
      if (s.groupId !== openGroup) {
        if (openGroup) body.push('</g>');
        if (s.groupId) body.push(`<g data-group="${escapeXml(s.groupId)}">`);
        openGroup = s.groupId;
      }
      body.push(shapeMarkup(s, background));
    });
    if (openGroup) body.push('</g>');
    const backdrop = withBackground ? `<rect data-role="background" x="${num(box.x)}" y="${num(box.y)}" width="${box.w}" height="${box.h}" fill="${background}"/>\n` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(box.x)} ${num(box.y)} ${box.w} ${box.h}" width="${box.w}" height="${box.h}">\n${backdrop}${body.join('\n')}\n</svg>\n`;
  }

  function toPngBlob(shapes, scale, withBackground) {
    const box = exportBounds(shapes);
    const factor = Math.min(scale, MAX_PNG_SIDE / Math.max(box.w, box.h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(box.w * factor));
    canvas.height = Math.max(1, Math.round(box.h * factor));
    const ctx = canvas.getContext('2d');
    const background = CANVAS[THEME].bg;
    if (withBackground) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(factor, 0, 0, factor, -box.x * factor, -box.y * factor);
    const opts = { theme: THEME, background, zoom: factor, skipTextId: null };
    shapes.forEach((s) => DB.painter.paintShape(ctx, s, opts));
    return new Promise((res) => canvas.toBlob(res, 'image/png'));
  }

  function fileText(boards) {
    return JSON.stringify({ app: 'driftboard', version: DB.schema.FILE_VERSION, savedAt: new Date().toISOString(), boards }, null, 1);
  }

  function saveBoardJSON(doc) {
    const text = fileText([{ name: doc.name, view: doc.view, shapes: doc.orderedShapes() }]);
    DB.util.downloadBlob(`${slugify(doc.name)}.json`, new Blob([text], { type: 'application/json' }));
  }

  function saveAllJSON() {
    DB.boards.flush();
    DB.util.downloadBlob('driftboard-boards.json', new Blob([fileText(DB.boards.exportAll())], { type: 'application/json' }));
  }

  DB.exporter = { toSvg, toPngBlob, exportBounds, saveBoardJSON, saveAllJSON, escapeXml };
})(window.DB);

// Shape factory and validation. Everything loaded from storage or a file passes through here,
// so the rest of the app can trust a shape's fields.
(function (DB) {
  'use strict';
  const { clamp, uid, round } = DB.util;
  const { isLine, normalizeAngle } = DB.geometry;
  const { isColor } = DB.palette;

  const TYPES = new Set(['rect', 'ellipse', 'diamond', 'text', 'sticky', 'pen', 'line', 'arrow']);
  const DASHES = new Set(['solid', 'dashed', 'dotted']);
  const SIDES = new Set(['auto', 'n', 'e', 's', 'w']);
  const LIMITS = { coord: 1e7, size: 1e6, minSize: 1, width: [0.5, 40], font: [6, 200], text: 20000, name: 60, points: 20000 };
  const FILE_VERSION = 1;

  const STYLE_DEFAULTS = { stroke: 'ink', fill: 'paper', width: 2, dash: 'solid', opacity: 1, fontSize: 16 };

  function create(type, props) {
    const base = { id: uid(), type, rotation: 0, text: '', locked: false, groupId: null, ...STYLE_DEFAULTS };
    if (isLine({ type })) return { ...base, fill: 'none', fontSize: 14, points: [[0, 0], [0, 0]], start: null, end: null, route: 'straight', ...props };
    if (type === 'pen') return { ...base, fill: 'none', x: 0, y: 0, w: 1, h: 1, points: [[0, 0]], ...props };
    if (type === 'text') return { ...base, fill: 'none', x: 0, y: 0, w: 20, h: 21, auto: true, ...props };
    if (type === 'sticky') return { ...base, fill: 'ochreTint', x: 0, y: 0, w: 180, h: 160, ...props };
    return { ...base, x: 0, y: 0, w: 160, h: 100, ...props };
  }

  const finite = (v) => typeof v === 'number' && Number.isFinite(v);
  const coord = (v) => clamp(round(v), -LIMITS.coord, LIMITS.coord);
  const size = (v) => clamp(round(v), LIMITS.minSize, LIMITS.size);

  function sanitizePoints(raw) {
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > LIMITS.points) return null;
    const points = [];
    for (let i = 0; i < raw.length; i += 1) {
      const p = raw[i];
      if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1])) return null;
      points.push([coord(p[0]), coord(p[1])]);
    }
    return points;
  }

  function sanitizeBinding(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
    return { id: raw.id, side: SIDES.has(raw.side) ? raw.side : 'auto' };
  }

  function sanitizeStyle(raw, fallback) {
    return {
      stroke: isColor(raw.stroke) ? raw.stroke : fallback.stroke,
      fill: isColor(raw.fill) ? raw.fill : fallback.fill,
      width: finite(raw.width) ? clamp(raw.width, LIMITS.width[0], LIMITS.width[1]) : fallback.width,
      dash: DASHES.has(raw.dash) ? raw.dash : fallback.dash,
      opacity: finite(raw.opacity) ? clamp(raw.opacity, 0.05, 1) : fallback.opacity,
      fontSize: finite(raw.fontSize) ? clamp(raw.fontSize, LIMITS.font[0], LIMITS.font[1]) : fallback.fontSize,
    };
  }

  // Returns a clean shape, or null if the record cannot be used.
  function sanitizeShape(raw) {
    if (!raw || typeof raw !== 'object' || !TYPES.has(raw.type)) return null;
    const template = create(raw.type, {});
    const common = {
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 64) : uid(),
      type: raw.type,
      text: typeof raw.text === 'string' ? raw.text.slice(0, LIMITS.text) : '',
      locked: raw.locked === true,
      groupId: typeof raw.groupId === 'string' ? raw.groupId.slice(0, 64) : null,
      ...sanitizeStyle(raw, template),
    };
    if (isLine(raw)) {
      const points = sanitizePoints(raw.points);
      if (!points || points.length < 2) return null;
      return {
        ...common, fill: 'none', rotation: 0, points,
        start: sanitizeBinding(raw.start), end: sanitizeBinding(raw.end), route: raw.route === 'elbow' ? 'elbow' : 'straight',
      };
    }
    if (![raw.x, raw.y, raw.w, raw.h].every(finite)) return null;
    const box = {
      ...common, x: coord(raw.x), y: coord(raw.y), w: size(raw.w), h: size(raw.h),
      rotation: finite(raw.rotation) ? normalizeAngle(raw.rotation) : 0,
    };
    if (raw.type === 'pen') {
      const points = sanitizePoints(raw.points);
      return points ? { ...box, fill: 'none', points } : null;
    }
    if (raw.type === 'text') return { ...box, fill: 'none', auto: raw.auto !== false };
    return box;
  }

  // Cleans a list of shapes: drops unusable records and duplicate ids, and removes bindings to shapes
  // that are not on the board.
  function sanitizeShapes(rawList) {
    const seen = new Set();
    const shapes = [];
    let skipped = 0;
    (Array.isArray(rawList) ? rawList : []).forEach((raw) => {
      const shape = sanitizeShape(raw);
      if (!shape || seen.has(shape.id)) { skipped += 1; return; }
      seen.add(shape.id);
      shapes.push(shape);
    });
    const clean = shapes.map((s) => {
      if (!isLine(s)) return s;
      return {
        ...s,
        start: s.start && seen.has(s.start.id) && s.start.id !== s.id ? s.start : null,
        end: s.end && seen.has(s.end.id) && s.end.id !== s.id ? s.end : null,
      };
    });
    return { shapes: clean, skipped };
  }

  function sanitizeName(value, fallback) {
    const name = typeof value === 'string' ? value.trim().slice(0, LIMITS.name) : '';
    return name || fallback;
  }

  function sanitizeView(raw) {
    if (!raw || ![raw.ox, raw.oy, raw.zoom].every(finite) || raw.zoom <= 0) return null;
    return { ox: raw.ox, oy: raw.oy, zoom: clamp(raw.zoom, DB.Camera.MIN_ZOOM, DB.Camera.MAX_ZOOM) };
  }

  // Parses the text of a saved file. Throws an Error with a readable message on anything unusable.
  function parseFile(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('This file is not valid JSON.');
    }
    if (!data || typeof data !== 'object' || data.app !== 'driftboard') throw new Error('This is not a Driftboard file. The "app" field is missing.');
    if (data.version !== FILE_VERSION) throw new Error(`Unsupported file version: ${String(data.version)}.`);
    if (!Array.isArray(data.boards) || data.boards.length === 0) throw new Error('The file contains no boards.');
    return data.boards.map((board, i) => {
      if (!board || typeof board !== 'object' || !Array.isArray(board.shapes)) throw new Error(`Board ${i + 1} has no list of shapes.`);
      const { shapes, skipped } = sanitizeShapes(board.shapes);
      return { name: sanitizeName(board.name, `Imported board ${i + 1}`), shapes, skipped, view: sanitizeView(board.view) };
    });
  }

  DB.schema = { FILE_VERSION, LIMITS, STYLE_DEFAULTS, create, sanitizeShape, sanitizeShapes, sanitizeName, sanitizeView, parseFile };
})(window.DB);

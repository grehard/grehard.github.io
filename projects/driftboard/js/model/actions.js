// Editing commands. The toolbar, the inspector and the keyboard all call these, so each behaves the
// same however it was triggered, and each is one undo step.
(function (DB) {
  'use strict';
  const { uid, clamp, round } = DB.util;
  const { aabb, unionBounds, isLine, center, TEXT_TYPES } = DB.geometry;
  const T = DB.transforms;

  const doc = () => DB.boards.current();
  const PASTE_OFFSET = 20;

  function selectedShapes() {
    const d = doc();
    return d.order.filter((id) => d.selection.has(id)).map((id) => d.shapes.get(id));
  }
  const editableSelection = () => selectedShapes().filter((s) => !s.locked);

  function groupMembers(d, shape) {
    if (!shape.groupId) return [shape.id];
    return d.order.filter((id) => d.shapes.get(id).groupId === shape.groupId);
  }

  function expandGroups(ids) {
    const d = doc();
    const out = new Set();
    ids.forEach((id) => {
      const s = d.shapes.get(id);
      if (s) groupMembers(d, s).forEach((member) => out.add(member));
    });
    return out;
  }

  function select(ids) { doc().setSelection(expandGroups(ids)); }

  function selectAll() {
    const d = doc();
    d.setSelection(d.order.filter((id) => !d.shapes.get(id).locked));
    DB.bus.emit('overlay');
  }

  function plural(n, word) { return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`; }

  function deleteSelection() {
    const targets = editableSelection();
    if (!targets.length) return;
    const d = doc();
    const tx = d.begin('Delete');
    tx.remove(targets.map((s) => s.id));
    d.selection = new Set();
    tx.commit();
    DB.bus.emit('selection');
    DB.toast.show(`Deleted ${plural(targets.length, 'shape')}.`, { action: 'Undo', onAction: () => DB.app.undo() });
  }

  // Deep copies with fresh ids. Bindings survive only if both ends were copied; groups stay together.
  function cloneShapes(shapes, dx, dy) {
    const idMap = new Map(shapes.map((s) => [s.id, uid()]));
    const groupMap = new Map();
    const remapBinding = (binding) => (binding && idMap.has(binding.id) ? { id: idMap.get(binding.id), side: binding.side } : null);
    return shapes.map((s) => {
      const copy = T.translate(JSON.parse(JSON.stringify(s)), dx, dy);
      copy.id = idMap.get(s.id);
      if (s.groupId) {
        if (!groupMap.has(s.groupId)) groupMap.set(s.groupId, uid('g'));
        copy.groupId = groupMap.get(s.groupId);
      }
      if (isLine(s)) {
        copy.start = remapBinding(s.start);
        copy.end = remapBinding(s.end);
      }
      return copy;
    });
  }

  function insertCopies(label, copies) {
    const d = doc();
    const tx = d.begin(label);
    copies.forEach((s) => tx.add(s));
    d.selection = new Set(copies.map((s) => s.id));
    copies.filter(isLine).forEach((s) => tx.set(DB.connectors.resolve(s, d)));
    tx.commit();
    DB.bus.emit('selection');
    return copies;
  }

  function duplicate() {
    const targets = selectedShapes();
    if (!targets.length) return;
    insertCopies('Duplicate', cloneShapes(targets, PASTE_OFFSET, PASTE_OFFSET));
  }

  // Kept in memory as well as on the system clipboard: only a real paste event may read the latter.
  const clipboard = { shapes: [], pasteCount: 0 };

  function clipboardText() { return JSON.stringify({ driftboard: 'clipboard', shapes: clipboard.shapes }); }

  function copy() {
    const targets = selectedShapes();
    if (!targets.length) return false;
    clipboard.shapes = targets.map((s) => JSON.parse(JSON.stringify(s)));
    clipboard.pasteCount = 0;
    DB.bus.emit('status', `Copied ${plural(targets.length, 'shape')}`);
    return true;
  }

  function cut() {
    if (copy()) deleteSelection();
  }

  function pasteShapes(shapes, at) {
    if (!shapes.length) return;
    const bounds = unionBounds(shapes);
    clipboard.pasteCount += 1;
    let dx = PASTE_OFFSET * clipboard.pasteCount;
    let dy = dx;
    if (at) {
      const snap = DB.app.settings.snapGrid ? DB.snapping.snapToGrid : (v) => v;
      dx = snap(at.x - bounds.w / 2) - bounds.x;
      dy = snap(at.y - bounds.h / 2) - bounds.y;
    }
    insertCopies('Paste', cloneShapes(shapes, dx, dy));
  }

  function paste(at) { pasteShapes(clipboard.shapes, at); }

  function pasteText(text, at) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('{')) {
      try {
        const data = JSON.parse(trimmed);
        if (data && data.driftboard === 'clipboard') {
          pasteShapes(DB.schema.sanitizeShapes(data.shapes).shapes, at);
          return;
        }
      } catch (e) { /* Not ours: fall through and paste it as plain text. */ }
    }
    const point = at || center(viewRectAsBox());
    const shape = DB.text.refit(DB.schema.create('text', { x: round(point.x), y: round(point.y), text: trimmed.slice(0, DB.schema.LIMITS.text), fontSize: DB.app.settings.defaults.fontSize, stroke: DB.app.settings.defaults.stroke }));
    insertCopies('Paste text', [shape]);
  }

  function viewRectAsBox() {
    const r = DB.app.camera.visibleRect();
    return { x: r.x, y: r.y, w: r.w, h: r.h };
  }

  function group() {
    const targets = editableSelection();
    if (targets.length < 2) return;
    const d = doc();
    const groupId = uid('g');
    const tx = d.begin('Group');
    targets.forEach((s) => tx.set({ ...s, groupId }));
    tx.commit();
    DB.bus.emit('status', `Grouped ${plural(targets.length, 'shape')}`);
    DB.bus.emit('selection');
  }

  function ungroup() {
    const targets = editableSelection().filter((s) => s.groupId);
    if (!targets.length) return;
    const d = doc();
    const tx = d.begin('Ungroup');
    targets.forEach((s) => tx.set({ ...s, groupId: null }));
    tx.commit();
    DB.bus.emit('status', 'Ungrouped');
    DB.bus.emit('selection');
  }

  function toggleLock() {
    const targets = selectedShapes();
    if (!targets.length) return;
    const lock = targets.some((s) => !s.locked);
    const d = doc();
    const tx = d.begin(lock ? 'Lock' : 'Unlock');
    targets.forEach((s) => tx.set({ ...s, locked: lock }));
    tx.commit();
    DB.bus.emit('status', lock ? `Locked ${plural(targets.length, 'shape')}` : `Unlocked ${plural(targets.length, 'shape')}`);
    DB.bus.emit('selection');
  }

  // mode: 'front', 'back', 'forward' (one step) or 'backward' (one step).
  function reorder(mode) {
    const d = doc();
    if (!d.selection.size) return;
    const sel = d.selection;
    let order = d.order.slice();
    if (mode === 'front') order = order.filter((id) => !sel.has(id)).concat(d.order.filter((id) => sel.has(id)));
    if (mode === 'back') order = d.order.filter((id) => sel.has(id)).concat(order.filter((id) => !sel.has(id)));
    if (mode === 'forward') {
      for (let i = order.length - 2; i >= 0; i -= 1) {
        if (sel.has(order[i]) && !sel.has(order[i + 1])) [order[i], order[i + 1]] = [order[i + 1], order[i]];
      }
    }
    if (mode === 'backward') {
      for (let i = 1; i < order.length; i += 1) {
        if (sel.has(order[i]) && !sel.has(order[i - 1])) [order[i], order[i - 1]] = [order[i - 1], order[i]];
      }
    }
    const tx = d.begin('Change layer order');
    tx.setOrder(order);
    tx.commit();
    DB.bus.emit('selection');
  }

  // Applies a transform to every unlocked selected shape, with connectors following.
  function transformSelection(label, fn) {
    const targets = editableSelection();
    if (!targets.length) return;
    const tx = doc().begin(label);
    T.applyToSnapshot(tx, targets, fn);
    tx.commit();
    DB.bus.emit('selection');
  }

  function nudge(dx, dy) {
    transformSelection('Nudge', (s) => T.translate(s, dx, dy));
  }

  function rotateBy(degrees) {
    const targets = editableSelection();
    if (!targets.length) return;
    const frame = unionBounds(targets);
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    transformSelection('Rotate', (s) => T.rotateShape(s, cx, cy, degrees));
  }

  function align(edge) {
    const targets = editableSelection();
    if (targets.length < 2) return;
    const frame = unionBounds(targets);
    const offset = (b) => ({
      left: [frame.x - b.x, 0],
      right: [frame.x + frame.w - b.x - b.w, 0],
      centerX: [frame.x + frame.w / 2 - b.x - b.w / 2, 0],
      top: [0, frame.y - b.y],
      bottom: [0, frame.y + frame.h - b.y - b.h],
      centerY: [0, frame.y + frame.h / 2 - b.y - b.h / 2],
    }[edge]);
    const tx = doc().begin('Align');
    // A connector has no position of its own to align; it follows the boxes it is bound to.
    targets.filter((s) => !isLine(s)).forEach((s) => {
      const [dx, dy] = offset(aabb(s));
      tx.set(T.translate(s, dx, dy));
    });
    tx.commit();
    DB.bus.emit('selection');
  }

  const STYLE_KEYS = new Set(['stroke', 'fill', 'width', 'dash', 'opacity', 'fontSize', 'route']);

  function restyle(shape, patch) {
    let next = { ...shape };
    Object.entries(patch).forEach(([key, value]) => {
      if (!STYLE_KEYS.has(key)) return;
      if (key === 'route' && !isLine(shape)) return;
      if (key === 'fill' && (isLine(shape) || shape.type === 'pen' || shape.type === 'text')) return;
      next[key] = value;
    });
    if (patch.fontSize !== undefined && TEXT_TYPES.has(shape.type)) next = DB.text.refit(next);
    return isLine(next) ? DB.connectors.resolve(next, doc()) : next;
  }

  // During a slider drag the transaction stays open, so the whole drag is one undo step.
  let liveStyleTx = null;

  function applyStyle(patch, live) {
    DB.app.settings.defaults = { ...DB.app.settings.defaults, ...patch };
    DB.app.saveSettings();
    const targets = editableSelection();
    if (!targets.length) { DB.bus.emit('selection'); return; }
    if (!liveStyleTx || liveStyleTx.closed) liveStyleTx = doc().begin('Change style');
    targets.forEach((s) => liveStyleTx.set(restyle(s, patch)));
    liveStyleTx.flush();
    if (!live) {
      liveStyleTx.commit();
      liveStyleTx = null;
      DB.bus.emit('selection');
    }
  }

  function commitLiveStyle() {
    if (liveStyleTx) {
      liveStyleTx.commit();
      liveStyleTx = null;
      DB.bus.emit('selection');
    }
  }

  // Geometry fields in the inspector. Everything is clamped: a typed zero or a huge value stays usable.
  function setBoxField(s, field, value) {
    const { LIMITS } = DB.schema;
    if (field === 'x' || field === 'y') return { ...s, [field]: clamp(round(value), -LIMITS.coord, LIMITS.coord) };
    if (field === 'rotation') return { ...s, rotation: DB.geometry.normalizeAngle(value) };
    const w = field === 'w' ? clamp(round(value), LIMITS.minSize, LIMITS.size) : s.w;
    const h = field === 'h' ? clamp(round(value), LIMITS.minSize, LIMITS.size) : s.h;
    const scale = { sx: w / s.w, sy: h / s.h, anchorX: s.x, anchorY: s.y };
    const scaled = T.scaleShape({ ...s, rotation: 0 }, scale);
    return { ...scaled, x: s.x, y: s.y, w, h, fontSize: s.fontSize, rotation: s.rotation };
  }

  function setEndpointField(line, field, value) {
    const last = line.points.length - 1;
    const points = line.points.map((p) => p.slice());
    const v = clamp(round(value), -DB.schema.LIMITS.coord, DB.schema.LIMITS.coord);
    let { start, end } = line;
    if (field === 'x1') { points[0][0] = v; start = null; }
    if (field === 'y1') { points[0][1] = v; start = null; }
    if (field === 'x2') { points[last][0] = v; end = null; }
    if (field === 'y2') { points[last][1] = v; end = null; }
    return DB.connectors.resolve({ ...line, points, start, end }, doc());
  }

  function setFrameField(targets, field, value) {
    const frame = unionBounds(targets);
    const { LIMITS } = DB.schema;
    if (field === 'x' || field === 'y') {
      const dx = field === 'x' ? value - frame.x : 0;
      const dy = field === 'y' ? value - frame.y : 0;
      transformSelection('Move', (s) => T.translate(s, dx, dy));
      return;
    }
    const rotated = targets.some((s) => s.rotation);
    const size = clamp(round(value), LIMITS.minSize, LIMITS.size);
    const factor = size / Math.max(field === 'w' ? frame.w : frame.h, 1);
    const scale = {
      sx: field === 'w' || rotated ? factor : 1, sy: field === 'h' || rotated ? factor : 1, anchorX: frame.x, anchorY: frame.y,
    };
    transformSelection('Resize', (s) => T.scaleShape(s, scale));
  }

  function setGeometry(field, value) {
    const targets = editableSelection();
    if (!targets.length || !Number.isFinite(value)) { DB.bus.emit('selection'); return; }
    if (targets.length > 1) { setFrameField(targets, field, value); return; }
    const s = targets[0];
    const tx = doc().begin('Edit geometry');
    tx.set(isLine(s) ? setEndpointField(s, field, value) : setBoxField(s, field, value));
    tx.commit();
    DB.bus.emit('selection');
  }

  function clearBoard() {
    const d = doc();
    if (!d.order.length) return;
    const count = d.order.length;
    const tx = d.begin('Clear board');
    tx.remove(d.order);
    d.selection = new Set();
    tx.commit();
    DB.bus.emit('selection');
    DB.toast.show(`Cleared ${plural(count, 'shape')}.`, { action: 'Undo', onAction: () => DB.app.undo() });
  }

  DB.actions = {
    selectedShapes, editableSelection, expandGroups, groupMembers, select, selectAll, deleteSelection, cloneShapes, insertCopies, duplicate,
    copy, cut, paste, pasteText, clipboardText, group, ungroup, toggleLock, reorder, transformSelection, nudge, rotateBy, align,
    applyStyle, commitLiveStyle, setGeometry, clearBoard, plural,
  };
})(window.DB);

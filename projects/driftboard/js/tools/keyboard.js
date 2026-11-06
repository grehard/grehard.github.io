// Global keyboard shortcuts, plus the copy, cut and paste events. The help panel reads SHORTCUTS,
// so what it lists cannot drift from what is handled here.
(function (DB) {
  'use strict';
  const A = DB.actions;

  const SHORTCUTS = [
    { title: 'Tools', items: [
      ['V', 'Select'], ['H', 'Hand (pan)'], ['R', 'Rectangle'], ['O', 'Ellipse'], ['D', 'Diamond'], ['L', 'Line'], ['A', 'Arrow'],
      ['P', 'Freehand pen'], ['T', 'Text'], ['N', 'Sticky note'], ['E', 'Eraser'], ['Enter', 'Place the armed shape at the view center'],
    ] },
    { title: 'Edit', items: [
      ['Ctrl+Z', 'Undo'], ['Ctrl+Shift+Z', 'Redo'], ['Ctrl+Y', 'Redo'], ['Ctrl+C', 'Copy'], ['Ctrl+X', 'Cut'], ['Ctrl+V', 'Paste at the cursor'],
      ['Ctrl+D', 'Duplicate'], ['Delete', 'Delete selection'], ['Enter', 'Edit text of the selected shape'], ['Double-click', 'Edit text in place'],
      ['Alt+drag', 'Duplicate while moving'],
    ] },
    { title: 'Select and arrange', items: [
      ['Ctrl+A', 'Select all'], ['. and ,', 'Next or previous shape'], ['Shift+click', 'Add to selection'], ['Drag right', 'Select shapes fully inside'],
      ['Drag left', 'Select anything touched'], ['Arrow keys', 'Nudge 1 unit, Shift for 20'], ['Ctrl+G', 'Group'], ['Ctrl+Shift+G', 'Ungroup'],
      ['Ctrl+Shift+L', 'Lock or unlock'], [']', 'Bring forward'], ['[', 'Send backward'], ['Shift+]', 'Bring to front'], ['Shift+[', 'Send to back'],
    ] },
    { title: 'View', items: [
      ['Wheel', 'Zoom at the cursor'], ['Shift+wheel', 'Pan sideways'], ['Space+drag', 'Pan'], ['+ and -', 'Zoom at the cursor'], ['0', 'Zoom to 100%'],
      ['Shift+1', 'Zoom to fit the board'], ['Shift+2', 'Zoom to selection'], ['G', 'Snap to grid on or off'], ['Ctrl+drag', 'Ignore snapping for one drag'],
      ['M', 'Minimap on or off'], ['?', 'This panel'], ['Esc', 'Cancel, then deselect'],
    ] },
  ];

  const TOOL_KEYS = { v: 'select', h: 'hand', r: 'rect', o: 'ellipse', d: 'diamond', l: 'line', a: 'arrow', p: 'pen', t: 'text', n: 'sticky', e: 'eraser' };
  const CREATION_TOOLS = new Set(['rect', 'ellipse', 'diamond', 'line', 'arrow', 'text', 'sticky']);
  const ZOOM_STEP = 1.25;

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
      || (tag === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'color', 'file'].includes(target.type));
  }

  function cycleSelection(direction) {
    const doc = DB.boards.current();
    const ids = doc.order.filter((id) => !doc.shapes.get(id).locked);
    if (!ids.length) return;
    const selected = ids.findIndex((id) => doc.selection.has(id));
    let next;
    if (selected < 0) next = direction > 0 ? 0 : ids.length - 1;
    else next = (selected + direction + ids.length) % ids.length;
    A.select([ids[next]]);
    const s = doc.shapes.get(ids[next]);
    const { camera } = DB.app;
    const b = DB.geometry.aabb(s);
    const view = camera.visibleRect();
    if (!DB.geometry.rectContains(view, b)) {
      camera.animateTo({ zoom: camera.zoom, ox: camera.width / 2 - (b.x + b.w / 2) * camera.zoom, oy: camera.height / 2 - (b.y + b.h / 2) * camera.zoom });
    }
    DB.bus.emit('status', `Selected ${DB.inspector.describe(s)}`);
  }

  function handleModified(ev, app) {
    const key = ev.key.toLowerCase();
    const run = (fn) => { ev.preventDefault(); fn(); };
    if (key === 'z') run(() => (ev.shiftKey ? app.redo() : app.undo()));
    else if (key === 'y') run(() => app.redo());
    else if (key === 'a') run(A.selectAll);
    else if (key === 'd') run(A.duplicate);
    else if (key === 'g') run(ev.shiftKey ? A.ungroup : A.group);
    else if (key === 'l' && ev.shiftKey) run(A.toggleLock);
    else if (key === 'c') A.copy(); // Left to the browser too, so the copy event below still fires.
    else if (key === 'x') scheduleCutFallback();
    else if (key === 'v') schedulePasteFallback(app);
    else if (key === '0') run(() => app.zoomReset());
    else if (key === 's') run(() => DB.exporter.saveBoardJSON(DB.boards.current()));
    else return false;
    return true;
  }

  function handlePlain(ev, app) {
    const key = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    const shift = ev.shiftKey;
    if (ev.code === 'BracketRight') { A.reorder(shift ? 'front' : 'forward'); return true; }
    if (ev.code === 'BracketLeft') { A.reorder(shift ? 'back' : 'backward'); return true; }
    if (shift && ev.code === 'Digit1') { app.zoomFit(); return true; }
    if (shift && ev.code === 'Digit2') { app.zoomSelection(); return true; }
    if (key === '?') { DB.helpPanel.open(); return true; }
    if (key === '+' || key === '=') { app.zoomStep(ZOOM_STEP); return true; }
    if (key === '-' || key === '_') { app.zoomStep(1 / ZOOM_STEP); return true; }
    if (key === '0') { app.zoomReset(); return true; }
    if (key === 'g') { app.toggleSetting('snapGrid'); return true; }
    if (key === 'm') { app.toggleSetting('minimap'); return true; }
    if (key === '.') { cycleSelection(1); return true; }
    if (key === ',') { cycleSelection(-1); return true; }
    if (TOOL_KEYS[key] && !shift) { app.setTool(TOOL_KEYS[key]); return true; }
    if (key === 'Delete' || key === 'Backspace') { A.deleteSelection(); return true; }
    if (key === 'Enter') return handleEnter(app);
    if (key === 'Escape') { handleEscape(app); return true; }
    return handleArrow(key, shift, app);
  }

  function handleEnter(app) {
    if (CREATION_TOOLS.has(app.tool)) {
      DB.drawGestures.placeWithKeyboard(app, app.tool);
      return true;
    }
    const doc = DB.boards.current();
    const [first] = A.editableSelection();
    if (first && doc.selection.size === 1 && DB.geometry.TEXT_TYPES.has(first.type)) {
      DB.textEditor.open(first.id, doc.begin('Edit text'), false);
      return true;
    }
    return false;
  }

  function handleEscape(app) {
    if (app.input.cancelGesture()) return;
    if (app.tool !== 'select') { app.setTool('select'); return; }
    DB.boards.current().setSelection([]);
  }

  function handleArrow(key, shift, app) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    if (!delta) return false;
    const doc = DB.boards.current();
    if (doc.selection.size) {
      const step = shift ? DB.snapping.GRID : 1;
      A.nudge(delta[0] * step, delta[1] * step);
    } else {
      const step = shift ? 200 : 40;
      app.camera.panBy(-delta[0] * step, -delta[1] * step);
    }
    return true;
  }

  // Only a real paste event may read the system clipboard. If the browser does not raise one,
  // shortly after the key press, paste from the in-app clipboard instead.
  let pasteTimer = null;
  function schedulePasteFallback(app) {
    clearTimeout(pasteTimer);
    pasteTimer = setTimeout(() => { pasteTimer = null; A.paste(app.pasteTarget()); }, 40);
  }

  let cutTimer = null;
  function scheduleCutFallback() {
    clearTimeout(cutTimer);
    cutTimer = setTimeout(() => { cutTimer = null; A.cut(); }, 40);
  }

  // A focused button or slider keeps its own use of these keys.
  const CONTROL_KEYS = new Set(['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  const isControl = (target) => !!target && !!target.closest && !!target.closest('button, a, input, select, label');

  function onKeyDown(ev, app) {
    if (DB.modal.isOpen()) return;
    if (isTypingTarget(ev.target)) return;
    if (CONTROL_KEYS.has(ev.key) && isControl(ev.target)) return;
    // Mid-drag, the open transaction owns the document. Only Escape, which cancels it, may interrupt.
    if (app.input.gesture && ev.key !== 'Escape') return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      if (!app.input.spaceHeld) {
        app.input.spaceHeld = true;
        app.input.refreshCursor();
      }
      return;
    }
    const handled = (ev.ctrlKey || ev.metaKey) ? handleModified(ev, app) : (!ev.altKey && handlePlain(ev, app));
    if (handled && !(ev.ctrlKey || ev.metaKey)) ev.preventDefault();
  }

  function attach(app) {
    document.addEventListener('keydown', (ev) => onKeyDown(ev, app));
    document.addEventListener('keyup', (ev) => {
      if (ev.code === 'Space') {
        app.input.spaceHeld = false;
        app.input.refreshCursor();
      }
    });
    document.addEventListener('copy', (ev) => {
      if (isTypingTarget(ev.target) || !DB.boards.current().selection.size) return;
      A.copy();
      ev.clipboardData.setData('text/plain', A.clipboardText());
      ev.preventDefault();
    });
    document.addEventListener('cut', (ev) => {
      if (isTypingTarget(ev.target) || !DB.boards.current().selection.size) return;
      clearTimeout(cutTimer);
      cutTimer = null;
      A.copy();
      ev.clipboardData.setData('text/plain', A.clipboardText());
      ev.preventDefault();
      A.deleteSelection();
    });
    document.addEventListener('paste', (ev) => {
      if (isTypingTarget(ev.target) || DB.modal.isOpen()) return;
      clearTimeout(pasteTimer);
      pasteTimer = null;
      const text = ev.clipboardData ? ev.clipboardData.getData('text/plain') : '';
      if (text) A.pasteText(text, app.pasteTarget());
      else A.paste(app.pasteTarget());
      ev.preventDefault();
    });
  }

  DB.keyboard = { attach, SHORTCUTS };
})(window.DB);

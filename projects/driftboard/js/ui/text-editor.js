// Inline text editing: a textarea laid exactly over the shape, using the same layout box the canvas
// draws into, so text does not jump when editing starts or ends.
(function (DB) {
  'use strict';
  const { rotatePoint, center, isLine } = DB.geometry;
  const { resolve, CANVAS } = DB.palette;
  const { textBox, LINE_HEIGHT, FONT_FAMILY, wrap, measureWidth, refit } = DB.text;

  let session = null;
  const area = () => document.getElementById('text-editor');

  function currentShape() {
    return session ? DB.boards.current().shapes.get(session.id) : null;
  }

  function reposition() {
    if (!session) return;
    const s = currentShape();
    if (!s) return;
    const node = area();
    const { camera } = DB.app;
    const { zoom } = camera;
    const value = node.value;
    const isAuto = s.type === 'text' && s.auto;
    const probe = isLine(s) ? { ...s, text: value || ' ' } : s;
    const box = textBox(probe);
    const longest = Math.max(...value.split('\n').map((line) => measureWidth(line, s.fontSize)), s.fontSize);
    const width = isAuto ? longest + s.fontSize : box.w;
    const lines = wrap(value || ' ', s.fontSize, isAuto ? 1e7 : box.w).length;
    const blockHeight = lines * s.fontSize * LINE_HEIGHT;
    const height = Math.max(isAuto ? blockHeight : box.h, blockHeight);
    const padTop = box.valign === 'middle' ? Math.max((box.h - blockHeight) / 2, 0) : 0;

    const pivot = isLine(s) ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : center(s);
    const left = isAuto ? box.x + width / 2 : box.x + box.w / 2;
    const top = box.y + height / 2;
    const middle = rotatePoint(left, top, pivot.x, pivot.y, s.rotation || 0);
    const screen = camera.toScreen(middle.x, middle.y);

    const theme = DB.app.theme();
    node.style.left = `${screen.x}px`;
    node.style.top = `${screen.y}px`;
    node.style.width = `${width * zoom}px`;
    node.style.height = `${height * zoom}px`;
    node.style.transform = `translate(-50%, -50%) rotate(${s.rotation || 0}deg)`;
    node.style.fontFamily = FONT_FAMILY;
    node.style.fontSize = `${s.fontSize * zoom}px`;
    node.style.lineHeight = String(LINE_HEIGHT);
    node.style.paddingTop = `${padTop * zoom}px`;
    node.style.textAlign = box.align;
    node.style.whiteSpace = isAuto ? 'pre' : 'pre-wrap';
    node.style.color = resolve(s.stroke, theme);
    node.style.background = isLine(s) ? CANVAS[theme].bg : 'transparent';
  }

  function open(id, tx, isNew) {
    if (session) commit();
    const doc = DB.boards.current();
    const s = doc.shapes.get(id);
    if (!s) { tx.cancel(); return; }
    session = { id, tx, isNew, original: s.text };
    DB.app.transient.editingId = id;
    DB.app.transient.hover = null;
    const node = area();
    node.value = s.text || '';
    node.hidden = false;
    reposition();
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
    DB.bus.emit('scene');
  }

  function close() {
    const node = area();
    session = null;
    DB.app.transient.editingId = null;
    node.hidden = true;
    node.value = '';
    DB.bus.emit('scene');
  }

  function commit() {
    if (!session) return;
    const { id, tx, isNew } = session;
    const doc = DB.boards.current();
    const s = doc.shapes.get(id);
    const value = area().value.replace(/\s+$/, '').slice(0, DB.schema.LIMITS.text);
    close();
    if (!s || (isNew && !value)) {
      tx.cancel();
    } else {
      const next = refit({ ...s, text: value });
      tx.set(isLine(next) ? DB.connectors.resolve(next, doc) : next);
      doc.setSelection([id]);
      tx.commit();
      if (isNew) DB.bus.emit('status', 'Added text');
    }
    if (isNew) DB.app.setTool('select');
    DB.bus.emit('selection');
    document.getElementById('overlay').focus({ preventScroll: true });
  }

  function attach() {
    const node = area();
    node.addEventListener('input', reposition);
    node.addEventListener('blur', () => { if (session) commit(); });
    node.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) {
        ev.preventDefault();
        commit();
      }
    });
    DB.bus.on('view', reposition);
  }

  DB.textEditor = { attach, open, commit, isOpen: () => !!session };
})(window.DB);

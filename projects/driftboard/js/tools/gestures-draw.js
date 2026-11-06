// Gestures that create shapes. A gesture is an object with move, up and cancel, started on pointer down.
(function (DB) {
  'use strict';
  const { create } = DB.schema;
  const { snapPoint, collectTargets, snapToGrid } = DB.snapping;
  const { round } = DB.util;
  const { resolve, findTarget } = DB.connectors;

  const CLICK_SLOP_PX = 3;
  const DEFAULT_SIZES = { rect: [160, 100], ellipse: [160, 100], diamond: [160, 100], sticky: [180, 160] };

  const noSnap = { snapGrid: false, guides: false };
  const snapSettings = (app, ev) => (ev.ctrlKey || ev.metaKey ? noSnap : app.settings);

  function styleFor(app, type) {
    const { stroke, fill, width, dash, opacity, fontSize, route } = app.settings.defaults;
    if (type === 'line' || type === 'arrow') return { stroke, width, dash, opacity, route };
    if (type === 'pen') return { stroke, width, dash, opacity };
    if (type === 'text') return { stroke, opacity, fontSize };
    if (type === 'sticky') return { opacity, fontSize };
    return { stroke, fill, width, dash, opacity, fontSize };
  }

  function finishCreation(app, doc, tx, id) {
    doc.setSelection([id]);
    tx.commit();
    app.setTool('select');
    DB.bus.emit('selection');
  }

  // Places a default-sized box centered on a point. Used by a plain click and by Enter on the keyboard.
  function placeDefault(app, type, x, y) {
    const doc = DB.boards.current();
    const [w, h] = DEFAULT_SIZES[type];
    const snap = app.settings.snapGrid ? snapToGrid : round;
    const shape = create(type, { ...styleFor(app, type), x: snap(x - w / 2), y: snap(y - h / 2), w, h });
    const tx = doc.begin(`Add ${type}`);
    tx.add(shape);
    return { tx, shape, doc };
  }

  function boxGesture(app, type, start, startEv) {
    const doc = DB.boards.current();
    const targets = collectTargets(doc, app.camera, new Set());
    const origin = snapPoint(start.x, start.y, targets, snapSettings(app, startEv), app.camera.zoom);
    let tx = null;
    let shapeId = null;
    return {
      move(p, ev) {
        if (!tx && Math.hypot(p.sx - start.sx, p.sy - start.sy) < CLICK_SLOP_PX) return;
        const end = snapPoint(p.x, p.y, targets, snapSettings(app, ev), app.camera.zoom);
        let dx = end.x - origin.x;
        let dy = end.y - origin.y;
        if (ev.shiftKey) {
          const side = Math.max(Math.abs(dx), Math.abs(dy));
          dx = Math.sign(dx || 1) * side;
          dy = Math.sign(dy || 1) * side;
        }
        const box = {
          x: Math.min(origin.x, origin.x + dx), y: Math.min(origin.y, origin.y + dy),
          w: Math.max(Math.abs(dx), 1), h: Math.max(Math.abs(dy), 1),
        };
        if (!tx) {
          const shape = create(type, { ...styleFor(app, type), ...box });
          shapeId = shape.id;
          tx = doc.begin(`Draw ${type}`);
          tx.add(shape);
        } else {
          tx.set({ ...doc.shapes.get(shapeId), ...box });
        }
        app.transient.guides = end.guides;
      },
      up() {
        app.transient.guides = [];
        if (!tx) {
          const placed = placeDefault(app, type, start.x, start.y);
          tx = placed.tx;
          shapeId = placed.shape.id;
        }
        finishCreation(app, doc, tx, shapeId);
      },
      cancel() {
        app.transient.guides = [];
        if (tx) tx.cancel();
      },
    };
  }

  function bindingFrom(target) {
    return target ? { id: target.shape.id, side: target.side } : null;
  }

  // Shared by drawing a new connector and by dragging an existing connector's endpoint.
  function trackEndpoint(app, doc, line, which, p, ev, targets) {
    const other = which === 'end' ? line.start : line.end;
    const target = findTarget(doc, p.x, p.y, app.camera.zoom, other ? other.id : null);
    app.transient.anchorTarget = target ? { id: target.shape.id, side: target.side } : null;
    const free = target ? { x: p.x, y: p.y, guides: [] } : snapPoint(p.x, p.y, targets, snapSettings(app, ev), app.camera.zoom);
    app.transient.guides = free.guides;
    const points = line.points.map((q) => q.slice());
    if (which === 'end') points[points.length - 1] = [free.x, free.y];
    else points[0] = [free.x, free.y];
    return resolve({ ...line, points, [which]: bindingFrom(target) }, doc);
  }

  function lineGesture(app, type, start, startEv) {
    const doc = DB.boards.current();
    const targets = collectTargets(doc, app.camera, new Set());
    const startTarget = findTarget(doc, start.x, start.y, app.camera.zoom, null);
    const origin = startTarget ? start : snapPoint(start.x, start.y, targets, snapSettings(app, startEv), app.camera.zoom);
    const base = create(type, { ...styleFor(app, type), points: [[origin.x, origin.y], [origin.x, origin.y]], start: bindingFrom(startTarget) });
    let tx = null;
    const clear = () => {
      app.transient.anchorTarget = null;
      app.transient.guides = [];
    };
    return {
      move(p, ev) {
        if (!tx && Math.hypot(p.sx - start.sx, p.sy - start.sy) < CLICK_SLOP_PX) return;
        if (!tx) {
          tx = doc.begin(`Draw ${type}`);
          tx.add(base);
        }
        tx.set(trackEndpoint(app, doc, doc.shapes.get(base.id), 'end', p, ev, targets));
      },
      up() {
        clear();
        if (tx) finishCreation(app, doc, tx, base.id);
      },
      cancel() {
        clear();
        if (tx) tx.cancel();
      },
    };
  }

  function penGesture(app, start) {
    const stroke = DB.smoothing.createStroke(start.x, start.y);
    const { stroke: color, width, opacity, dash } = app.settings.defaults;
    app.transient.pen = { points: stroke.points, stroke: color, width, opacity };
    return {
      move(p, ev) {
        const samples = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
        const world = app.input.worldOfEvents(samples);
        if (world.length) world.forEach((w) => stroke.add(w.x, w.y));
        else stroke.add(p.x, p.y);
        DB.bus.emit('overlay');
      },
      up(p) {
        app.transient.pen = null;
        stroke.points.push([p.x, p.y]);
        const simplified = DB.smoothing.simplify(DB.smoothing.relax(stroke.points, 2), 0.75 / app.camera.zoom);
        const b = DB.geometry.pointsBounds(simplified);
        const points = simplified.map(([x, y]) => [round(x - b.x), round(y - b.y)]);
        const shape = create('pen', {
          stroke: color, width, opacity, dash, points,
          x: round(b.x), y: round(b.y), w: Math.max(round(b.w), 1), h: Math.max(round(b.h), 1),
        });
        const doc = DB.boards.current();
        const tx = doc.begin('Draw freehand');
        tx.add(shape);
        tx.commit();
      },
      cancel() { app.transient.pen = null; },
    };
  }

  // Text and sticky notes open the inline editor on release, so the same gesture covers click and drag.
  function textGesture(app, start, startEv) {
    const doc = DB.boards.current();
    const origin = snapPoint(start.x, start.y, null, snapSettings(app, startEv), app.camera.zoom);
    return {
      move() {},
      up() {
        const shape = DB.text.refit(create('text', { ...styleFor(app, 'text'), x: origin.x, y: origin.y, text: '' }));
        const tx = doc.begin('Add text');
        tx.add(shape);
        DB.textEditor.open(shape.id, tx, true);
      },
      cancel() {},
    };
  }

  function stickyGesture(app, start, startEv) {
    const doc = DB.boards.current();
    const inner = boxGesture(app, 'sticky', start, startEv);
    return {
      move: inner.move,
      cancel: inner.cancel,
      up(p, ev) {
        inner.up(p, ev);
        const [id] = Array.from(doc.selection);
        if (id) DB.textEditor.open(id, doc.begin('Edit text'), false);
      },
    };
  }

  function eraserGesture(app, start) {
    const doc = DB.boards.current();
    const marked = new Set();
    let last = start;
    app.transient.erase = marked;
    const markAt = (x, y) => {
      const hit = DB.hit.pick(doc, x, y, 6 / app.camera.zoom, false);
      if (hit) DB.actions.expandGroups([hit.id]).forEach((id) => { if (!doc.shapes.get(id).locked) marked.add(id); });
    };
    markAt(start.x, start.y);
    return {
      move(p) {
        // Sample along the segment so a fast flick cannot skip over a thin line.
        const distance = Math.hypot(p.sx - last.sx, p.sy - last.sy);
        const steps = Math.max(1, Math.ceil(distance / 6));
        for (let i = 1; i <= steps; i += 1) {
          markAt(last.x + ((p.x - last.x) * i) / steps, last.y + ((p.y - last.y) * i) / steps);
        }
        last = p;
        DB.bus.emit('overlay');
      },
      up() {
        app.transient.erase = null;
        if (!marked.size) return;
        const tx = doc.begin('Erase');
        tx.remove(marked);
        marked.forEach((id) => doc.selection.delete(id));
        tx.commit();
        DB.bus.emit('selection');
        DB.toast.show(`Erased ${DB.actions.plural(marked.size, 'shape')}.`, { action: 'Undo', onAction: () => app.undo() });
      },
      cancel() { app.transient.erase = null; },
    };
  }

  // Keyboard path for the creation tools: Enter on the canvas places a shape at the middle of the view.
  function placeWithKeyboard(app, tool) {
    const { camera } = app;
    const c = camera.toWorld(camera.width / 2, camera.height / 2);
    if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond' || tool === 'sticky') {
      const { tx, shape, doc } = placeDefault(app, tool, c.x, c.y);
      finishCreation(app, doc, tx, shape.id);
      if (tool === 'sticky') DB.textEditor.open(shape.id, doc.begin('Edit text'), false);
    } else if (tool === 'line' || tool === 'arrow') {
      const doc = DB.boards.current();
      const points = [[round(c.x - 80), round(c.y)], [round(c.x + 80), round(c.y)]];
      const shape = create(tool, { ...styleFor(app, tool), points });
      const tx = doc.begin(`Add ${tool}`);
      tx.add(shape);
      finishCreation(app, doc, tx, shape.id);
    } else if (tool === 'text') {
      const doc = DB.boards.current();
      const shape = DB.text.refit(create('text', { ...styleFor(app, 'text'), x: round(c.x), y: round(c.y), text: '' }));
      const tx = doc.begin('Add text');
      tx.add(shape);
      DB.textEditor.open(shape.id, tx, true);
    }
  }

  DB.drawGestures = { boxGesture, lineGesture, penGesture, textGesture, stickyGesture, eraserGesture, trackEndpoint, placeWithKeyboard, snapSettings };
})(window.DB);

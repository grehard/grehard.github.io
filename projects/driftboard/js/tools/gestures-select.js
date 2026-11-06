// Gestures of the select tool: click, marquee, move, resize, rotate and connector endpoint drags.
(function (DB) {
  'use strict';
  const { unionBounds, aabb, rectContains, touchesRect, rotatePoint, hitShape } = DB.geometry;
  const { snapRect, snapPoint, collectTargets } = DB.snapping;
  const T = DB.transforms;
  const A = DB.actions;
  const { snapSettings } = DB.drawGestures;

  const DRAG_SLOP_PX = 3;
  const ROTATE_SNAP = 15;

  // Spatial-index lookup for the shape under a point, topmost first.
  function pick(doc, x, y, tol, includeLocked) {
    const candidates = doc.spatial.query({ x: x - tol, y: y - tol, w: tol * 2, h: tol * 2 })
      .sort((a, b) => doc.zIndex.get(b) - doc.zIndex.get(a));
    for (let i = 0; i < candidates.length; i += 1) {
      const s = doc.shapes.get(candidates[i]);
      if (s && (includeLocked || !s.locked) && hitShape(s, x, y, tol)) return s;
    }
    return null;
  }

  function moveGesture(app, start, startEv, options) {
    const doc = DB.boards.current();
    let tx = null;
    let snapshot = [];
    let frame0 = null;
    let targets = null;

    function begin(ev) {
      tx = doc.begin(ev.altKey ? 'Duplicate' : 'Move');
      if (ev.altKey) {
        const copies = A.cloneShapes(A.selectedShapes(), 0, 0);
        copies.forEach((s) => tx.add(s));
        doc.selection = new Set(copies.map((s) => s.id));
        DB.bus.emit('selection');
      }
      snapshot = A.editableSelection();
      frame0 = unionBounds(snapshot);
      targets = collectTargets(doc, app.camera, new Set(snapshot.map((s) => s.id)));
    }

    return {
      move(p, ev) {
        if (!tx) {
          if (Math.hypot(p.sx - start.sx, p.sy - start.sy) < DRAG_SLOP_PX) return;
          begin(ev);
        }
        if (!snapshot.length) return;
        let dx = p.x - start.x;
        let dy = p.y - start.y;
        if (ev.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
        }
        const rect = { x: frame0.x + dx, y: frame0.y + dy, w: frame0.w, h: frame0.h };
        const snap = snapRect(rect, targets, snapSettings(app, ev), app.camera.zoom);
        app.transient.guides = snap.guides;
        const finalX = dx + snap.dx;
        const finalY = dy + snap.dy;
        T.applyToSnapshot(tx, snapshot, (s) => T.translate(s, finalX, finalY));
      },
      up() {
        app.transient.guides = [];
        if (tx) {
          tx.commit();
          DB.bus.emit('status', `Moved ${A.plural(snapshot.length, 'shape')}`);
          DB.bus.emit('selection');
          return;
        }
        if (options.onClick) options.onClick();
      },
      cancel() {
        app.transient.guides = [];
        if (tx) tx.cancel();
      },
    };
  }

  function resizeGesture(app, handle, frame) {
    const doc = DB.boards.current();
    const snapshot = A.editableSelection();
    const frame0 = unionBounds(snapshot);
    const targets = collectTargets(doc, app.camera, new Set(snapshot.map((s) => s.id)));
    let tx = null;
    const rotated = snapshot.some((s) => s.rotation);
    return {
      move(p, ev) {
        if (!tx) tx = doc.begin('Resize');
        const snapped = !rotated ? snapPoint(p.x, p.y, targets, snapSettings(app, ev), app.camera.zoom) : { x: p.x, y: p.y, guides: [] };
        app.transient.guides = snapped.guides;
        if (frame.kind === 'box') {
          const next = T.resizeBox(snapshot[0], handle, snapped.x, snapped.y, ev.shiftKey);
          tx.set(next.type === 'text' ? DB.text.refit(next) : next);
          tx.flush();
          return;
        }
        // Scaling a rotated child unevenly would skew it, which the model cannot represent.
        const scale = T.frameScale(frame0, handle, snapped.x, snapped.y, ev.shiftKey || rotated);
        T.applyToSnapshot(tx, snapshot, (s) => T.scaleShape(s, scale));
      },
      up() {
        app.transient.guides = [];
        if (tx) {
          tx.commit();
          DB.bus.emit('status', 'Resized');
          DB.bus.emit('selection');
        }
      },
      cancel() {
        app.transient.guides = [];
        if (tx) tx.cancel();
      },
    };
  }

  function rotateGesture(app, frame, start) {
    const doc = DB.boards.current();
    const snapshot = A.editableSelection();
    const { cx, cy } = frame;
    const startAngle = Math.atan2(start.y - cy, start.x - cx);
    const baseRotation = frame.kind === 'box' ? frame.rotation : 0;
    let tx = null;
    return {
      move(p, ev) {
        if (!tx) tx = doc.begin('Rotate');
        let degrees = ((Math.atan2(p.y - cy, p.x - cx) - startAngle) * 180) / Math.PI;
        degrees = Math.round(degrees * 10) / 10;
        if (ev.shiftKey) degrees = Math.round((baseRotation + degrees) / ROTATE_SNAP) * ROTATE_SNAP - baseRotation;
        T.applyToSnapshot(tx, snapshot, (s) => T.rotateShape(s, cx, cy, degrees));
        if (frame.kind === 'multi') {
          app.transient.frameOverride = { cx, cy, w: frame.w, h: frame.h, rotation: baseRotation + degrees };
        }
      },
      up() {
        app.transient.frameOverride = null;
        if (tx) {
          tx.commit();
          DB.bus.emit('status', 'Rotated');
          DB.bus.emit('selection');
        }
      },
      cancel() {
        app.transient.frameOverride = null;
        if (tx) tx.cancel();
      },
    };
  }

  function endpointGesture(app, which, frame) {
    const doc = DB.boards.current();
    const targets = collectTargets(doc, app.camera, new Set([frame.shape.id]));
    let tx = null;
    const clear = () => {
      app.transient.anchorTarget = null;
      app.transient.guides = [];
    };
    return {
      move(p, ev) {
        if (!tx) tx = doc.begin('Move connector end');
        tx.set(DB.drawGestures.trackEndpoint(app, doc, doc.shapes.get(frame.shape.id), which, p, ev, targets));
      },
      up() {
        clear();
        if (tx) {
          tx.commit();
          DB.bus.emit('selection');
        }
      },
      cancel() {
        clear();
        if (tx) tx.cancel();
      },
    };
  }

  // Dragging right selects shapes fully inside (a window); dragging left selects anything touched
  // (a crossing). This is the drafting-software convention.
  function marqueeGesture(app, start, startEv) {
    const doc = DB.boards.current();
    const base = startEv.shiftKey ? Array.from(doc.selection) : [];
    const currentMatches = (rect) => {
      const matches = doc.spatial.query(rect).filter((id) => {
        const s = doc.shapes.get(id);
        if (!s || s.locked) return false;
        return rect.crossing ? touchesRect(s, rect) : rectContains(rect, aabb(s));
      });
      return A.expandGroups(matches);
    };
    return {
      move(p) {
        const rect = {
          x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y), crossing: p.x < start.x,
        };
        app.transient.marquee = rect;
        app.transient.candidates = currentMatches(rect);
        DB.bus.emit('overlay');
      },
      up() {
        const rect = app.transient.marquee;
        app.transient.marquee = null;
        app.transient.candidates = null;
        if (rect) doc.setSelection(new Set([...base, ...currentMatches(rect)]));
        DB.bus.emit('overlay');
      },
      cancel() {
        app.transient.marquee = null;
        app.transient.candidates = null;
      },
    };
  }

  function insideFrame(frame, x, y) {
    if (!frame || frame.kind === 'line') return false;
    const local = rotatePoint(x, y, frame.cx, frame.cy, -frame.rotation);
    return Math.abs(local.x - frame.cx) <= frame.w / 2 && Math.abs(local.y - frame.cy) <= frame.h / 2;
  }

  function beginSelect(app, start, ev, handleRadius, tolerancePx) {
    const doc = DB.boards.current();
    const { camera } = app;
    const picked = DB.handles.pick(doc, camera, start.sx, start.sy, handleRadius);
    if (picked) {
      if (picked.handle === 'rotate') return rotateGesture(app, picked.frame, start);
      if (picked.handle === 'start' || picked.handle === 'end') return endpointGesture(app, picked.handle, picked.frame);
      return resizeGesture(app, picked.handle, picked.frame);
    }
    const hit = pick(doc, start.x, start.y, tolerancePx / camera.zoom, true);
    const frame = DB.handles.frame(doc);
    if (hit) {
      const members = A.expandGroups([hit.id]);
      const isSelected = doc.selection.has(hit.id);
      if (ev.shiftKey) {
        if (!isSelected) doc.setSelection(new Set([...doc.selection, ...members]));
        return moveGesture(app, start, ev, {
          onClick: () => {
            if (!isSelected) return;
            const next = new Set(doc.selection);
            members.forEach((id) => next.delete(id));
            doc.setSelection(next);
          },
        });
      }
      if (!isSelected) doc.setSelection(members);
      return moveGesture(app, start, ev, {
        onClick: () => { if (isSelected) doc.setSelection(members); },
      });
    }
    if (frame && frame.kind === 'multi' && insideFrame(frame, start.x, start.y)) {
      return moveGesture(app, start, ev, { onClick: () => doc.setSelection([]) });
    }
    if (!ev.shiftKey) doc.setSelection([]);
    return marqueeGesture(app, start, ev);
  }

  DB.hit = { pick };
  DB.selectGestures = { beginSelect };
})(window.DB);

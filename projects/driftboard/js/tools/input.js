// Pointer and wheel input on the canvas. Mouse, pen and touch all arrive as pointer events; two
// active touches become a pinch, which cancels whatever the first finger had started.
(function (DB) {
  'use strict';
  const D = DB.drawGestures;

  const WHEEL_ZOOM_BASE = 1.2;
  const DOUBLE_TAP_MS = 350;
  const DOUBLE_TAP_PX = 8;

  class Input {
    constructor(app, surface) {
      this.app = app;
      this.surface = surface;
      this.pointers = new Map();
      this.gesture = null;
      this.pinch = null;
      this.lastDown = null;
      this.lastPointer = null;
      this.spaceHeld = false;
      surface.addEventListener('pointerdown', (ev) => this.onDown(ev));
      surface.addEventListener('pointermove', (ev) => this.onMove(ev));
      surface.addEventListener('pointerup', (ev) => this.onUp(ev));
      surface.addEventListener('pointercancel', (ev) => this.onCancel(ev));
      surface.addEventListener('pointerleave', () => this.onLeave());
      surface.addEventListener('wheel', (ev) => this.onWheel(ev), { passive: false });
      surface.addEventListener('contextmenu', (ev) => ev.preventDefault());
    }

    screenPoint(ev) {
      const rect = this.surface.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const world = this.app.camera.toWorld(sx, sy);
      return { sx, sy, x: world.x, y: world.y };
    }

    worldOfEvents(events) {
      return events.map((ev) => this.screenPoint(ev));
    }

    onDown(ev) {
      if (DB.textEditor.isOpen()) DB.textEditor.commit();
      this.surface.focus({ preventScroll: true });
      try { this.surface.setPointerCapture(ev.pointerId); } catch (e) { /* The pointer already ended. */ }
      const p = this.screenPoint(ev);
      this.pointers.set(ev.pointerId, p);
      if (ev.pointerType === 'touch' && this.pointers.size === 2) {
        this.cancelGesture();
        this.startPinch();
        return;
      }
      if (this.pointers.size > 1) return;
      this.gesture = this.startGesture(p, ev);
      this.app.transient.hover = null;
      DB.bus.emit('overlay');
    }

    startGesture(p, ev) {
      const { app } = this;
      if (ev.button === 2) return null;
      if (ev.button === 1 || this.spaceHeld || app.tool === 'hand') return this.panGesture(p);
      const isTouch = ev.pointerType === 'touch';
      switch (app.tool) {
        case 'select': return this.selectGesture(p, ev, isTouch);
        case 'rect': case 'ellipse': case 'diamond': return D.boxGesture(app, app.tool, p, ev);
        case 'line': case 'arrow': return D.lineGesture(app, app.tool, p, ev);
        case 'pen': return D.penGesture(app, p);
        case 'text': return D.textGesture(app, p, ev);
        case 'sticky': return D.stickyGesture(app, p, ev);
        case 'eraser': return D.eraserGesture(app, p);
        default: return null;
      }
    }

    // A second press in the same spot edits text. The editor opens on release: focusing it during
    // the press would lose focus again to the browser's default mouse-down handling.
    selectGesture(p, ev, isTouch) {
      const { app } = this;
      const now = performance.now();
      const previous = this.lastDown;
      this.lastDown = { time: now, sx: p.sx, sy: p.sy };
      const isDouble = previous && now - previous.time < DOUBLE_TAP_MS && Math.hypot(p.sx - previous.sx, p.sy - previous.sy) < DOUBLE_TAP_PX;
      const inner = DB.selectGestures.beginSelect(app, p, ev, isTouch ? 20 : 9, isTouch ? 10 : 4);
      if (!isDouble || ev.shiftKey) return inner;
      this.lastDown = null;
      // A quick press that then drags is still a drag. Only a press that stays put opens the editor.
      let dragged = false;
      return {
        move: (q, moveEv) => {
          if (Math.hypot(q.sx - p.sx, q.sy - p.sy) >= 3) dragged = true;
          if (dragged) inner.move(q, moveEv);
        },
        up: (q, upEv) => {
          if (dragged) { inner.up(q, upEv); return; }
          inner.cancel();
          this.openTextAt(p);
        },
        cancel: () => inner.cancel(),
      };
    }

    openTextAt(p) {
      const doc = DB.boards.current();
      const hit = DB.hit.pick(doc, p.x, p.y, 4 / this.app.camera.zoom, false);
      if (hit && DB.geometry.TEXT_TYPES.has(hit.type)) {
        DB.textEditor.open(hit.id, doc.begin('Edit text'), false);
      } else if (!hit) {
        const snap = this.app.settings.snapGrid ? DB.snapping.snapToGrid : (v) => v;
        const { stroke, opacity, fontSize } = this.app.settings.defaults;
        const shape = DB.text.refit(DB.schema.create('text', { stroke, opacity, fontSize, x: snap(p.x), y: snap(p.y), text: '' }));
        const tx = doc.begin('Add text');
        tx.add(shape);
        DB.textEditor.open(shape.id, tx, true);
      }
    }

    panGesture(start) {
      const { camera } = this.app;
      let last = start;
      this.setCursor('grabbing');
      return {
        move: (p) => {
          camera.panBy(p.sx - last.sx, p.sy - last.sy);
          last = p;
        },
        up: () => this.refreshCursor(),
        cancel: () => this.refreshCursor(),
      };
    }

    onMove(ev) {
      const p = this.screenPoint(ev);
      this.lastPointer = p;
      DB.bus.emit('cursor', p);
      if (this.pointers.has(ev.pointerId)) this.pointers.set(ev.pointerId, p);
      if (this.pinch) { this.updatePinch(); return; }
      if (this.gesture) {
        this.gesture.move(p, ev);
        DB.bus.emit('overlay');
        return;
      }
      if (ev.pointerType !== 'touch') this.updateHover(p);
    }

    onUp(ev) {
      const p = this.screenPoint(ev);
      const wasPinching = !!this.pinch;
      this.pointers.delete(ev.pointerId);
      if (wasPinching) {
        if (this.pointers.size < 2) this.pinch = null;
        return;
      }
      // A press that became a drag cannot be the first half of a double-click.
      if (this.lastDown && Math.hypot(p.sx - this.lastDown.sx, p.sy - this.lastDown.sy) > 2) this.lastDown = null;
      if (this.gesture) {
        const { gesture } = this;
        this.gesture = null;
        gesture.up(p, ev);
        DB.bus.emit('overlay');
      }
      this.refreshCursor();
    }

    onCancel(ev) {
      this.pointers.delete(ev.pointerId);
      if (this.pinch && this.pointers.size < 2) this.pinch = null;
      this.cancelGesture();
    }

    onLeave() {
      this.lastPointer = null;
      if (this.app.transient.hover) {
        this.app.transient.hover = null;
        DB.bus.emit('overlay');
      }
      DB.bus.emit('cursor', null);
    }

    cancelGesture() {
      if (!this.gesture) return false;
      this.gesture.cancel();
      this.gesture = null;
      DB.bus.emit('overlay');
      return true;
    }

    pinchPair() {
      const [a, b] = Array.from(this.pointers.values());
      return { cx: (a.sx + b.sx) / 2, cy: (a.sy + b.sy) / 2, distance: Math.max(Math.hypot(a.sx - b.sx, a.sy - b.sy), 1) };
    }

    startPinch() {
      this.pinch = this.pinchPair();
    }

    updatePinch() {
      if (this.pointers.size < 2) return;
      const now = this.pinchPair();
      const { camera } = this.app;
      camera.zoomAt(now.cx, now.cy, now.distance / this.pinch.distance);
      camera.panBy(now.cx - this.pinch.cx, now.cy - this.pinch.cy);
      this.pinch = now;
    }

    // A mouse wheel moves in whole notches with no sideways part; a two-finger trackpad scroll does
    // not, and should pan. Browsers report a trackpad pinch as a wheel event with ctrlKey set.
    onWheel(ev) {
      ev.preventDefault();
      const { camera } = this.app;
      const p = this.screenPoint(ev);
      const pixels = ev.deltaMode === 1 ? 33 : 1;
      const dx = ev.deltaX * pixels;
      const dy = ev.deltaY * pixels;
      if (ev.shiftKey) { camera.panBy(-(dx || dy), 0); return; }
      const looksLikeTrackpad = !ev.ctrlKey && (dx !== 0 || (Math.abs(dy) < 40 && !Number.isInteger(dy)));
      if (looksLikeTrackpad) { camera.panBy(-dx, -dy); return; }
      const steps = ev.ctrlKey ? -dy / 40 : -dy / 100;
      camera.zoomToward(p.sx, p.sy, WHEEL_ZOOM_BASE ** steps);
    }

    updateHover(p) {
      const { app } = this;
      const doc = DB.boards.current();
      const tolerance = 4 / app.camera.zoom;
      let hover = null;
      let anchorTarget = null;
      if (app.tool === 'select' && !this.spaceHeld) {
        const hit = DB.hit.pick(doc, p.x, p.y, tolerance, false);
        hover = hit ? hit.id : null;
      } else if (app.tool === 'eraser') {
        const hit = DB.hit.pick(doc, p.x, p.y, 6 / app.camera.zoom, false);
        hover = hit ? hit.id : null;
      } else if (app.tool === 'line' || app.tool === 'arrow') {
        const target = DB.connectors.findTarget(doc, p.x, p.y, app.camera.zoom, null);
        anchorTarget = target ? { id: target.shape.id, side: target.side } : null;
      }
      const t = app.transient;
      const previousAnchor = t.anchorTarget;
      const anchorSame = (!previousAnchor && !anchorTarget) || (previousAnchor && anchorTarget && previousAnchor.id === anchorTarget.id && previousAnchor.side === anchorTarget.side);
      if (t.hover !== hover || !anchorSame) {
        t.hover = hover;
        t.anchorTarget = anchorTarget;
        DB.bus.emit('overlay');
      }
      this.updateCursor(p);
    }

    updateCursor(p) {
      const { app } = this;
      if (app.tool !== 'select' || this.spaceHeld) { this.refreshCursor(); return; }
      const doc = DB.boards.current();
      const picked = DB.handles.pick(doc, app.camera, p.sx, p.sy, 9);
      if (picked) {
        this.setCursor(DB.handles.cursorFor(picked.handle, picked.frame.rotation));
        return;
      }
      this.setCursor(app.transient.hover ? 'move' : 'default');
    }

    setCursor(cursor) {
      this.surface.style.cursor = cursor;
    }

    refreshCursor() {
      const { tool } = this.app;
      if (this.spaceHeld || tool === 'hand') this.setCursor('grab');
      else if (tool === 'select') this.setCursor('default');
      else if (tool === 'text') this.setCursor('text');
      else this.setCursor('crosshair');
    }
  }

  DB.Input = Input;
})(window.DB);

// Overview of the whole board with the current view marked. Click or drag it to move the view.
(function (DB) {
  'use strict';
  const { unionBounds, aabb } = DB.geometry;
  const { CANVAS, resolve } = DB.palette;

  const PAD = 8;
  const REPAINT_MS = 60;

  function create(app, wrap, canvas) {
    const ctx = canvas.getContext('2d');
    let layout = null;
    let timer = null;

    function worldBounds(doc) {
      const content = unionBounds(doc.orderedShapes());
      const view = app.camera.visibleRect();
      if (!content) return view;
      const x = Math.min(content.x, view.x);
      const y = Math.min(content.y, view.y);
      return { x, y, w: Math.max(content.x + content.w, view.x + view.w) - x, h: Math.max(content.y + content.h, view.y + view.h) - y };
    }

    function paint() {
      timer = null;
      if (wrap.hidden) return;
      const doc = DB.boards.current();
      if (!doc) return;
      const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const theme = app.theme();
      const colors = CANVAS[theme];
      const bounds = worldBounds(doc);
      const scale = Math.min((rect.width - PAD * 2) / Math.max(bounds.w, 1), (rect.height - PAD * 2) / Math.max(bounds.h, 1));
      const ox = (rect.width - bounds.w * scale) / 2 - bounds.x * scale;
      const oy = (rect.height - bounds.h * scale) / 2 - bounds.y * scale;
      layout = { scale, ox, oy };
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = resolve('graphite', theme);
      ctx.globalAlpha = 0.38;
      doc.order.forEach((id) => {
        const b = aabb(doc.shapes.get(id));
        ctx.fillRect(b.x * scale + ox, b.y * scale + oy, Math.max(b.w * scale, 1), Math.max(b.h * scale, 1));
      });
      ctx.fillStyle = colors.accent;
      ctx.globalAlpha = 1;
      doc.selection.forEach((id) => {
        const s = doc.shapes.get(id);
        if (!s) return;
        const b = aabb(s);
        ctx.fillRect(b.x * scale + ox, b.y * scale + oy, Math.max(b.w * scale, 1.5), Math.max(b.h * scale, 1.5));
      });
      const view = app.camera.visibleRect();
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(view.x * scale + ox, view.y * scale + oy, view.w * scale, view.h * scale);
    }

    function request() {
      if (timer === null) timer = setTimeout(paint, REPAINT_MS);
    }

    function centerOn(ev) {
      if (!layout) return;
      const rect = canvas.getBoundingClientRect();
      const wx = (ev.clientX - rect.left - layout.ox) / layout.scale;
      const wy = (ev.clientY - rect.top - layout.oy) / layout.scale;
      const { camera } = app;
      camera.set({ zoom: camera.zoom, ox: camera.width / 2 - wx * camera.zoom, oy: camera.height / 2 - wy * camera.zoom });
    }

    let dragging = false;
    let frozen = null;

    // The map rescales when the view leaves the content, so it holds still for the length of a drag.
    canvas.addEventListener('pointerdown', (ev) => {
      dragging = true;
      frozen = layout;
      canvas.setPointerCapture(ev.pointerId);
      centerOn(ev);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      layout = frozen;
      centerOn(ev);
    });
    const release = () => { dragging = false; frozen = null; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    return { request, paint };
  }

  DB.minimap = { create };
})(window.DB);

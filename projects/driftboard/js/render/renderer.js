// Owns the two stacked canvases and the frame loop. Shapes live on the scene canvas; selection,
// guides and rulers live on the overlay, so hovering or marquee dragging never repaints the shapes.
(function (DB) {
  'use strict';
  const { rectsOverlap, aabb } = DB.geometry;
  const { CANVAS } = DB.palette;

  const INDEX_THRESHOLD = 40;

  class Renderer {
    constructor(app, sceneCanvas, overlayCanvas) {
      this.app = app;
      this.scene = sceneCanvas;
      this.overlay = overlayCanvas;
      this.sceneCtx = sceneCanvas.getContext('2d', { alpha: false });
      this.overlayCtx = overlayCanvas.getContext('2d');
      this.dpr = 1;
      this.sceneDirty = true;
      this.overlayDirty = true;
      this.scheduled = false;
      this.stats = { ms: 0, drawn: 0 };
      this.frame = this.frame.bind(this);
    }

    resize() {
      const rect = this.overlay.parentElement.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      [this.scene, this.overlay].forEach((canvas) => {
        canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
        canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
      });
      this.app.camera.width = rect.width;
      this.app.camera.height = rect.height;
      this.requestAll();
    }

    schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      requestAnimationFrame(this.frame);
    }

    requestScene() { this.sceneDirty = true; this.overlayDirty = true; this.schedule(); }

    requestOverlay() { this.overlayDirty = true; this.schedule(); }

    requestAll() { this.requestScene(); }

    frame() {
      this.scheduled = false;
      if (this.sceneDirty) {
        this.sceneDirty = false;
        const started = performance.now();
        this.paintScene();
        this.stats.ms = performance.now() - started;
        DB.bus.emit('painted', this.stats);
      }
      if (this.overlayDirty) {
        this.overlayDirty = false;
        DB.overlay.paint(this.app, this.overlayCtx, this.dpr);
      }
    }

    // The index only pays for itself on larger boards; a small board just walks its z-order.
    visibleShapes(doc) {
      const view = this.app.camera.visibleRect();
      const margin = 40 / this.app.camera.zoom;
      const rect = { x: view.x - margin, y: view.y - margin, w: view.w + margin * 2, h: view.h + margin * 2 };
      const inView = (s) => rectsOverlap(aabb(s), rect);
      if (doc.shapes.size < INDEX_THRESHOLD) return doc.orderedShapes().filter(inView);
      return doc.spatial.query(rect)
        .sort((a, b) => doc.zIndex.get(a) - doc.zIndex.get(b))
        .map((id) => doc.shapes.get(id))
        .filter((s) => s && inView(s));
    }

    paintScene() {
      const { app, sceneCtx: ctx, dpr } = this;
      const { camera } = app;
      const theme = app.theme();
      const colors = CANVAS[theme];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, camera.width, camera.height);
      if (app.settings.showGrid) this.paintGrid(ctx, colors);
      const doc = DB.boards.current();
      if (!doc) return;
      ctx.setTransform(dpr * camera.zoom, 0, 0, dpr * camera.zoom, dpr * camera.ox, dpr * camera.oy);
      const shapes = this.visibleShapes(doc);
      const opts = { theme, background: colors.bg, zoom: camera.zoom, skipTextId: app.transient.editingId };
      shapes.forEach((s) => DB.painter.paintShape(ctx, s, opts));
      this.stats.drawn = shapes.length;
    }

    paintGrid(ctx, colors) {
      const { camera, dpr } = { camera: this.app.camera, dpr: this.dpr };
      let step = DB.snapping.GRID;
      while (step * camera.zoom < 10) step *= 5;
      const major = step * 5;
      const drawLines = (spacing, color, skipMajor) => {
        const start = camera.toWorld(0, 0);
        ctx.beginPath();
        const offset = 0.5 / dpr;
        for (let x = Math.floor(start.x / spacing) * spacing; x * camera.zoom + camera.ox <= camera.width; x += spacing) {
          if (!(skipMajor && x % major === 0)) {
            const sx = Math.round((x * camera.zoom + camera.ox) * dpr) / dpr + offset;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, camera.height);
          }
        }
        for (let y = Math.floor(start.y / spacing) * spacing; y * camera.zoom + camera.oy <= camera.height; y += spacing) {
          if (!(skipMajor && y % major === 0)) {
            const sy = Math.round((y * camera.zoom + camera.oy) * dpr) / dpr + offset;
            ctx.moveTo(0, sy);
            ctx.lineTo(camera.width, sy);
          }
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1 / dpr;
        ctx.setLineDash([]);
        ctx.stroke();
      };
      drawLines(step, colors.gridMinor, true);
      drawLines(major, colors.gridMajor, false);
    }
  }

  DB.Renderer = Renderer;
})(window.DB);

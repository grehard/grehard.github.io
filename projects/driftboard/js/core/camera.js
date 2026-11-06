// Screen = world * zoom + offset. All pan and zoom goes through here.
(function (DB) {
  'use strict';
  const { clamp } = DB.util;

  const MIN_ZOOM = 0.05;
  const MAX_ZOOM = 8;
  const ANIMATION_MS = 130;

  class Camera {
    constructor(onChange) {
      this.ox = 60;
      this.oy = 60;
      this.zoom = 1;
      this.width = 1;
      this.height = 1;
      this.onChange = onChange;
      this.target = null;
      this.frame = 0;
    }

    toWorld(sx, sy) { return { x: (sx - this.ox) / this.zoom, y: (sy - this.oy) / this.zoom }; }

    toScreen(wx, wy) { return { x: wx * this.zoom + this.ox, y: wy * this.zoom + this.oy }; }

    visibleRect() {
      const a = this.toWorld(0, 0);
      return { x: a.x, y: a.y, w: this.width / this.zoom, h: this.height / this.zoom };
    }

    set(view) {
      this.stop();
      this.ox = view.ox;
      this.oy = view.oy;
      this.zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
      this.onChange();
    }

    panBy(dx, dy) {
      this.stop();
      this.ox += dx;
      this.oy += dy;
      this.onChange();
    }

    // Immediate zoom that keeps the world point under (sx, sy) fixed; pinch uses this.
    zoomAt(sx, sy, factor) {
      this.stop();
      const zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const applied = zoom / this.zoom;
      this.ox = sx - (sx - this.ox) * applied;
      this.oy = sy - (sy - this.oy) * applied;
      this.zoom = zoom;
      this.onChange();
    }

    // Animated zoom about a screen point. Consecutive wheel notches compound on the pending target.
    zoomToward(sx, sy, factor) {
      const base = this.target || { ox: this.ox, oy: this.oy, zoom: this.zoom };
      const zoom = clamp(base.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const applied = zoom / base.zoom;
      this.animateTo({ ox: sx - (sx - base.ox) * applied, oy: sy - (sy - base.oy) * applied, zoom });
    }

    fitRect(rect, padding, maxZoom) {
      const usableW = Math.max(this.width - padding * 2, 40);
      const usableH = Math.max(this.height - padding * 2, 40);
      const zoom = clamp(Math.min(usableW / Math.max(rect.w, 1), usableH / Math.max(rect.h, 1)), MIN_ZOOM, maxZoom);
      return { zoom, ox: this.width / 2 - (rect.x + rect.w / 2) * zoom, oy: this.height / 2 - (rect.y + rect.h / 2) * zoom };
    }

    stop() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.target = null;
    }

    animateTo(target) {
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { this.set(target); return; }
      if (this.frame) cancelAnimationFrame(this.frame);
      const from = { ox: this.ox, oy: this.oy, zoom: this.zoom };
      const started = performance.now();
      this.target = target;
      const step = (now) => {
        const t = Math.min(1, (now - started) / ANIMATION_MS);
        if (t >= 1) {
          this.ox = target.ox;
          this.oy = target.oy;
          this.zoom = target.zoom;
          this.frame = 0;
          this.target = null;
        } else {
          this.interpolate(from, target, 1 - (1 - t) * (1 - t));
          this.frame = requestAnimationFrame(step);
        }
        this.onChange();
      };
      this.frame = requestAnimationFrame(step);
    }

    // A zoom between two views has one screen point that stays fixed. Interpolating about it
    // keeps the point under the cursor still, which linear offset interpolation would not.
    interpolate(from, to, t) {
      if (Math.abs(to.zoom - from.zoom) < 1e-9) {
        this.ox = from.ox + (to.ox - from.ox) * t;
        this.oy = from.oy + (to.oy - from.oy) * t;
        return;
      }
      const zoom = from.zoom * (to.zoom / from.zoom) ** t;
      const span = to.zoom - from.zoom;
      const fx = (from.ox * to.zoom - to.ox * from.zoom) / span;
      const fy = (from.oy * to.zoom - to.oy * from.zoom) / span;
      const ratio = zoom / from.zoom;
      this.ox = fx - (fx - from.ox) * ratio;
      this.oy = fy - (fy - from.oy) * ratio;
      this.zoom = zoom;
    }
  }

  Camera.MIN_ZOOM = MIN_ZOOM;
  Camera.MAX_ZOOM = MAX_ZOOM;
  DB.Camera = Camera;
})(window.DB);

// A small force-directed layout: pairwise repulsion, springs along edges and a pull
// toward the centre. Start positions come from a sunflower spiral, not Math.random,
// so the same notes always settle into the same picture.
(function (MG) {
  'use strict';

  const GOLDEN_ANGLE = 2.39996;
  const DEFAULTS = {
    repulsion: 11000, springLength: 118, springStrength: 0.04,
    gravity: 0.018, damping: 0.82, cooling: 0.985, minAlpha: 0.02,
    aspect: 1, // height / width of the space to fill: gravity is split so the layout takes its shape.
  };

  function createSimulation(nodes, edges, options) {
    const cfg = Object.assign({}, DEFAULTS, options);
    const placed = nodes.map((node, i) => {
      const radius = 26 * Math.sqrt(i + 0.5);
      return Object.assign({}, node, {
        x: radius * Math.cos(i * GOLDEN_ANGLE), y: radius * Math.sin(i * GOLDEN_ANGLE),
        vx: 0, vy: 0, pinned: false,
      });
    });
    const byKey = new Map(placed.map((node) => [node.key, node]));
    const links = edges
      .map((edge) => ({ source: byKey.get(edge.source), target: byKey.get(edge.target) }))
      .filter((link) => link.source && link.target);
    const aspect = Math.min(2.2, Math.max(0.45, cfg.aspect));
    const gravityX = cfg.gravity * aspect;
    const gravityY = cfg.gravity / aspect;
    let alpha = 1;

    function applyRepulsion() {
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          const dx = a.x - b.x || 0.01;
          const dy = a.y - b.y || 0.01;
          const distSq = Math.max(dx * dx + dy * dy, 25);
          const force = (cfg.repulsion * alpha) / distSq;
          const dist = Math.sqrt(distSq);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
    }

    function applySprings() {
      links.forEach(({ source, target }) => {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - cfg.springLength) * cfg.springStrength * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        source.vx += fx; source.vy += fy;
        target.vx -= fx; target.vy -= fy;
      });
    }

    function integrate() {
      placed.forEach((node) => {
        node.vx = (node.vx - node.x * gravityX * alpha) * cfg.damping;
        node.vy = (node.vy - node.y * gravityY * alpha) * cfg.damping;
        if (node.pinned) {
          node.vx = node.vy = 0;
        } else {
          node.x += node.vx;
          node.y += node.vy;
        }
      });
    }

    function tick() {
      applyRepulsion();
      applySprings();
      integrate();
      alpha *= cfg.cooling;
      return alpha > cfg.minAlpha;
    }

    return {
      nodes: placed,
      links,
      tick,
      reheat(value) { alpha = Math.max(alpha, value); },
      get running() { return alpha > cfg.minAlpha; },
    };
  }

  MG.Force = { createSimulation };
})(window.MG = window.MG || {});

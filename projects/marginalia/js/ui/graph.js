// Graph page: draws the force layout as SVG and handles dragging, panning and zooming.
(function (MG) {
  'use strict';

  const { Store, Links, Force } = MG;
  const { svgEl, $, plural } = MG.Dom;

  const FIT_PADDING = 64;
  const FIT_PADDING_NARROW = 44;
  const NARROW_WIDTH = 600;
  const MAX_FIT_SCALE = 1.5;
  const LABEL_MAX = 28;
  const CLICK_SLOP_PX = 5;
  const COMPACT_BELOW_SCALE = 1.3; // On a phone below this zoom, only well-linked notes keep a label.
  const HUB_DEGREE = 5;
  const LABEL_CHAR_PX = 6.2;
  const LABEL_HEIGHT_PX = 16;
  // Most of the settling happens before the first draw, so the graph only eases into place.
  const WARM_TICKS = 170;
  const WARM_TICKS_REDUCED_MOTION = 400;

  let sim = null;
  let frame = 0;
  let view = { x: 0, y: 0, k: 1 };
  let autoFit = true;
  let parts = null; // {root, links: [{el, link}], nodes: [{el, node}]}
  let pointer = null;

  function nodeRadius(node) {
    return Math.min(14, 5 + Math.sqrt(node.degree) * 2.4);
  }

  function clip(text) {
    return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}\u2026` : text;
  }

  function applyView() {
    parts.root.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    const svg = $('graph-svg');
    svg.classList.toggle('is-compact', svg.clientWidth < NARROW_WIDTH && view.k < COMPACT_BELOW_SCALE);
    // Nodes and labels keep their size on screen; zooming only spreads them apart.
    const inverse = 1 / view.k;
    parts.nodes.forEach(({ el, node }) => {
      el.setAttribute('transform', `translate(${node.x} ${node.y}) scale(${inverse})`);
    });
    parts.links.forEach(({ el, link }) => {
      el.setAttribute('x1', link.source.x);
      el.setAttribute('y1', link.source.y);
      el.setAttribute('x2', link.target.x);
      el.setAttribute('y2', link.target.y);
      el.setAttribute('stroke-width', inverse * 1.1);
    });
  }

  /** Most-linked notes choose first. A label that would overlap another moves above its node. */
  function placeLabels() {
    const placed = [];
    const overlaps = (x, top, width) => placed.some((box) => (
      Math.abs(box.x - x) < (box.width + width) / 2 + 4 && Math.abs(box.top - top) < LABEL_HEIGHT_PX
    ));
    [...parts.nodes].sort((a, b) => b.node.degree - a.node.degree).forEach(({ node, label }) => {
      const r = nodeRadius(node);
      const x = node.x * view.k;
      const y = node.y * view.k;
      const width = label.textContent.length * LABEL_CHAR_PX;
      const below = y + r + 3;
      const above = y - r - 3 - LABEL_HEIGHT_PX;
      const useAbove = overlaps(x, below, width) && !overlaps(x, above, width);
      placed.push({ x, top: useAbove ? above : below, width });
      label.setAttribute('y', useAbove ? -r - 7 : r + 14);
    });
  }

  function fit() {
    const svg = $('graph-svg');
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;
    if (!sim.nodes.length) return;
    const xs = sim.nodes.map((n) => n.x);
    const ys = sim.nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = width < NARROW_WIDTH ? FIT_PADDING_NARROW : FIT_PADDING;
    const scale = Math.min(
      (width - padding * 2) / Math.max(maxX - minX, 1),
      (height - padding * 2) / Math.max(maxY - minY, 1),
      MAX_FIT_SCALE,
    );
    view = {
      k: Math.max(scale, 0.05),
      x: width / 2 - ((minX + maxX) / 2) * Math.max(scale, 0.05),
      y: height / 2 - ((minY + maxY) / 2) * Math.max(scale, 0.05),
    };
  }

  function loop() {
    const running = sim.tick();
    if (autoFit) fit();
    applyView();
    if (!running) placeLabels();
    frame = running ? requestAnimationFrame(loop) : 0;
  }

  function startLoop() {
    if (!frame) frame = requestAnimationFrame(loop);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
  }

  function neighbourKeys(key) {
    const keys = new Set([key]);
    sim.links.forEach(({ source, target }) => {
      if (source.key === key) keys.add(target.key);
      if (target.key === key) keys.add(source.key);
    });
    return keys;
  }

  function highlight(key) {
    const keys = key ? neighbourKeys(key) : null;
    parts.nodes.forEach(({ el, node }) => el.classList.toggle('is-dim', !!keys && !keys.has(node.key)));
    parts.links.forEach(({ el, link }) => {
      el.classList.toggle('is-dim', !!key && link.source.key !== key && link.target.key !== key);
    });
  }

  function activate(node) {
    if (node.ghost) MG.App.followWiki(node.title);
    else MG.App.open(node.id);
  }

  function buildNode(node, activeId) {
    const classes = ['graph-node'];
    if (node.ghost) classes.push('is-ghost');
    if (node.id && node.id === activeId) classes.push('is-current');
    if (node.degree >= HUB_DEGREE) classes.push('is-hub');
    const links = plural(node.degree, 'link');
    const el = svgEl('g', {
      class: classes.join(' '), tabindex: '0', role: 'button', 'data-title': node.title,
      'aria-label': node.ghost ? `Create note ${node.title}, ${links}` : `Open ${node.title}, ${links}`,
    });
    const r = nodeRadius(node);
    el.appendChild(svgEl('circle', { r: r + 8, class: 'graph-hit' }));
    el.appendChild(svgEl('circle', { r, class: 'graph-dot' }));
    const label = svgEl('text', { y: r + 14, 'text-anchor': 'middle', class: 'graph-label' });
    label.textContent = clip(node.title);
    el.appendChild(label);
    el.addEventListener('pointerenter', () => { if (!pointer) highlight(node.key); });
    el.addEventListener('pointerleave', () => { if (!pointer) highlight(null); });
    el.addEventListener('focus', () => highlight(node.key));
    el.addEventListener('blur', () => highlight(null));
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate(node);
      }
    });
    el.addEventListener('pointerdown', (event) => beginNodeDrag(event, node));
    return { el, node, label };
  }

  function toGraphPoint(event) {
    const rect = $('graph-svg').getBoundingClientRect();
    return { x: (event.clientX - rect.left - view.x) / view.k, y: (event.clientY - rect.top - view.y) / view.k };
  }

  function beginNodeDrag(event, node) {
    event.stopPropagation();
    pointer = { kind: 'node', node, id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    $('graph-svg').setPointerCapture(event.pointerId);
  }

  function beginPan(event) {
    pointer = { kind: 'pan', id: event.pointerId, startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y, moved: false };
    $('graph-svg').setPointerCapture(event.pointerId);
    $('graph-svg').classList.add('is-panning');
  }

  function onPointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.hypot(dx, dy) > CLICK_SLOP_PX) pointer.moved = true;
    if (!pointer.moved) return;
    autoFit = false;
    if (pointer.kind === 'pan') {
      view.x = pointer.viewX + dx;
      view.y = pointer.viewY + dy;
      applyView();
    } else {
      const point = toGraphPoint(event);
      pointer.node.pinned = true;
      pointer.node.x = point.x;
      pointer.node.y = point.y;
      sim.reheat(0.25);
      startLoop();
    }
  }

  function onPointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const finished = pointer;
    pointer = null;
    $('graph-svg').classList.remove('is-panning');
    if (finished.kind === 'node' && !finished.moved) activate(finished.node);
  }

  function zoomAt(factor, cx, cy) {
    const k = Math.min(4, Math.max(0.15, view.k * factor));
    view.x = cx - ((cx - view.x) / view.k) * k;
    view.y = cy - ((cy - view.y) / view.k) * k;
    view.k = k;
    autoFit = false;
    applyView();
    placeLabels();
  }

  function zoomButton(factor) {
    const svg = $('graph-svg');
    zoomAt(factor, svg.clientWidth / 2, svg.clientHeight / 2);
  }

  function onWheel(event) {
    event.preventDefault();
    const rect = $('graph-svg').getBoundingClientRect();
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
  }

  function clearSvg() {
    const svg = $('graph-svg');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    return svg;
  }

  function render() {
    stop();
    const model = Links.buildGraph(Store.live(), {
      ghosts: $('graph-ghosts').checked,
      orphans: $('graph-orphans').checked,
    });
    $('graph-count').textContent = `${plural(model.nodes.filter((n) => !n.ghost).length, 'note')}, ${plural(model.edges.length, 'link')}`;
    $('graph-empty').hidden = model.nodes.length > 0;
    const area = $('graph-svg');
    sim = Force.createSimulation(model.nodes, model.edges, { aspect: (area.clientHeight || 600) / (area.clientWidth || 800) });
    autoFit = true;
    const svg = clearSvg();
    const root = svgEl('g');
    const linkLayer = svgEl('g');
    const nodeLayer = svgEl('g');
    root.append(linkLayer, nodeLayer);
    svg.appendChild(root);
    const links = sim.links.map((link) => {
      const el = svgEl('line', { class: 'graph-edge' });
      linkLayer.appendChild(el);
      return { el, link };
    });
    const activeId = MG.DocView.activeId;
    const nodes = sim.nodes.map((node) => {
      const built = buildNode(node, activeId);
      nodeLayer.appendChild(built.el);
      return built;
    });
    parts = { root, links, nodes };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const warmTicks = reduced ? WARM_TICKS_REDUCED_MOTION : WARM_TICKS;
    for (let i = 0; i < warmTicks && sim.running; i++) sim.tick();
    fit();
    applyView();
    placeLabels();
    if (sim.running) startLoop();
  }

  function refit() {
    autoFit = true;
    fit();
    applyView();
    placeLabels();
  }

  function init() {
    const svg = $('graph-svg');
    svg.addEventListener('pointerdown', beginPan);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerUp);
    svg.addEventListener('wheel', onWheel, { passive: false });
    $('graph-ghosts').addEventListener('change', render);
    $('graph-orphans').addEventListener('change', render);
    $('graph-zoom-in').addEventListener('click', () => zoomButton(1.25));
    $('graph-zoom-out').addEventListener('click', () => zoomButton(0.8));
    $('graph-fit').addEventListener('click', refit);
    window.addEventListener('resize', () => {
      if (parts && autoFit && !$('graph-page').hidden) refit();
    });
  }

  MG.GraphView = { init, render, stop };
})(window.MG = window.MG || {});

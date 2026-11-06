// Drag and drop built on pointer events, so mouse and touch share one code path. Native HTML5
// drag doesn't fire on touch screens. On touch a drag starts with a press and hold, which leaves
// ordinary swipes free to scroll the page.
Mise.Drag = (() => {
  const { h } = Mise.Dom;
  const MOUSE_THRESHOLD = 5;
  const TOUCH_SLOP = 10;
  const HOLD_MS = 280;
  const EDGE = 48;

  /**
   * Makes `[data-drag]` elements inside `root` draggable onto `[data-drop]` elements.
   * `onDrop(dragValue, dropElement)` runs on a successful drop.
   */
  function attach(root, onDrop) {
    let session = null;

    function startDragging(event) {
      session.active = true;
      session.ghost = h('div', { class: 'drag-ghost' }, session.source.dataset.dragLabel || session.source.textContent);
      document.body.appendChild(session.ghost);
      document.body.classList.add('is-dragging');
      session.source.classList.add('drag-source');
      moveGhost(event);
    }

    function moveGhost(event) {
      session.ghost.style.transform = `translate(${event.clientX + 10}px, ${event.clientY + 8}px)`;
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const target = under ? under.closest('[data-drop]') : null;
      if (target !== session.target) {
        if (session.target) session.target.classList.remove('drop-over');
        if (target) target.classList.add('drop-over');
        session.target = target;
      }
      autoScroll(event);
    }

    function autoScroll(event) {
      if (event.clientY < EDGE) window.scrollBy(0, -12);
      else if (window.innerHeight - event.clientY < EDGE) window.scrollBy(0, 12);
    }

    function onPointerMove(event) {
      if (!session || event.pointerId !== session.pointerId) return;
      const moved = Math.hypot(event.clientX - session.x, event.clientY - session.y);
      if (session.active) {
        moveGhost(event);
      } else if (session.touch) {
        if (moved > TOUCH_SLOP) finish(); // The finger is scrolling, not holding.
      } else if (moved > MOUSE_THRESHOLD) {
        startDragging(event);
      }
    }

    function onPointerUp(event) {
      if (!session || event.pointerId !== session.pointerId) return;
      const { active, target, source } = session;
      finish();
      if (!active) return;
      swallowNextClick();
      if (target) onDrop(source.dataset.drag, target);
    }

    // The browser still sends a click after a drag ends over the same element.
    function swallowNextClick() {
      const swallow = (event) => { event.stopPropagation(); event.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
    }

    function blockTouchScroll(event) {
      if (session && session.active) event.preventDefault();
    }

    function blockContextMenu(event) {
      if (session) event.preventDefault();
    }

    function finish() {
      if (!session) return;
      clearTimeout(session.holdTimer);
      if (session.ghost) session.ghost.remove();
      if (session.target) session.target.classList.remove('drop-over');
      session.source.classList.remove('drag-source');
      document.body.classList.remove('is-dragging');
      session = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', finish);
      document.removeEventListener('touchmove', blockTouchScroll);
      document.removeEventListener('contextmenu', blockContextMenu);
    }

    root.addEventListener('pointerdown', (event) => {
      const source = event.target.closest('[data-drag]');
      if (!source || event.button !== 0 || session) return;
      const touch = event.pointerType !== 'mouse';
      session = { source, pointerId: event.pointerId, x: event.clientX, y: event.clientY, touch, active: false, target: null, ghost: null };
      if (touch) session.holdTimer = setTimeout(() => { if (session) startDragging(event); }, HOLD_MS);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', finish);
      document.addEventListener('touchmove', blockTouchScroll, { passive: false });
      document.addEventListener('contextmenu', blockContextMenu);
    });
  }

  return { attach };
})();

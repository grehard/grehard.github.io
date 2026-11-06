// Pointer-event drag for the builder: add from the palette and reorder on the canvas.
// It works out where the drop would land on every move and only touches the form on release.
FL.drag = (function () {
  const { h } = FL.util;
  const THRESHOLD = 5;
  const SCROLL_ZONE = 56;
  const SCROLL_SPEED = 12;

  /**
   * Call from a pointerdown handler.
   * config: { ghost(): node, sourceId, scroller, onDrop({ pageId, index }) }
   */
  function begin(event, config) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let ghost = null;
    let line = null;
    let target = null;
    let frame = 0;
    let pointerY = startY;
    let pointerX = startX;

    function start() {
      dragging = true;
      ghost = h('div', { class: 'drag-ghost' }, config.ghost());
      line = h('div', { class: 'drop-line', hidden: true });
      document.body.append(ghost, line);
      document.body.classList.add('is-dragging');
      if (config.sourceId) {
        const card = document.querySelector(`.field-card[data-id="${CSS.escape(config.sourceId)}"]`);
        if (card) card.classList.add('is-source');
      }
      frame = requestAnimationFrame(autoScroll);
    }

    function autoScroll() {
      const box = config.scroller.getBoundingClientRect();
      const inside = pointerX >= box.left && pointerX <= box.right;
      if (inside && pointerY < box.top + SCROLL_ZONE) config.scroller.scrollTop -= SCROLL_SPEED;
      else if (inside && pointerY > box.bottom - SCROLL_ZONE) config.scroller.scrollTop += SCROLL_SPEED;
      updateTarget();
      frame = requestAnimationFrame(autoScroll);
    }

    function nearestList() {
      const box = config.scroller.getBoundingClientRect();
      if (pointerX < box.left || pointerX > box.right || pointerY < box.top || pointerY > box.bottom) return null;
      const lists = Array.from(config.scroller.querySelectorAll('.page-fields'));
      let best = null;
      let bestDistance = Infinity;
      lists.forEach((list) => {
        const rect = list.getBoundingClientRect();
        const distance = pointerY < rect.top ? rect.top - pointerY : Math.max(0, pointerY - rect.bottom);
        if (distance < bestDistance) { best = list; bestDistance = distance; }
      });
      return best;
    }

    /** index counts cards other than the one being dragged, because the move removes it first. */
    function updateTarget() {
      const list = nearestList();
      if (!list) {
        target = null;
        line.hidden = true;
        return;
      }
      const cards = Array.from(list.querySelectorAll(':scope > .field-card')).filter((card) => card.dataset.id !== config.sourceId);
      let index = cards.length;
      for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        if (pointerY < rect.top + rect.height / 2) { index = i; break; }
      }
      target = { pageId: list.dataset.page, index };
      placeLine(list, cards, index);
    }

    function placeLine(list, cards, index) {
      const listBox = list.getBoundingClientRect();
      let y;
      if (!cards.length) y = listBox.top + 2;
      else if (index < cards.length) y = cards[index].getBoundingClientRect().top - 5;
      else y = cards[cards.length - 1].getBoundingClientRect().bottom + 5;
      line.hidden = false;
      line.style.left = `${listBox.left}px`;
      line.style.width = `${listBox.width}px`;
      line.style.top = `${y - 1}px`;
    }

    function onMove(moveEvent) {
      pointerX = moveEvent.clientX;
      pointerY = moveEvent.clientY;
      if (!dragging) {
        if (Math.hypot(pointerX - startX, pointerY - startY) < THRESHOLD) return;
        start();
      }
      moveEvent.preventDefault();
      ghost.style.transform = `translate(${pointerX + 10}px, ${pointerY + 8}px)`;
      updateTarget();
    }

    function teardown() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(frame);
      if (ghost) ghost.remove();
      if (line) line.remove();
      document.body.classList.remove('is-dragging');
      document.querySelectorAll('.field-card.is-source').forEach((card) => card.classList.remove('is-source'));
    }

    function swallowNextClick() {
      const swallow = (clickEvent) => { clickEvent.stopPropagation(); clickEvent.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
    }

    function onUp() {
      const wasDragging = dragging;
      const drop = target;
      teardown();
      if (!wasDragging) return;
      swallowNextClick();
      if (drop) config.onDrop(drop);
    }

    function onCancel() {
      teardown();
    }

    function onKey(keyEvent) {
      if (keyEvent.key !== 'Escape' || !dragging) return;
      keyEvent.stopPropagation();
      teardown();
      swallowNextClick();
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
  }

  return { begin };
})();

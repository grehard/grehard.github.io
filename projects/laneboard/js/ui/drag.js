// Pointer-event drag and drop for cards and lanes. One code path serves mouse, pen and touch.
//   Mouse and pen start after a few pixels of movement. Touch starts after a short press,
//   so a finger swiping over the board still scrolls it.
const Drag = (() => {
  const MOUSE_THRESHOLD = 5;
  const TOUCH_PRESS_MS = 220;
  const TOUCH_SLOP = 8;
  const EDGE_SIZE = 48;
  const MAX_SCROLL_STEP = 14;

  let host = null;
  let session = null;

  const isActive = () => !!(session && session.active);

  function onPointerDown(event) {
    if (event.button !== 0 || session || event.target.closest('[data-no-drag]')) return;
    const card = event.target.closest('.card[data-card-id]');
    const head = card ? null : event.target.closest('.lane-head');
    const element = card || (head && head.closest('.lane'));
    if (!element) return;
    session = {
      kind: card ? 'card' : 'lane', element, pointerId: event.pointerId, touch: event.pointerType === 'touch',
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, pressTimer: null,
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    if (session.touch) session.pressTimer = setTimeout(activate, TOUCH_PRESS_MS);
  }

  function onPointerMove(event) {
    if (event.pointerId !== session.pointerId) return;
    session.x = event.clientX;
    session.y = event.clientY;
    if (session.active) { moveGhost(); updateDropTarget(); return; }
    const distance = Math.hypot(session.x - session.startX, session.y - session.startY);
    if (session.touch) { if (distance > TOUCH_SLOP) endSession(); return; }
    if (distance >= MOUSE_THRESHOLD) activate();
  }

  function onPointerUp(event) {
    if (event.pointerId !== session.pointerId) return;
    if (session.active) finish(true);
    else endSession();
  }

  function onPointerCancel(event) {
    if (event.pointerId !== session.pointerId) return;
    if (session.active) finish(false);
    else endSession();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); finish(false); }
  }

  function activate() {
    clearTimeout(session.pressTimer);
    const { element, kind } = session;
    const rect = element.getBoundingClientRect();
    session.active = true;
    session.grabX = session.startX - rect.left;
    session.grabY = session.startY - rect.top;

    const ghost = element.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-card-id');
    ghost.removeAttribute('data-column-id');
    ghost.querySelectorAll('[data-fkey],[data-card-id]').forEach((el) => { el.removeAttribute('data-fkey'); el.removeAttribute('data-card-id'); });
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.append(ghost);
    session.ghost = ghost;

    const slot = document.createElement(kind === 'card' ? 'li' : 'div');
    slot.className = kind === 'card' ? 'drop-slot' : 'lane-slot';
    if (kind === 'card') slot.style.height = `${rect.height}px`;
    else slot.style.width = `${rect.width}px`;
    element.parentNode.insertBefore(slot, element);
    element.classList.add('drag-source');
    session.slot = slot;
    session.originalNext = kind === 'card' ? nextCardId(slot) : nextLaneId(slot);
    session.originalLane = kind === 'card' ? element.closest('.lane') : null;

    // Capture on a stable ancestor: the dragged element itself gets hidden, and capture keeps
    // the drag alive when the pointer leaves the iframe the portfolio embeds this app in.
    try { host.setPointerCapture(session.pointerId); } catch (e) { /* pointer already released */ }
    document.body.classList.add('is-dragging');
    window.addEventListener('keydown', onKeydown, true);
    moveGhost();
    updateDropTarget();
    session.frame = requestAnimationFrame(autoScroll);
  }

  function moveGhost() {
    session.ghost.style.transform = `translate(${session.x - session.grabX}px, ${session.y - session.grabY}px)`;
  }

  function nextCardId(slot) {
    let next = slot.nextElementSibling;
    while (next && !(next.classList.contains('card') && !next.classList.contains('drag-source'))) next = next.nextElementSibling;
    return next ? next.dataset.cardId : null;
  }

  function nextLaneId(slot) {
    let next = slot.nextElementSibling;
    while (next && !(next.classList.contains('lane') && !next.classList.contains('drag-source'))) next = next.nextElementSibling;
    return next ? next.dataset.columnId : null;
  }

  function nearestLane() {
    const lanes = [...host.querySelectorAll('.lane:not(.drag-source)')];
    let best = null;
    let bestDistance = Infinity;
    lanes.forEach((lane) => {
      const rect = lane.getBoundingClientRect();
      const distance = session.x < rect.left ? rect.left - session.x : session.x > rect.right ? session.x - rect.right : 0;
      if (distance < bestDistance) { best = lane; bestDistance = distance; }
    });
    return best;
  }

  function updateDropTarget() {
    if (session.kind === 'card') updateCardTarget();
    else updateLaneTarget();
  }

  function updateCardTarget() {
    const lane = nearestLane();
    if (!lane) return;
    const list = lane.querySelector('.lane-cards');
    const cards = [...list.querySelectorAll('.card:not(.drag-source)')];
    const below = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return session.y < rect.top + rect.height / 2;
    }) || null;
    const { slot } = session;
    const alreadyThere = slot.parentNode === list && nextCardId(slot) === (below ? below.dataset.cardId : null);
    if (!alreadyThere) list.insertBefore(slot, below);
    if (session.targetLane !== lane) {
      if (session.targetLane) session.targetLane.classList.remove('is-drop-target');
      lane.classList.add('is-drop-target');
      session.targetLane = lane;
      noteLimitPreview(lane);
    }
  }

  // While hovering, the lane says up front whether a drop would push it past its limit.
  function noteLimitPreview(lane) {
    document.querySelectorAll('.lane.would-exceed').forEach((el) => el.classList.remove('would-exceed'));
    if (lane === session.originalLane) return;
    const column = Model.columnById(App.project(), lane.dataset.columnId);
    const wip = Model.wipState(column.cardIds.length + 1, column.limit);
    if (wip.level === 'over') lane.classList.add('would-exceed');
  }

  function updateLaneTarget() {
    const board = host.querySelector('.board');
    const lanes = [...board.querySelectorAll('.lane:not(.drag-source)')];
    const after = lanes.find((lane) => {
      const rect = lane.getBoundingClientRect();
      return session.x < rect.left + rect.width / 2;
    }) || null;
    const { slot } = session;
    if (nextLaneId(slot) !== (after ? after.dataset.columnId : null)) board.insertBefore(slot, after || board.querySelector('.add-lane'));
  }

  function edgeStep(position, start, end) {
    if (position < start + EDGE_SIZE) return -Math.ceil(MAX_SCROLL_STEP * (1 - Math.max(0, position - start) / EDGE_SIZE));
    if (position > end - EDGE_SIZE) return Math.ceil(MAX_SCROLL_STEP * (1 - Math.max(0, end - position) / EDGE_SIZE));
    return 0;
  }

  function autoScroll() {
    if (!isActive()) return;
    const board = host.querySelector('.board');
    const boardRect = board.getBoundingClientRect();
    const stepX = edgeStep(session.x, boardRect.left, boardRect.right);
    let moved = false;
    if (stepX && board.scrollWidth > board.clientWidth) { board.scrollLeft += stepX; moved = true; }
    if (session.kind === 'card' && session.targetLane) {
      const list = session.targetLane.querySelector('.lane-cards');
      const listRect = list.getBoundingClientRect();
      const stepY = edgeStep(session.y, listRect.top, listRect.bottom);
      if (stepY && list.scrollHeight > list.clientHeight) { list.scrollTop += stepY; moved = true; }
    }
    if (moved) updateDropTarget();
    session.frame = requestAnimationFrame(autoScroll);
  }

  function readDrop() {
    const { kind, slot, element, originalNext, originalLane } = session;
    if (kind === 'card') {
      const lane = slot.closest('.lane');
      const before = nextCardId(slot);
      const unchanged = lane === originalLane && before === originalNext;
      return unchanged ? null : { cardId: element.dataset.cardId, columnId: lane.dataset.columnId, before };
    }
    const before = nextLaneId(slot);
    return before === originalNext ? null : { columnId: element.dataset.columnId, before };
  }

  function finish(commit) {
    const { kind } = session;
    const drop = commit ? readDrop() : null;
    cancelAnimationFrame(session.frame);
    session.ghost.remove();
    session.slot.remove();
    session.element.classList.remove('drag-source');
    if (session.targetLane) session.targetLane.classList.remove('is-drop-target');
    document.querySelectorAll('.lane.would-exceed').forEach((el) => el.classList.remove('would-exceed'));
    document.body.classList.remove('is-dragging');
    window.removeEventListener('keydown', onKeydown, true);
    try { host.releasePointerCapture(session.pointerId); } catch (e) { /* already released */ }
    swallowNextClick();
    endSession();
    if (!drop) { App.render(); return; }
    if (kind === 'card') Actions.moveCard(drop.cardId, drop.columnId, drop.before);
    else Actions.moveColumn(drop.columnId, drop.before);
  }

  // The click that ends a drag must not also open the card under the pointer.
  function swallowNextClick() {
    const swallow = (event) => { event.stopPropagation(); event.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  }

  function endSession() {
    if (!session) return;
    clearTimeout(session.pressTimer);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    session = null;
  }

  function attach(element) {
    host = element;
    host.addEventListener('pointerdown', onPointerDown);
    // Once a touch drag has started the page must not scroll under it. touch-action can't change
    // mid-gesture, so the only remaining switch is a non-passive touchmove.
    document.addEventListener('touchmove', (event) => { if (isActive()) event.preventDefault(); }, { passive: false });
    host.addEventListener('contextmenu', (event) => { if (session && session.touch) event.preventDefault(); });
  }

  return { attach, isActive };
})();

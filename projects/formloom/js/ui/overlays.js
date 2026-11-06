// In-app modals, toasts and the screen reader announcer. Everything stays in the normal page layer.
FL.ui = (function () {
  const { h, clear } = FL.util;
  const { icon } = FL.icons;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
  const modals = [];
  let toastTimer = null;

  function trapTab(event, panel) {
    const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  /** Opens a modal. body and footer can be nodes or arrays of nodes. Returns { close, panel }. */
  function modal({ title, body, footer, wide, onClose }) {
    const previous = document.activeElement;
    const titleId = `modal-title-${modals.length}`;
    const closeButton = h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close'));
    const panel = h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title), closeButton),
      h('div', { class: 'modal-body' }, body),
      footer ? h('div', { class: 'modal-foot' }, footer) : null);
    const scrim = h('div', { class: 'modal-scrim' }, panel);
    const entry = { close, panel };

    function close() {
      const index = modals.indexOf(entry);
      if (index < 0) return;
      modals.splice(index, 1);
      scrim.remove();
      if (onClose) onClose();
      if (previous && document.contains(previous)) previous.focus();
    }

    scrim.addEventListener('pointerdown', (event) => { if (event.target === scrim) close(); });
    panel.addEventListener('keydown', (event) => { if (event.key === 'Tab') trapTab(event, panel); });
    document.getElementById('overlay-root').append(scrim);
    modals.push(entry);
    const firstInput = panel.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-body button');
    (firstInput || panel).focus();
    return entry;
  }

  function closeTopModal() {
    if (!modals.length) return false;
    modals[modals.length - 1].close();
    return true;
  }

  function closeAllModals() {
    while (modals.length) modals[modals.length - 1].close();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && closeTopModal()) event.stopPropagation();
  });

  /** Shows a short message. Pass undo to offer an Undo button; error styles it as a failure. */
  function toast(message, options) {
    const { undo, error, duration } = options || {};
    const root = clear(document.getElementById('toast-root'));
    clearTimeout(toastTimer);
    const dismiss = () => { clearTimeout(toastTimer); clear(root); };
    const undoButton = undo ? h('button', {
      class: 'toast-action', type: 'button',
      onclick: () => { dismiss(); undo(); },
    }, 'Undo') : null;
    root.append(h('div', { class: `toast${error ? ' toast-error' : ''}`, role: error ? 'alert' : 'status' },
      h('span', { class: 'toast-text' }, message), undoButton));
    toastTimer = setTimeout(dismiss, duration || (undo ? 8000 : 4000));
  }

  function announce(message) {
    const live = document.getElementById('live-region');
    live.textContent = '';
    setTimeout(() => { live.textContent = message; }, 30);
  }

  return { modal, closeTopModal, closeAllModals, toast, announce };
})();

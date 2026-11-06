// In-app modal: traps focus, closes on Escape or a click on the backdrop, and hands focus back.
const Modal = (() => {
  const { h, iconButton } = Dom;
  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
  let current = null;

  const root = () => document.getElementById('modal-root');
  const isOpen = () => !!current;

  function close() {
    if (!current) return;
    const { returnFocus, onClose } = current;
    current = null;
    root().replaceChildren();
    if (onClose) onClose();
    // The opener may have been redrawn while the modal was up; find its replacement by focus key.
    const replacement = returnFocus && returnFocus.dataset && returnFocus.dataset.fkey ? document.querySelector(`[data-fkey="${CSS.escape(returnFocus.dataset.fkey)}"]`) : null;
    if (replacement) replacement.focus();
    else if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }

  function trapTab(event, box) {
    const items = [...box.querySelectorAll(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // `render(bodyElement)` fills the modal. It runs again after workspace changes, so an open
  // editor reflects an Undo pressed in the toast.
  function open({ title, render, onClose, wide = false }) {
    close();
    const titleId = 'modal-title';
    const body = h('div', { class: 'modal-body' });
    const box = h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title), iconButton('x', 'Close', close)),
      body);
    let pressedBackdrop = false;
    const backdrop = h('div', {
      class: 'modal-backdrop',
      onPointerdown: (e) => { pressedBackdrop = e.target === backdrop; },
      onClick: (e) => { if (e.target === backdrop && pressedBackdrop) close(); },
      onKeydown: (e) => { if (e.key === 'Tab') trapTab(e, box); },
    }, box);
    current = { returnFocus: document.activeElement, onClose, render, body };
    render(body);
    root().replaceChildren(backdrop);
    const target = box.querySelector('[data-autofocus]') || box.querySelector(FOCUSABLE);
    if (target) target.focus();
  }

  function refresh() {
    if (current) current.render(current.body);
  }

  return { open, close, refresh, isOpen };
})();

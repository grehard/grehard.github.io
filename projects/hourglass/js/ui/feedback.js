// In-page modals and toasts. Plain divs, so nothing lands in the browser's top layer.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const TOAST_MS = 8000;
  let openModal = null;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trapTab(event, box) {
    const items = [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function closeModal() {
    if (!openModal) return;
    const { overlay, returnTo } = openModal;
    openModal = null;
    overlay.remove();
    document.body.classList.remove('modal-open');
    if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
  }

  /** Opens a modal. body is a node; footer is a list of nodes. */
  function showModal({ title, body, footer, wide, focus }) {
    closeModal();
    const titleId = HG.store.newId('modal-title');
    const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: closeModal }, icon('close'));
    const box = h('div', { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title), closeBtn),
      h('div', { class: 'modal-body' }, body),
      footer && h('div', { class: 'modal-foot' }, footer));
    const overlay = h('div', { class: 'modal-overlay' }, box);
    overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) closeModal(); });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeModal(); }
      else if (event.key === 'Tab') trapTab(event, box);
    });
    openModal = { overlay, returnTo: document.activeElement };
    document.getElementById('modal-root').appendChild(overlay);
    document.body.classList.add('modal-open');
    (focus || box.querySelector('input, select, textarea, .modal-foot button') || closeBtn).focus();
  }

  function confirmModal({ title, message, confirmLabel, danger, onConfirm }) {
    showModal({
      title,
      body: h('p', { class: 'modal-text' }, message),
      footer: [
        h('button', { type: 'button', class: 'btn', onclick: closeModal }, 'Cancel'),
        h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => { closeModal(); onConfirm(); } }, confirmLabel),
      ],
    });
  }

  /** Shows a toast. kind: "info" or "alert"; action: { label, run }. */
  function toast(message, { action, kind } = {}) {
    const host = document.getElementById('toasts');
    let timer = null;
    const dismiss = () => { clearTimeout(timer); node.remove(); };
    const node = h('div', { class: `toast${kind === 'alert' ? ' toast-alert' : ''}` },
      kind === 'alert' && icon('warn'),
      h('span', { class: 'toast-text' }, message),
      action && h('button', { type: 'button', class: 'toast-action', onclick: () => { dismiss(); action.run(); } }, action.label),
      h('button', { type: 'button', class: 'toast-close', 'aria-label': 'Dismiss', onclick: dismiss }, icon('close', 14)));
    while (host.children.length >= 3) host.firstChild.remove();
    host.appendChild(node);
    timer = setTimeout(dismiss, TOAST_MS);
    return dismiss;
  }

  /** Runs a destructive change and offers to take it back. */
  function undoable(message, change) {
    const before = HG.store.snapshot();
    HG.store.commit(change);
    toast(message, { action: { label: 'Undo', run: () => HG.store.restore(before) } });
  }

  HG.ui = HG.ui || {};
  Object.assign(HG.ui, { showModal, closeModal, confirmModal, toast, undoable, modalIsOpen: () => !!openModal });
})(window.HG);

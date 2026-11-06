// In-page modals and toasts. Plain divs on purpose: the portfolio's video captions
// must stay above everything, so nothing here uses the browser's top layer.
(function () {
  const ns = window.Coinpath;
  const { el, icon, button, uid } = ns.Dom;
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  let current = null;

  function restoreFocus(opener) {
    const target = opener && opener.isConnected ? opener : document.getElementById('page-heading');
    if (target) target.focus();
  }

  function closeModal() {
    if (!current) return;
    const { overlay, opener } = current;
    current = null;
    overlay.remove();
    document.getElementById('app').inert = false;
    document.body.classList.remove('modal-open');
    restoreFocus(opener);
  }

  function trapTab(event, dialog) {
    const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((node) => node.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  /** Opens a modal and returns { body, footer, setTitle, close }. */
  function openModal(opts) {
    const opener = current ? current.opener : document.activeElement;
    if (current) { current.overlay.remove(); current = null; }
    const titleId = uid('modal-title');
    const title = el('h2', { id: titleId }, opts.title);
    const body = el('div', { class: 'modal-body' });
    const footer = el('div', { class: 'modal-foot' });
    const dialog = el('div', { class: 'modal ' + (opts.wide ? 'modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabIndex: -1 },
      el('div', { class: 'modal-head' }, title, ns.Dom.iconButton('close', 'Close', closeModal)),
      body, footer);
    const overlay = el('div', {
      class: 'overlay',
      onMousedown: (event) => { if (event.target === overlay) closeModal(); },
      onKeydown: (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); closeModal(); }
        else if (event.key === 'Tab') trapTab(event, dialog);
      },
    }, dialog);
    current = { overlay, opener };
    document.getElementById('app').inert = true;
    document.body.classList.add('modal-open');
    document.body.appendChild(overlay);
    dialog.focus();
    return { body, footer, setTitle: (text) => { title.textContent = text; }, close: closeModal };
  }

  function confirmModal(opts) {
    const modal = openModal({ title: opts.title });
    modal.body.appendChild(el('p', null, opts.message));
    const confirmButton = button(opts.confirmLabel, {
      variant: opts.danger ? 'btn-danger' : 'btn-primary',
      onClick: () => { modal.close(); opts.onConfirm(); },
    });
    modal.footer.append(button('Cancel', { onClick: modal.close }), confirmButton);
    confirmButton.focus();
  }

  const TOAST_MS = 8000;
  let toastTimer = null;

  function dismissToast() {
    clearTimeout(toastTimer);
    document.getElementById('toasts').textContent = '';
  }

  /** Shows one toast at a time. opts.undo adds an Undo button; opts.action adds any other button. */
  function showToast(message, opts) {
    const o = opts || {};
    dismissToast();
    const action = o.undo ? { label: 'Undo', run: o.undo } : o.action;
    document.getElementById('toasts').appendChild(el('div', { class: 'toast' + (o.error ? ' toast-error' : '') },
      o.error && icon('alert'),
      el('span', { class: 'toast-text' }, message),
      action && el('button', { type: 'button', class: 'toast-action', onClick: () => { dismissToast(); action.run(); } }, action.label),
      el('button', { type: 'button', class: 'toast-close', 'aria-label': 'Dismiss', onClick: dismissToast }, icon('close', 14))));
    toastTimer = setTimeout(dismissToast, TOAST_MS);
  }

  ns.Overlays = { openModal, closeModal, confirmModal, showToast, dismissToast };
})();

// In-app modal and toast. Plain divs by design: native dialogs and the top layer would cover the portfolio's captions.
(function (R) {
  'use strict';
  const { h, iconButton } = R.dom;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const TOAST_MS = 7000;
  const MAX_TOASTS = 3;

  let openModal = null;
  let toastRegion = null;

  function trapTab(event, panel) {
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  }

  /** Focus returns to the opener, or to its re-rendered twin when the view has been redrawn underneath. */
  function restoreFocus(opener, focusKey) {
    if (opener && opener.isConnected) { opener.focus(); return; }
    const twin = focusKey && document.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (twin) twin.focus();
  }

  function modal({ title, body, footer, onSubmit, wide }) {
    if (openModal) openModal.close();
    const opener = document.activeElement;
    const focusKey = opener && opener.dataset ? opener.dataset.fk : null;
    const titleId = 'modal-title';
    const close = () => {
      if (!backdrop.isConnected) return;
      backdrop.remove();
      document.removeEventListener('keydown', onKey, true);
      openModal = null;
      restoreFocus(opener, focusKey);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      else if (event.key === 'Tab') trapTab(event, panel);
    };
    const content = [
      h('header', { class: 'modal-head' }, h('h2', { id: titleId }, title), iconButton('close', 'Close', () => close())),
      h('div', { class: 'modal-body' }, body),
      footer ? h('footer', { class: 'modal-foot' }, footer) : null,
    ];
    const panelAttrs = { class: `modal${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId };
    const panel = onSubmit
      ? h('form', { ...panelAttrs, novalidate: true, onSubmit: (e) => { e.preventDefault(); onSubmit(); } }, content)
      : h('div', panelAttrs, content);
    const backdrop = h('div', { class: 'modal-backdrop', onMousedown: (e) => { if (e.target === backdrop) close(); } }, panel);
    document.getElementById('overlays').appendChild(backdrop);
    document.addEventListener('keydown', onKey, true);
    const target = body.querySelector && body.querySelector('[data-autofocus]');
    (target || panel.querySelector(FOCUSABLE)).focus();
    if (target && target.select) target.select();
    openModal = { close };
    return openModal;
  }

  function toast(message, { actionLabel, onAction, kind } = {}) {
    if (!toastRegion) toastRegion = document.getElementById('toasts');
    while (toastRegion.children.length >= MAX_TOASTS) toastRegion.firstChild.remove();
    let timer = null;
    const dismiss = () => { clearTimeout(timer); item.remove(); };
    const action = actionLabel
      ? h('button', { type: 'button', class: 'toast-action', onClick: () => { dismiss(); onAction(); } }, actionLabel)
      : null;
    const item = h('div', { class: `toast${kind ? ` toast-${kind}` : ''}` },
      h('span', { class: 'toast-text' }, message), action, iconButton('close', 'Dismiss', dismiss));
    toastRegion.appendChild(item);
    timer = setTimeout(dismiss, TOAST_MS);
    return dismiss;
  }

  /** Runs a destructive change and offers to put everything back exactly as it was. */
  function withUndo(message, change) {
    const before = R.Store.snapshot();
    change();
    toast(message, { actionLabel: 'Undo', onAction: () => R.Store.replaceAll(before) });
  }

  R.overlays = { modal, toast, withUndo };
})(window.Rhythm);

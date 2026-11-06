// Short messages above the canvas, with an optional action such as Undo.
(function (DB) {
  'use strict';
  const { el } = DB.util;

  const DEFAULT_MS = 6000;
  let current = null;

  function dismiss() {
    if (!current) return;
    clearTimeout(current.timer);
    current.node.remove();
    current = null;
  }

  function show(text, { action, onAction, timeout } = {}) {
    dismiss();
    const node = el('div', { class: 'toast', role: 'status' }, el('span', { text, class: 'toast-text' }));
    if (action) {
      node.append(el('button', {
        type: 'button', class: 'toast-action', text: action,
        onclick: () => { dismiss(); onAction(); },
      }));
    }
    node.append(el('button', { type: 'button', class: 'toast-close', 'aria-label': 'Dismiss message', 'data-icon': 'close', 'data-icon-size': '14', onclick: dismiss }));
    DB.icons.hydrate(node);
    document.getElementById('toasts').append(node);
    current = { node, timer: setTimeout(dismiss, timeout || DEFAULT_MS) };
  }

  DB.toast = { show, dismiss };
})(window.DB);

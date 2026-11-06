// One message at a time, replaced by the next. The Undo button reverts the action it describes.
const Toast = (() => {
  const { h, icon } = Dom;
  const DURATION_MS = 7000;
  let timer = null;

  const region = () => document.getElementById('toasts');

  function dismiss() {
    clearTimeout(timer);
    region().replaceChildren();
  }

  function startTimer() {
    clearTimeout(timer);
    timer = setTimeout(dismiss, DURATION_MS);
  }

  function show(text, { undo = false } = {}) {
    const undoButton = undo ? h('button', { type: 'button', class: 'toast-action', onClick: () => { dismiss(); Actions.undo(); } }, icon('undo', 14), 'Undo') : null;
    const close = h('button', { type: 'button', class: 'icon-btn toast-close', 'aria-label': 'Dismiss message', onClick: dismiss }, icon('x', 14));
    const toast = h('div', {
      class: 'toast',
      onPointerenter: () => clearTimeout(timer),
      onPointerleave: startTimer,
      onFocusin: () => clearTimeout(timer),
      onFocusout: startTimer,
    }, h('span', { class: 'toast-text' }, text), undoButton, close);
    region().replaceChildren(toast);
    startTimer();
  }

  return { show, dismiss };
})();

// In-app modals and the undo toast. Plain divs, so nothing enters the browser's top layer.
(function (MG) {
  'use strict';

  const { h, icon, $ } = MG.Dom;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
  const TOAST_MS = 7000;

  let closeCurrent = null;

  function trapTab(event, panel) {
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Opens a modal. `content` is a node; `actions` are built by the caller inside it.
   * @returns {function} close
   */
  function openModal({ title, content, wide, describedBy }) {
    if (closeCurrent) closeCurrent();
    const opener = document.activeElement;
    const heading = h('h2', { id: 'modal-title' }, title);
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, icon('x'));
    const panel = h('div', {
      class: wide ? 'modal-panel wide' : 'modal-panel', role: 'dialog', 'aria-modal': 'true',
      'aria-labelledby': 'modal-title', 'aria-describedby': describedBy || null, tabindex: '-1',
    }, h('header', { class: 'modal-head' }, heading, closeBtn), h('div', { class: 'modal-body' }, content));
    const overlay = h('div', { class: 'modal-overlay' }, panel);

    function close() {
      overlay.remove();
      closeCurrent = null;
      document.removeEventListener('keydown', onKey, true);
      if (opener && document.contains(opener)) opener.focus();
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        trapTab(event, panel);
      }
    }
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey, true);
    $('modal-root').appendChild(overlay);
    closeCurrent = close;
    const autofocus = panel.querySelector('[data-autofocus]') || panel;
    autofocus.focus();
    return close;
  }

  /** A yes/no question. `onConfirm` runs on the destructive button. */
  function confirmModal({ title, message, confirmLabel, onConfirm }) {
    const text = h('p', { id: 'modal-desc', class: 'modal-text' }, message);
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Cancel');
    const confirm = h('button', { class: 'btn danger', type: 'button', 'data-autofocus': true }, confirmLabel);
    const close = openModal({
      title, describedBy: 'modal-desc',
      content: h('div', null, text, h('div', { class: 'modal-actions' }, cancel, confirm)),
    });
    cancel.addEventListener('click', close);
    confirm.addEventListener('click', () => {
      close();
      onConfirm();
    });
  }

  let toastTimer = null;

  function hideToast() {
    clearTimeout(toastTimer);
    $('toast-region').textContent = '';
  }

  /** Shows one toast at a time. With `undo`, offers an Undo button. */
  function toast(message, options) {
    const opts = options || {};
    hideToast();
    const children = [h('span', { class: 'toast-text' }, message)];
    if (opts.undo) {
      children.push(h('button', {
        class: 'toast-action', type: 'button',
        onclick: () => {
          hideToast();
          opts.undo();
        },
      }, 'Undo'));
    }
    children.push(h('button', { class: 'icon-btn small', type: 'button', 'aria-label': 'Dismiss', onclick: hideToast }, icon('x')));
    $('toast-region').appendChild(h('div', { class: opts.error ? 'toast is-error' : 'toast' }, children));
    toastTimer = setTimeout(hideToast, opts.duration || TOAST_MS);
  }

  MG.Overlays = { openModal, confirmModal, toast, hideToast };
})(window.MG = window.MG || {});

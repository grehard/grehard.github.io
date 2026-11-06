// In-app modal and toast. Plain divs on purpose: the top layer would cover the portfolio's captions.
Mise.Modal = (() => {
  const { h, icon } = Mise.Dom;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
  let current = null;

  function close() {
    if (!current) return;
    const { root, opener, shell } = current;
    current = null;
    root.remove();
    shell.inert = false;
    document.body.classList.remove('modal-open');
    const focusTarget = opener && opener.isConnected ? opener : document.querySelector('main');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function trapTab(event, panel) {
    const items = [...panel.querySelectorAll(FOCUSABLE)];
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

  /** Opens a modal. `content(close)` returns its body; `wide` gives more room. */
  function open({ title, content, wide = false, autofocus = null }) {
    close();
    const opener = document.activeElement;
    const shell = document.getElementById('shell');
    const titleId = 'modal-title';
    const panel = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' },
        h('h2', { id: titleId }, title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('close'))),
      h('div', { class: 'modal-body' }, content(close)));

    const root = h('div', {
      class: 'modal-root',
      onmousedown: (event) => { if (event.target === root) close(); },
      onkeydown: (event) => {
        if (event.key === 'Escape') { event.stopPropagation(); close(); }
        if (event.key === 'Tab') trapTab(event, panel);
      },
    }, panel);

    document.body.appendChild(root);
    document.body.classList.add('modal-open');
    shell.inert = true;
    current = { root, opener, shell };
    const firstField = (autofocus && panel.querySelector(autofocus)) || panel.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-body button');
    if (firstField) firstField.focus();
  }

  return { open, close, get isOpen() { return !!current; } };
})();

Mise.Toast = (() => {
  const { h, icon } = Mise.Dom;
  const VISIBLE_MS = 7000;
  let host = null;

  function region() {
    if (!host) {
      host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    return host;
  }

  /** Shows a short message, optionally with an Undo button. Only the latest stays on screen. */
  function show(message, { undo = null, sticky = false } = {}) {
    const area = region();
    area.replaceChildren();
    const dismiss = () => toast.remove();
    const toast = h('div', { class: 'toast' },
      h('span', { class: 'toast-text' }, message),
      undo ? h('button', { type: 'button', class: 'toast-undo', onclick: () => { dismiss(); undo(); } }, 'Undo') : null,
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Dismiss', onclick: dismiss }, icon('close', 16)));
    area.appendChild(toast);
    if (!sticky) setTimeout(dismiss, VISIBLE_MS);
  }

  return { show };
})();

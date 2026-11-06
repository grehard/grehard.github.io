// In-app modals and toasts. Plain divs on purpose: no native dialogs or top-layer elements.
(function () {
  const { h, btn, iconBtn, clear } = SR.ui;
  const stack = [];
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let titleCount = 0;

  /**
   * Opens a modal. body is a node or nodes; footer is a list of buttons. Returns { close, el }.
   * size: 'sm' | 'md' | 'lg'. initialFocus: element to focus instead of the first control.
   */
  function openModal({ title, body, footer, size = 'md', initialFocus, onClose, labelSuffix }) {
    const titleId = `modal-title-${(titleCount += 1)}`;
    const previous = document.activeElement;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      backdrop.remove();
      stack.splice(stack.indexOf(handle), 1);
      if (onClose) onClose();
      else if (previous && previous.isConnected) previous.focus();
      else if (!stack.length) document.getElementById('view').focus();
    };
    const dialog = h('div', { class: `modal modal-${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' },
        h('h2', { id: titleId }, title, labelSuffix || null),
        iconBtn('x', 'Close', close)),
      h('div', { class: 'modal-body' }, body),
      footer && footer.length ? h('div', { class: 'modal-foot' }, footer) : null);
    const backdrop = h('div', { class: 'modal-backdrop', onMouseDown: (e) => { if (e.target === backdrop) close(); } }, dialog);
    backdrop.addEventListener('keydown', (e) => trapTab(e, dialog));
    const handle = { close, el: dialog };
    stack.push(handle);
    document.getElementById('modal-root').appendChild(backdrop);
    const target = initialFocus || dialog.querySelector('.modal-body').querySelector(FOCUSABLE) || dialog.querySelector('.modal-foot button');
    if (target) {
      target.focus();
      if (target.select && target.tagName === 'INPUT') target.select();
    }
    return handle;
  }

  function trapTab(event, dialog) {
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const isOpen = () => stack.length > 0;
  const closeAll = () => { while (stack.length) stack[stack.length - 1].close(); };

  function closeTop() {
    if (stack.length) stack[stack.length - 1].close();
  }

  function confirmModal({ title, message, confirmLabel, danger, onConfirm }) {
    const modal = openModal({
      title,
      size: 'sm',
      body: h('p', { class: 'modal-text' }, message),
      footer: [
        btn('Cancel', { onClick: () => modal.close() }),
        btn(confirmLabel, { kind: danger ? 'danger' : 'primary', onClick: () => { modal.close(); onConfirm(); } }),
      ],
    });
    modal.el.querySelector('.modal-foot .btn:last-child').focus();
    return modal;
  }

  function toast(message, { undo, tone, ms = 9000 } = {}) {
    const root = document.getElementById('toast-root');
    const remove = () => { clearTimeout(timer); item.remove(); };
    const item = h('div', { class: `toast${tone ? ` toast-${tone}` : ''}` },
      h('span', { class: 'toast-text' }, message),
      undo ? h('button', { type: 'button', class: 'toast-action', onClick: () => { remove(); undo(); } }, 'Undo') : null,
      iconBtn('x', 'Dismiss', () => remove(), { class: 'toast-close' }));
    const timer = setTimeout(remove, ms);
    while (root.children.length >= 3) root.firstChild.remove();
    root.appendChild(item);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      closeTop();
    }
  }, true);

  Object.assign(SR.ui, { openModal, confirmModal, modalOpen: isOpen, closeAllModals: closeAll, toast, clearToasts: () => clear(document.getElementById('toast-root')) });
})();

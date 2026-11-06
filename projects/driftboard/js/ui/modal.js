// In-page modal dialogs and popover menus, with focus trapping and Escape handling.
(function (DB) {
  'use strict';
  const { el } = DB.util;

  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  let active = null;

  // Listens on the document because focus can fall to the body when a dialog re-renders its controls.
  document.addEventListener('keydown', (ev) => { if (active) trapKeys(ev); }, true);

  function close() {
    if (!active) return;
    const { backdrop, returnFocus, onClose } = active;
    active = null;
    backdrop.remove();
    if (onClose) onClose();
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
  }

  function trapKeys(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close();
      return;
    }
    if (ev.key !== 'Tab') return;
    const items = Array.from(active.box.querySelectorAll(FOCUSABLE)).filter((node) => node.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  // Builds a dialog around body nodes. Returns the dialog box element.
  function open({ title, body, actions, wide, onClose }) {
    close();
    const titleId = 'modal-title';
    const closeButton = el('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close dialog', 'data-icon': 'close', onclick: close });
    const header = el('div', { class: 'modal-header' }, el('h2', { id: titleId, text: title }), closeButton);
    const box = el('div', { class: `modal modal-wide ${wide === true ? '' : wide || 'modal-small'}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, header, body);
    if (actions && actions.length) box.append(el('div', { class: 'modal-actions' }, ...actions));
    const backdrop = el('div', { class: 'modal-backdrop' }, box);
    backdrop.addEventListener('pointerdown', (ev) => { if (ev.target === backdrop) close(); });
    DB.icons.hydrate(box);
    active = { backdrop, box, returnFocus: document.activeElement, onClose };
    document.getElementById('modal-root').append(backdrop);
    const target = box.querySelector('[data-autofocus]') || closeButton;
    target.focus();
    return box;
  }

  function message(title, text) {
    const ok = el('button', { type: 'button', class: 'primary-button', text: 'OK', onclick: close, 'data-autofocus': true });
    open({ title, body: el('p', { class: 'modal-text', role: 'alert', text }), actions: [ok] });
  }

  // Menus close on Escape, on a press outside them, and when the opener is pressed again.
  function bindPopover(button, menu, { onOpen } = {}) {
    const setOpen = (open) => {
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
      if (open && onOpen) onOpen();
    };
    button.addEventListener('click', () => setOpen(menu.hidden));
    document.addEventListener('pointerdown', (ev) => {
      if (!menu.hidden && !menu.contains(ev.target) && !button.contains(ev.target)) setOpen(false);
    }, true);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !menu.hidden && !active) {
        ev.stopPropagation();
        setOpen(false);
        button.focus();
      }
    }, true);
    return { close: () => setOpen(false), open: () => setOpen(true) };
  }

  DB.modal = { open, close, message, bindPopover, isOpen: () => !!active };
})(window.DB);

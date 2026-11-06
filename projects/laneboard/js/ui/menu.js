// Popup menu with arrow-key navigation. This is also the keyboard path for everything drag does.
const Menu = (() => {
  const { h, icon } = Dom;
  let current = null;

  const root = () => document.getElementById('menu-root');
  const isOpen = () => !!current;

  function close({ refocus = true } = {}) {
    if (!current) return;
    const { anchor } = current;
    current = null;
    root().replaceChildren();
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    if (refocus && anchor.isConnected) anchor.focus();
  }

  function onOutsidePointer(event) {
    // A press on the anchor is left to its click handler, which toggles the menu closed.
    if (current && !current.element.contains(event.target) && !current.anchor.contains(event.target)) close({ refocus: false });
  }

  function focusItem(items, index) {
    if (!items.length) return;
    items[(index + items.length) % items.length].focus();
  }

  function onKeydown(event) {
    const items = [...current.element.querySelectorAll('[role="menuitem"]:not([disabled])')];
    const at = items.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') focusItem(items, at + 1);
    else if (event.key === 'ArrowUp') focusItem(items, at - 1);
    else if (event.key === 'Home') focusItem(items, 0);
    else if (event.key === 'End') focusItem(items, items.length - 1);
    else if (event.key === 'Tab') { close(); return; }
    else return;
    event.preventDefault();
  }

  function buildItem(item) {
    if (item.heading) return h('div', { class: 'menu-heading', role: 'presentation' }, item.heading);
    if (item.separator) return h('div', { class: 'menu-separator', role: 'separator' });
    const choose = () => { close(); item.onSelect(); };
    return h('button', {
      type: 'button', role: 'menuitem', class: `menu-item${item.danger ? ' is-danger' : ''}${item.current ? ' is-current' : ''}`,
      disabled: item.disabled, onClick: choose, 'aria-current': item.current ? 'true' : null,
    }, item.icon ? icon(item.icon, 15) : h('span', { class: 'menu-icon-gap' }), h('span', { class: 'menu-label' }, item.label), item.note ? h('span', { class: 'menu-note' }, item.note) : null);
  }

  function position(element, anchor) {
    const rect = anchor.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    const gap = 4;
    const margin = 8;
    let left = rect.right - box.width;
    if (left < margin) left = Math.min(rect.left, window.innerWidth - box.width - margin);
    let top = rect.bottom + gap;
    if (top + box.height > window.innerHeight - margin) top = Math.max(margin, rect.top - box.height - gap);
    element.style.left = `${Math.max(margin, left)}px`;
    element.style.top = `${top}px`;
  }

  function open(anchor, items, label) {
    const wasOpenHere = current && current.anchor === anchor;
    close({ refocus: false });
    if (wasOpenHere) { anchor.focus(); return; }
    const element = h('div', { class: 'menu', role: 'menu', 'aria-label': label, onKeydown }, items.map(buildItem));
    current = { anchor, element };
    root().replaceChildren(element);
    position(element, anchor);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    const first = element.querySelector('[role="menuitem"]:not([disabled])');
    if (first) first.focus();
  }

  return { open, close, isOpen };
})();

// Keyboard shortcut reference, built from the table the keyboard module itself documents.
(function (DB) {
  'use strict';
  const { el } = DB.util;

  function keys(text) {
    return el('dt', null, el('kbd', { text }));
  }

  function open() {
    const groups = DB.keyboard.SHORTCUTS.map((group) => {
      const list = el('dl', { class: 'shortcut-list' });
      group.items.forEach(([combo, label]) => list.append(keys(combo), el('dd', { text: label })));
      return el('section', { class: 'shortcut-group' }, el('h3', { text: group.title }), list);
    });
    DB.modal.open({ title: 'Keyboard shortcuts', wide: 'modal-xl', body: el('div', { class: 'shortcut-grid', id: 'help-content', tabindex: 0 }, ...groups) });
  }

  DB.helpPanel = { open };
})(window.DB);

// View options: snapping and display toggles, zoom commands, and a few board-wide commands.
(function (DB) {
  'use strict';
  const { el } = DB.util;

  const TOGGLES = [
    ['snapGrid', 'Snap to grid', 'G'],
    ['guides', 'Alignment guides', ''],
    ['showGrid', 'Show grid', ''],
    ['rulers', 'Rulers', ''],
    ['minimap', 'Minimap', 'M'],
  ];

  function attach(app) {
    const root = document.getElementById('view-menu');
    const button = document.getElementById('view-button');
    const popover = DB.modal.bindPopover(button, root);
    const checks = new Map();

    const item = (id, label, hint, onClick, role) => el('button', { type: 'button', id, class: 'menu-item', role: role || 'menuitem', onclick: onClick },
      el('span', { class: 'menu-check', 'aria-hidden': 'true' }),
      el('span', { class: 'menu-label', text: label }),
      hint ? el('kbd', { text: hint }) : null);

    TOGGLES.forEach(([key, label, hint]) => {
      const node = item(`toggle-${key}`, label, hint, () => app.toggleSetting(key), 'menuitemcheckbox');
      if (key === 'rulers') node.classList.add('desktop-only'); // A phone has no room for rulers, so they never draw there.
      checks.set(key, node);
      root.append(node);
    });
    const dark = item('toggle-theme', 'Dark theme', '', () => app.toggleTheme(), 'menuitemcheckbox');
    root.append(dark, el('div', { class: 'menu-separator', role: 'separator' }));

    const run = (fn) => () => { popover.close(); fn(); };
    root.append(
      item('zoom-fit', 'Zoom to fit', 'Shift+1', run(() => app.zoomFit())),
      item('zoom-selection', 'Zoom to selection', 'Shift+2', run(() => app.zoomSelection())),
      item('zoom-reset', 'Zoom to 100%', '0', run(() => app.zoomReset())),
      el('div', { class: 'menu-separator', role: 'separator' }),
      item('open-help', 'Keyboard shortcuts', '?', run(() => DB.helpPanel.open())),
      item('clear-board', 'Clear this board', '', run(() => DB.actions.clearBoard())),
    );

    function refresh() {
      checks.forEach((node, key) => {
        node.setAttribute('aria-checked', String(!!app.settings[key]));
        node.querySelector('.menu-check').innerHTML = app.settings[key] ? DB.icons.svg('check', 16) : '';
      });
      const isDark = app.theme() === 'dark';
      dark.setAttribute('aria-checked', String(isDark));
      dark.querySelector('.menu-check').innerHTML = isDark ? DB.icons.svg('check', 16) : '';
    }
    refresh();
    DB.bus.on('settings', refresh);
    DB.bus.on('theme', refresh);
  }

  DB.viewMenu = { attach };
})(window.DB);

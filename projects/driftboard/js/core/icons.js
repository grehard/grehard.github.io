// Inline SVG icons. These strings are constants, so setting them as markup is safe.
(function (DB) {
  'use strict';
  const PATHS = {
    select: '<path d="M4.5 3l11 7.2-4.7 1 2.6 4.7-2 1.1-2.6-4.7-3.3 3.4z"/>',
    hand: '<path d="M6.5 10V5.2a1.2 1.2 0 012.4 0V9m0-.5V3.7a1.2 1.2 0 012.4 0V9m0-4.3a1.2 1.2 0 012.4 0V10m0-3a1.2 1.2 0 012.4 0v5.5c0 3-2 4.8-4.8 4.8-2.4 0-3.5-1-4.6-3L3.7 11a1.2 1.2 0 012-1.3L6.5 11"/>',
    rect: '<rect x="3.5" y="5" width="13" height="10"/>',
    ellipse: '<ellipse cx="10" cy="10" rx="7" ry="5.2"/>',
    diamond: '<path d="M10 3l7 7-7 7-7-7z"/>',
    line: '<path d="M4 16L16 4"/>',
    arrow: '<path d="M4 16L16 4M9 4h7v7"/>',
    pen: '<path d="M3.5 16.5c2.5-1 3-5 5.5-6.5s2 3 4 2.5 2-5 3.5-7.5"/>',
    text: '<path d="M4.5 5.5V4h11v1.5M10 4v12M7.5 16h5"/>',
    sticky: '<path d="M4 4h12v8l-4 4H4zM16 12h-4v4"/>',
    eraser: '<path d="M8 16.5h8.5M3.8 12.3l7.5-7.5a1.2 1.2 0 011.7 0l3.2 3.2a1.2 1.2 0 010 1.7L9.7 16.3a1 1 0 01-.7.2H7.2a1 1 0 01-.7-.3l-2.7-2.7a.8.8 0 010-1.2zM7.8 8.3l4.9 4.9"/>',
    undo: '<path d="M7 5L3.5 8.5 7 12M4 8.5h8a4 4 0 010 8H9"/>',
    redo: '<path d="M13 5l3.5 3.5L13 12M16 8.5H8a4 4 0 000 8h3"/>',
    view: '<path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>',
    export: '<path d="M10 3v9M6.5 8.5L10 12l3.5-3.5M4 14v3h12v-3"/>',
    help: '<circle cx="10" cy="10" r="7"/><path d="M7.8 8a2.2 2.2 0 014.4 0c0 1.5-2.2 1.8-2.2 3.4M10 14v.2"/>',
    sun: '<circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
    moon: '<path d="M16 12.2A6.5 6.5 0 017.8 4a6.5 6.5 0 108.2 8.2z"/>',
    panel: '<rect x="3" y="4" width="14" height="12"/><path d="M12 4v12M13.8 7h1.4M13.8 9.5h1.4"/>',
    plus: '<path d="M10 4v12M4 10h12"/>',
    minus: '<path d="M4 10h12"/>',
    close: '<path d="M5 5l10 10M15 5L5 15"/>',
    chevron: '<path d="M6 8l4 4 4-4"/>',
    rename: '<path d="M4 16l.8-3.2 8-8a1.4 1.4 0 012 2l-8 8zM11.5 6l2.5 2.5"/>',
    copy: '<rect x="7" y="7" width="9.5" height="9.5"/><path d="M13 7V3.5H3.5V13H7"/>',
    trash: '<path d="M4 6h12M8 6V4h4v2M6 6l.7 10.5h6.6L14 6"/>',
    front: '<rect x="7" y="7" width="9" height="9" fill="currentColor"/><path d="M13 4H4v9"/>',
    forward: '<rect x="7" y="7" width="9" height="9"/><path d="M13 4H4v9"/>',
    backward: '<rect x="4" y="4" width="9" height="9"/><path d="M16 7v9H7"/>',
    back: '<rect x="4" y="4" width="9" height="9" fill="currentColor"/><path d="M16 7v9H7"/>',
    group: '<path d="M3 3h3v3H3zM14 3h3v3h-3zM3 14h3v3H3zM14 14h3v3h-3zM6 4.5h8M6 15.5h8M4.5 6v8M15.5 6v8"/>',
    ungroup: '<path d="M3 3h3v3H3zM14 14h3v3h-3zM6 4.5h4M4.5 6v4M14 15.5h-4M15.5 14v-4"/>',
    lock: '<rect x="4.5" y="9" width="11" height="8"/><path d="M7 9V6.5a3 3 0 016 0V9"/>',
    unlock: '<rect x="4.5" y="9" width="11" height="8"/><path d="M7 9V6.5a3 3 0 015.8-1"/>',
    rotateLeft: '<path d="M4 5v4h4M4.4 9A6.2 6.2 0 1110 16.2"/>',
    rotateRight: '<path d="M16 5v4h-4M15.6 9A6.2 6.2 0 1010 16.2"/>',
    alignLeft: '<path d="M3.5 3v14M6 6h9v3H6zM6 11h6v3H6z"/>',
    alignCenterX: '<path d="M10 3v14M5.5 6h9v3h-9zM7 11h6v3H7z"/>',
    alignRight: '<path d="M16.5 3v14M5 6h9v3H5zM8 11h6v3H8z"/>',
    alignTop: '<path d="M3 3.5h14M6 6v9h3V6zM11 6v6h3V6z"/>',
    alignCenterY: '<path d="M3 10h14M6 5.5v9h3v-9zM11 7v6h3V7z"/>',
    alignBottom: '<path d="M3 16.5h14M6 5v9h3V5zM11 8v6h3V8z"/>',
    file: '<path d="M5 3h7l3.5 3.5V17H5zM12 3v4h3.5"/>',
    check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  };

  function svg(name, size) {
    const box = size || 20;
    return `<svg width="${box}" height="${box}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
  }

  // Replaces every [data-icon] placeholder in the static markup.
  function hydrate(root) {
    root.querySelectorAll('[data-icon]').forEach((node) => {
      node.insertAdjacentHTML('afterbegin', svg(node.getAttribute('data-icon'), Number(node.getAttribute('data-icon-size')) || 20));
      node.removeAttribute('data-icon');
    });
  }

  DB.icons = { svg, hydrate };
})(window.DB);

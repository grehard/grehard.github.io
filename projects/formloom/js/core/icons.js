// Inline SVG icons. These strings are constants in this file, never user input.
FL.icons = (function () {
  const PATHS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="1.5"/><path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 6 6"/>',
    redo: '<path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0-6 6"/>',
    share: '<path d="M10 14a4 4 0 0 0 6 .4l3-3a4.2 4.2 0 0 0-6-6l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-6-.4l-3 3a4.2 4.2 0 0 0 6 6l1.5-1.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    table: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 10h17M3.5 14.5h17M9.5 10v9"/>',
    chart: '<path d="M4 20h16M7 20v-7M12 20V5M17 20v-10"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M4.5 19.5h15"/>',
    download: '<path d="M12 5v11M7 11l5 5 5-5M4.5 19.5h15"/>',
    alert: '<path d="M12 4L2.5 20h19L12 4z"/><path d="M12 10v4.5M12 17.2v.3"/>',
    forms: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    page: '<path d="M6 3.5h8l4.5 4.5v12.5H6z"/><path d="M14 3.5V8h4.5"/>',
    short_text: '<path d="M4 7h16M4 12h10"/>',
    long_text: '<path d="M4 6h16M4 10.5h16M4 15h16M4 19.5h9"/>',
    email: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="M4 7l8 6 8-6"/>',
    number: '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h16M3.5 15h16"/>',
    phone: '<path d="M6 3.5h3.2l1.6 4.6-2 1.6a12 12 0 0 0 5.9 5.9l1.6-2 4.6 1.6V18a2.5 2.5 0 0 1-2.5 2.5A15 15 0 0 1 3.5 6 2.5 2.5 0 0 1 6 3.5z"/>',
    date: '<rect x="4" y="5.5" width="16" height="15" rx="1.5"/><path d="M4 10.5h16M8.5 3v4M15.5 3v4"/>',
    single_choice: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>',
    multi_choice: '<rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M8 12.2l3 3 5-6"/>',
    dropdown: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M13.5 11l2.5 2.5 2.5-2.5" transform="translate(-1 -.5)"/><path d="M6.5 12h4.5"/>',
    rating: '<path d="M12 4l2.5 5.3 5.7.8-4.1 4 1 5.7L12 17.1 6.9 19.8l1-5.7-4.1-4 5.7-.8z"/>',
    scale: '<path d="M4 12h16M4 8v8M12 8v8M20 8v8M8 10v4M16 10v4"/>',
    file: '<path d="M14.5 5.5l-7 7a2.8 2.8 0 0 0 4 4l7.5-7.5a4.5 4.5 0 0 0-6.4-6.4l-7.6 7.6a6.2 6.2 0 0 0 8.8 8.8l6-6"/>',
    section: '<path d="M4 12h16M4 6h7M4 18h7"/>',
    logic: '<circle cx="6" cy="5.5" r="2.2"/><circle cx="6" cy="18.5" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 7.7v8.6M6 13.5c0-3 3.5-4.5 9.8-4.5"/>',
    reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5L4.5 9"/><path d="M4.5 4.5V9H9"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    star: '<path d="M12 3.2l2.75 5.8 6.25.86-4.55 4.37 1.13 6.27L12 17.45l-5.58 3.05 1.13-6.27L3 9.86 9.25 9z"/>',
  };

  const parser = document.createElement('template');

  /** Returns a decorative SVG icon; the surrounding control provides the accessible name. */
  function icon(name, size) {
    const px = size || 16;
    parser.innerHTML = `<svg class="icon" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
    return parser.content.firstChild;
  }

  return { icon };
})();

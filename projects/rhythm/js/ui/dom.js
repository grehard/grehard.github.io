// Small DOM helpers. All text goes in through text nodes, so user content can never become markup.
(function (R) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PROPERTY_ATTRS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'htmlFor', 'readOnly']);

  function apply(el, attrs) {
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (name.startsWith('on') && typeof value === 'function') el.addEventListener(name.slice(2).toLowerCase(), value);
      else if (name === 'class') el.setAttribute('class', value);
      else if (name === 'data') Object.assign(el.dataset, value);
      else if (PROPERTY_ATTRS.has(name)) el[name] = value;
      else el.setAttribute(name, value === true ? '' : value);
    }
  }

  function append(el, children) {
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    apply(el, attrs);
    append(el, children);
    return el;
  }

  function svg(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    apply(el, attrs);
    append(el, children);
    return el;
  }

  const ICONS = {
    today: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    week: 'M4 5h16v14H4zM4 10h16M4 15h16M9.3 5v14M14.7 5v14',
    habits: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    stats: 'M5 20V11M12 20V4M19 20v-6',
    journal: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 8h6M9 12h6M9 16h3',
    settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4h4V5zM6 15v4h4v-4z',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    check: 'm5 12.5 4.5 4.5L19 7.5',
    skip: 'M5 12h11M12 7l5 5-5 5M20 6v12',
    left: 'm15 5-7 7 7 7',
    right: 'm9 5 7 7-7 7',
    up: 'm5 15 7-7 7 7',
    down: 'm5 9 7 7 7-7',
    grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    archive: 'M4 5h16v4H4zM6 9v10h12V9M10 13h4',
    restore: 'M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5',
    edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z',
    sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    sunrise: 'M12 4v4M4 18h16M7 14.5a5 5 0 0 1 10 0M4.6 11.5 6 13M19.4 11.5 18 13M9 6l3-3 3 3',
    noon: 'M12 3v2M12 19v2M3 12h2M19 12h2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    close: 'm6 6 12 12M18 6 6 18',
    bell: 'M6 17V11a6 6 0 1 1 12 0v6l1.5 1.5h-15L6 17ZM10 21h4',
    search: 'M16.5 16.5 21 21M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    download: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14',
    upload: 'M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14',
    reset: 'M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5',
  };

  function icon(name, size = 18) {
    return svg('svg', { class: 'icon', viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    svg('path', { d: ICONS[name] }));
  }

  /** A button holding only an icon, which still needs a name for assistive tech and a tooltip. */
  function iconButton(name, label, onClick, attrs = {}) {
    const { class: extra, ...rest } = attrs;
    return h('button', { type: 'button', class: `btn-icon ${extra || ''}`, 'aria-label': label, title: label, onClick, ...rest }, icon(name));
  }

  const button = (label, onClick, attrs = {}) => h('button', { type: 'button', class: 'btn', onClick, ...attrs }, label);

  const plural = (n, word, many) => `${n.toLocaleString('en-US')} ${n === 1 ? word : many || `${word}s`}`;

  R.dom = { h, svg, icon, iconButton, button, plural };
})(window.Rhythm);

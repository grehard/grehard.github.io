// DOM building blocks. Everything is created with text nodes and properties rather than
// HTML strings, so user text cannot become markup anywhere in the app.
SR.ui = (function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ICONS = {
    register: 'M3 7h18v13H3zM7 7V4h10v3M7 12h4M7 16h4M15 12h2M15 16h2',
    sales: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
    products: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
    inventory: 'M4 5h16M4 12h16M4 19h16M8 3v4M14 10v4M10 17v4',
    orders: 'M3 6h11v11H3zM14 10h4l3 3v4h-7zM7 20a2 2 0 100-4 2 2 0 000 4zM17 20a2 2 0 100-4 2 2 0 000 4z',
    reports: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
    close: 'M3 7h18v11H3zM12 15a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 10v.01M18 15v.01',
    settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    x: 'M6 6l12 12M18 6L6 18',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
    download: 'M12 4v11M7 11l5 5 5-5M4 20h16',
    upload: 'M12 16V5M7 9l5-5 5 5M4 20h16',
    print: 'M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7z',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
    pause: 'M8 5v14M16 5v14',
    tag: 'M3 12V4h8l10 10-8 8zM8 9v.01',
    cash: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    card: 'M3 6h18v12H3zM3 10h18M7 15h3',
    alert: 'M12 4l9 16H3zM12 10v4M12 17v.01',
    check: 'M5 12l5 5 9-10',
    sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
    moon: 'M20 14A8 8 0 0110 4a8 8 0 1010 10z',
    back: 'M14 6l-6 6 6 6',
    resume: 'M7 5l11 7-11 7z',
  };

  function setAttr(el, key, value) {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value' && 'value' in el) el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'readOnly') el[key] = !!value;
    else el.setAttribute(key, value === true ? '' : value);
  }

  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach((c) => append(parent, c));
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  /** Creates an element: h('div', { class: 'row', onClick: fn }, child, 'text', [more]). */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) setAttr(el, key, value);
    append(el, children);
    return el;
  }

  function svg(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) if (value !== null && value !== undefined) el.setAttribute(key, value);
    append(el, children);
    return el;
  }

  function icon(name, size = 18) {
    return svg('svg', { class: 'icon', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
      svg('path', { d: ICONS[name] }));
  }

  function btn(label, { kind = 'default', iconName, onClick, size, hotkey, ...attrs } = {}) {
    const classes = ['btn', `btn-${kind}`, size ? `btn-${size}` : null, attrs.class].filter(Boolean).join(' ');
    delete attrs.class;
    return h('button', { type: 'button', class: classes, onClick, ...attrs },
      iconName ? icon(iconName, size === 'sm' ? 15 : 18) : null,
      label ? h('span', { class: 'btn-label' }, label) : null,
      hotkey ? h('kbd', null, hotkey) : null);
  }

  function iconBtn(name, label, onClick, attrs = {}) {
    const classes = ['icon-btn', attrs.class].filter(Boolean).join(' ');
    return h('button', { type: 'button', 'aria-label': label, title: label, ...attrs, class: classes, onClick }, icon(name));
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function pageHeader(title, subtitle, actions) {
    return h('header', { class: 'page-head' },
      h('div', { class: 'page-title' }, h('h1', null, title), subtitle ? h('p', null, subtitle) : null),
      actions ? h('div', { class: 'page-actions' }, actions) : null);
  }

  function pill(text, tone = 'neutral') {
    return h('span', { class: `pill pill-${tone}` }, text);
  }

  function emptyState(title, detail, action) {
    return h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), detail ? h('p', null, detail) : null, action || null);
  }

  function statTile(label, value, sub) {
    return h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), sub ? h('div', { class: 'stat-sub' }, sub) : null);
  }

  function download(filename, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = h('a', { href: url, download: filename, style: 'display:none' });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /** Puts focus back on the keyboard's home field, without popping a phone's on-screen keyboard. */
  const hasFinePointer = () => !window.matchMedia || window.matchMedia('(pointer: fine)').matches;

  return { h, svg, icon, btn, iconBtn, clear, pageHeader, pill, emptyState, statTile, download, hasFinePointer };
})();

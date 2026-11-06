// Small DOM builder. Text always goes through text nodes, so user content can never become markup.
(function () {
  const BC = window.BC;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PROPERTY_KEYS = new Set(['value', 'checked', 'selected', 'disabled', 'readOnly']);

  function applyProps(node, props) {
    Object.keys(props || {}).forEach((key) => {
      const value = props[key];
      if (value === null || value === undefined || value === false) return;
      if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (PROPERTY_KEYS.has(key)) {
        node[key] = value;
      } else {
        node.setAttribute(key, value === true ? '' : String(value));
      }
    });
  }

  function append(node, children) {
    children.forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) append(node, child);
      else node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    });
  }

  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    applyProps(node, props);
    append(node, children);
    return node;
  }

  function s(tag, props, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    applyProps(node, props);
    append(node, children);
    return node;
  }

  const ICONS = {
    dashboard: 'M3 3h6v8H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 13h6v4H3z',
    invoice: 'M5 2h10v16l-2.5-1.5L10 18l-2.5-1.5L5 18zM8 6h4M8 9.5h4M8 13h2.5',
    quote: 'M4 2h8l4 4v12H4zM12 2v4h4M7 10h6M7 13.5h6',
    clients: 'M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13 3.4a3 3 0 0 1 0 5.2M15 12.4c1.8.6 3 2.4 3 4.6',
    catalogue: 'M3 6l7-3.5L17 6v8l-7 3.5L3 14zM3 6l7 3.5L17 6M10 9.5v8',
    settings: 'M3 5h8M15 5h2M3 10h2M9 10h8M3 15h6M13 15h4M13 3.5v3M7 8.5v3M11 13.5v3',
    plus: 'M10 4v12M4 10h12',
    print: 'M5 7V2.5h10V7M5 15H3V7h14v8h-2M5 12h10v5.5H5z',
    edit: 'M3 17l1-4L13.5 3.5l3 3L7 16zM11.5 5.5l3 3',
    copy: 'M7 7h10v10H7zM13 7V3H3v10h4',
    trash: 'M3.5 5.5h13M8 5.5V3h4v2.5M5 5.5l1 12h8l1-12M8.5 9v5M11.5 9v5',
    close: 'M5 5l10 10M15 5L5 15',
    up: 'M10 16V4M5 9l5-5 5 5',
    down: 'M10 4v12M5 11l5 5 5-5',
    grip: 'M7 4.5h.01M13 4.5h.01M7 10h.01M13 10h.01M7 15.5h.01M13 15.5h.01',
    search: 'M9 15A6 6 0 1 0 9 3a6 6 0 0 0 0 12zM13.5 13.5L17 17',
    sun: 'M10 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6L16 16M16 4l-1.4 1.4M5.4 14.6L4 16',
    moon: 'M16.5 12A7.5 7.5 0 0 1 8 3.5 7 7 0 1 0 16.5 12z',
    reset: 'M4 10a6 6 0 1 0 2-4.5M4 3v3.5h3.5',
    download: 'M10 3v10M5.5 9l4.5 4.5L14.5 9M3 17h14',
    upload: 'M10 13V3M5.5 7L10 2.5 14.5 7M3 17h14',
    check: 'M4 10.5l4 4 8-9',
    send: 'M3 10l14-7-4 15-3.5-6zM9.5 12L17 3',
    money: 'M2.5 5.5h15v9h-15zM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5 8v.01M15 12v.01',
    arrow: 'M4 10h12M11 5l5 5-5 5',
    back: 'M16 10H4M9 5l-5 5 5 5',
    statement: 'M4 2h12v16H4zM7 6h6M7 10h6M7 14h3',
  };

  function icon(name, size) {
    const px = size || 16;
    return s('svg', { class: 'icon', width: px, height: px, viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: ICONS[name] || '', fill: 'none', stroke: 'currentColor', 'stroke-width': name === 'grip' ? 2.6 : 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  let counter = 0;
  function uid(prefix) {
    counter += 1;
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + counter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  BC.dom = { h, s, icon, uid };
  BC.views = {};
})();

// A small element builder. Text always goes in through text nodes, so user content can't become markup.
const Dom = (() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const ICONS = {
    plus: ['M8 3v10M3 8h10'],
    more: ['M3.5 8h.01M8 8h.01M12.5 8h.01'],
    search: ['M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM14 14l-3.5-3.5'],
    x: ['M4 4l8 8M12 4l-8 8'],
    undo: ['M5.5 3L2.5 6l3 3', 'M2.5 6H9a4 4 0 0 1 0 8H6'],
    menu: ['M2.5 4.5h11M2.5 8h11M2.5 11.5h11'],
    board: ['M3 2.5v11M8 2.5v7M13 2.5v9'],
    calendar: ['M3 3.5h10a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM2 7h12M5.5 2v3M10.5 2v3'],
    table: ['M2 3.5h12v9H2zM2 6.5h12M2 9.5h12M6 6.5v6'],
    archive: ['M2 3.5h12v3H2zM3 6.5v6.5h10V6.5M6.5 9h3'],
    check: ['M3 8.5l3.5 3.5L13 4.5'],
    grip: ['M6 3.5h.01M10 3.5h.01M6 8h.01M10 8h.01M6 12.5h.01M10 12.5h.01'],
    left: ['M10 3L5 8l5 5'],
    right: ['M6 3l5 5-5 5'],
    up: ['M8 13V3M4 7l4-4 4 4'],
    down: ['M8 3v10M4 9l4 4 4-4'],
    top: ['M3 2.5h10M8 14V6M4.5 9.5L8 6l3.5 3.5'],
    bottom: ['M3 13.5h10M8 2v8M4.5 6.5L8 10l3.5-3.5'],
    trash: ['M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9h6.6l.7-9'],
    edit: ['M10.5 2.5l3 3L6 13l-3.5.5L3 10z'],
    sun: ['M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1'],
    moon: ['M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7z'],
    download: ['M8 2v8M4.5 7L8 10.5 11.5 7M2.5 13.5h11'],
    upload: ['M8 10.5V2.5M4.5 6L8 2.5 11.5 6M2.5 13.5h11'],
    reset: ['M3 8a5 5 0 1 0 1.6-3.7L2.5 6.2', 'M2.5 2.5v3.7h3.7'],
    alert: ['M8 2L1.5 13.5h13zM8 6.5v3.5M8 12h.01'],
    clock: ['M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.5V8l2.5 1.5'],
    list: ['M6.5 4h7M6.5 8h7M6.5 12h7M2.5 4l.8.8L4.5 3.4M2.5 8l.8.8 1.2-1.4M2.5 12l.8.8 1.2-1.4'],
  };

  function setProp(el, key, value) {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') el.setAttribute('class', value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'hidden') el[key] = !!value;
    else el.setAttribute(key, value === true ? '' : value);
  }

  function append(el, children) {
    children.flat(Infinity).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
  }

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    const { value, ...rest } = props || {};
    Object.entries(rest).forEach(([key, val]) => setProp(el, key, val));
    append(el, children);
    if (value !== undefined && value !== null) el.value = value; // After children, so a select can find its option.
    return el;
  }

  function icon(name, size = 16) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon');
    (ICONS[name] || []).forEach((d) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    });
    return svg;
  }

  function iconButton(name, label, onClick, props = {}) {
    const { class: extraClass, ...rest } = props;
    return h('button', { type: 'button', class: `icon-btn ${extraClass || ''}`, 'aria-label': label, title: label, onClick, ...rest }, icon(name));
  }

  function select(options, value, props = {}) {
    const items = options.map((o) => h('option', { value: o.value }, o.label));
    return h('select', { ...props, value }, items);
  }

  return { h, icon, iconButton, select };
})();

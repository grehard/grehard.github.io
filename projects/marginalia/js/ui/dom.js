// Small DOM helpers: element builder (text always goes in via textContent), icons and dates.
(function (MG) {
  'use strict';

  const ICONS = {
    plus: 'M12 5v14M5 12h14',
    x: 'M6 6l12 12M18 6L6 18',
    search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM16.2 16.2L20.5 20.5',
    graph: 'M7 8.5l9-3M7 8.5l3.5 9M16 5.5l3 8.5M10.5 17.5l8.5-3.5M5 7a2 2 0 1 0 4 0a2 2 0 0 0-4 0zM14.5 5a2 2 0 1 0 4 0a2 2 0 0 0-4 0zM17 14a2 2 0 1 0 4 0a2 2 0 0 0-4 0zM8.5 18a2 2 0 1 0 4 0a2 2 0 0 0-4 0z',
    sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    help: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM9.5 9.5a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 1.8M12 16.7v.1',
    pin: 'M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v6',
    history: 'M4 12a8 8 0 1 0 2.5-5.8L4 8.5M4 4v4.5h4.5M12 8v4.5l3 1.8',
    margin: 'M4 5h16v14H4zM15 5v14',
    download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
    upload: 'M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14',
    trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5',
    restore: 'M4 12a8 8 0 1 1 2.5 5.8M4 19v-5h5',
    back: 'M14.5 5.5L8 12l6.5 6.5',
    pencil: 'M15.5 5l3.5 3.5L8.5 19H5v-3.5z',
    fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    bold: 'M7.5 5h5.5a3.5 3.5 0 0 1 0 7H7.5zM7.5 12h6.5a3.5 3.5 0 0 1 0 7H7.5z',
    italic: 'M10.5 5h6M7.5 19h6M13.5 5l-3 14',
    strike: 'M5 12h14M16.5 7.5C16 6 14.3 5 12 5c-2.6 0-4.4 1.3-4.4 3.2 0 1.4 1 2.3 2.4 2.9M7.5 16.5C8 18 9.7 19 12 19c2.6 0 4.4-1.3 4.4-3.2 0-.6-.2-1.1-.5-1.6',
    heading: 'M6 5v14M18 5v14M6 12h12',
    quote: 'M9.5 7.5H5V13h4.5zM9.5 7.5V12c0 2.5-1.2 4-3.5 5M19 7.5h-4.5V13H19zM19 7.5V12c0 2.5-1.2 4-3.5 5',
    list: 'M9.5 6.5H20M9.5 12H20M9.5 17.5H20M5 6.5h.01M5 12h.01M5 17.5h.01',
    ordered: 'M10.5 6.5H20M10.5 12H20M10.5 17.5H20M4.5 5l1.3-.8V9M4.3 14.3c.3-1 2.3-1 2.3.3 0 1-2.3 1.7-2.3 3.2h2.5',
    task: 'M4.5 4.5h15v15h-15zM8.5 12.3l2.6 2.7 4.6-5.6',
    code: 'M8.5 7l-5 5 5 5M15.5 7l5 5-5 5',
    codeblock: 'M4 4.5h16v15H4zM10 9.5L7.5 12l2.5 2.5M14 9.5l2.5 2.5-2.5 2.5',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1',
    wiki: 'M7.5 4.5h-3v15h3M10.5 4.5h-3M10.5 19.5h-3M16.5 4.5h3v15h-3M13.5 4.5h3M13.5 19.5h3',
    table: 'M4 5h16v14H4zM4 10h16M4 14.5h16M10 5v14',
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  function setAttributes(el, attrs) {
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') el.setAttribute('class', value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'value') el.value = value;
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, value);
    });
  }

  /** h('button', {class: 'btn', onclick: fn}, 'Label', childNode) */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    setAttributes(el, attrs);
    children.flat().forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return el;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  }

  function $(id) {
    return document.getElementById(id);
  }

  const MINUTE = 60000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  function relativeTime(at, now) {
    const diff = (now || Date.now()) - at;
    if (diff < MINUTE) return 'just now';
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
    if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`;
    if (diff < 2 * DAY) return 'yesterday';
    if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} days ago`;
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fullTime(at) {
    return new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function clockTime(at) {
    return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many || `${one}s`}`;
  }

  MG.Dom = { h, icon, svgEl, $, relativeTime, fullTime, clockTime, plural };
})(window.MG = window.MG || {});

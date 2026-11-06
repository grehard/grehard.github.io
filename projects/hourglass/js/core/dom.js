// Small DOM helpers. All text goes through text nodes, so user input is never parsed as HTML.
(function (HG) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'readOnly', 'min', 'max', 'step']);

  function appendAll(parent, kids) {
    for (const kid of kids) {
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) appendAll(parent, kid);
      else parent.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }

  function setAttrs(el, attrs, isSvg) {
    for (const key of Object.keys(attrs || {})) {
      const value = attrs[key];
      if (value === null || value === undefined || value === false) continue;
      if (key === 'style' && typeof value === 'object') {
        for (const prop of Object.keys(value)) el.style.setProperty(prop, value[prop]);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (!isSvg && PROPS.has(key)) {
        el[key] = value;
      } else if (key === 'class' && !isSvg) {
        el.className = value;
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    setAttrs(el, attrs, false);
    appendAll(el, kids);
    return el;
  }

  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    setAttrs(el, attrs, true);
    appendAll(el, kids);
    return el;
  }

  const ICONS = {
    play: 'M7 4.5v15l12-7.500z',
    stop: 'M6.500 6.500h11v11h-11z',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.500 6.500l4 4',
    trash: 'M4 7h16M9 7V4h6v3M6.500 7l1 13h9l1-13M10 11v5.500M14 11v5.500',
    split: 'M12 3v5M12 16v5M5 12h14M8 9l-3 3 3 3M16 9l3 3-3 3',
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
    moon: 'M20 14.500A8.500 8.500 0 019.500 4 8.500 8.500 0 1020 14.500z',
    day: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
    week: 'M4 5h16v15H4zM4 10h16M9 5v15M15 5v15',
    chart: 'M4 20h16M7 20v-7M12 20V6M17 20v-10',
    focus: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z',
    folder: 'M3 6h6l2 3h10v10H3z',
    gear: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    tag: 'M4 4h8l8 8-8 8-8-8zM8.500 8.500h.01',
    dollar: 'M12 3v18M16.500 7.500C16 6 14.500 5.500 12 5.500 9.500 5.500 7.500 6.500 7.500 8.500c0 4.500 9.500 2.500 9.500 7 0 2-2 3-5 3-2.500 0-4.500-.5-5-2.500',
    warn: 'M12 4L2.500 20h19zM12 10v4.500M12 17.500h.01',
    print: 'M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7z',
    download: 'M12 4v11M7 11l5 5 5-5M4 20h16',
    upload: 'M12 16V5M7 9l5-5 5 5M4 20h16',
    clock: 'M12 7v5h4M12 3a9 9 0 100 18 9 9 0 000-18z',
    skip: 'M6 5l10 7-10 7zM18 5v14',
    sound: 'M4 10v4h3l5 4V6l-5 4zM16 9c1.500 1.500 1.500 4.500 0 6',
    report: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  };

  function icon(name, size) {
    const px = size || 16;
    const filled = name === 'play' || name === 'stop';
    return s('svg', {
      viewBox: '0 0 24 24', width: px, height: px, 'aria-hidden': 'true', class: 'icon',
      fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': filled ? 1.5 : 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }, s('path', { d: ICONS[name] || '' }));
  }

  /** Picks black or white text for a project color so labels stay readable on it. */
  function textOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const channel = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
    return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.05) ? '#ffffff' : '#141312';
  }

  /** Remembers keyboard focus and caret by data-fk, so a full view re-render doesn't lose the user's place. */
  function captureFocus() {
    const el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.fk) return null;
    const hasCaret = el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search');
    return { key: el.dataset.fk, caret: hasCaret ? el.selectionStart : null };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    const el = document.querySelector(`[data-fk="${CSS.escape(saved.key)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (saved.caret !== null && el.setSelectionRange) el.setSelectionRange(saved.caret, saved.caret);
  }

  function downloadFile(name, mime, text) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = h('a', { href: url, download: name, style: { display: 'none' } });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  HG.h = h;
  HG.s = s;
  HG.icon = icon;
  HG.dom = { textOn, captureFocus, restoreFocus, downloadFile };
})(window.HG);

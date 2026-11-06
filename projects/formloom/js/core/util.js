// Small DOM and formatting helpers shared by every module.
window.FL = window.FL || {};

FL.util = (function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const PROPERTY_PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'readOnly', 'required', 'multiple']);

  function appendAll(el, kids) {
    kids.forEach((kid) => {
      if (kid === null || kid === undefined || kid === false) return;
      if (Array.isArray(kid)) appendAll(el, kid);
      else el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    });
  }

  function applyProp(el, key, val) {
    if (val === null || val === undefined) return;
    if (key === 'class') el.setAttribute('class', val);
    else if (key === 'style') Object.keys(val).forEach((name) => el.style.setProperty(name, val[name]));
    else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    else if (PROPERTY_PROPS.has(key)) el[key] = val;
    else if (val === true) el.setAttribute(key, '');
    else if (val !== false) el.setAttribute(key, String(val));
  }

  /** Creates an element. Text children become text nodes, so user content is never parsed as HTML. */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    appendAll(el, kids); // children first, so a select's value can refer to its options
    Object.keys(props || {}).forEach((key) => applyProp(el, key, props[key]));
    return el;
  }

  function svg(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach((key) => el.setAttribute(key, attrs[key]));
    appendAll(el, kids);
    return el;
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  const pad = (n) => String(n).padStart(2, '0');

  function isoDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function addDays(date, days) {
    const copy = new Date(date.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function formatDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!match) return String(iso);
    return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
  }

  function formatDateTime(ts) {
    const date = new Date(ts);
    const hours = date.getHours();
    const clock = `${hours % 12 || 12}:${pad(date.getMinutes())} ${hours < 12 ? 'AM' : 'PM'}`;
    return `${formatDate(isoDate(date))}, ${clock}`;
  }

  /** "2026-11-06 14:05" in local time, which spreadsheets parse as a date. */
  function localStamp(ts) {
    const date = new Date(ts);
    return `${isoDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatBytes(bytes) {
    const size = Number(bytes) || 0;
    if (size < 1024) return `${size} B`;
    if (size < 1048576) return `${Math.round(size / 1024).toLocaleString('en-US')} KB`;
    return `${(size / 1048576).toFixed(1)} MB`;
  }

  function formatNumber(value) {
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function slugify(text) {
    const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug.slice(0, 60) || 'form';
  }

  function plural(count, one, many) {
    return `${count.toLocaleString('en-US')} ${count === 1 ? one : many || `${one}s`}`;
  }

  function download(filename, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function legacyCopy(text) {
    const area = h('textarea', { value: text, style: { position: 'fixed', top: '-100px', opacity: '0' } });
    const previous = document.activeElement;
    document.body.append(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
    area.remove();
    if (previous && previous.focus) previous.focus();
    return copied;
  }

  /** The async clipboard API is often blocked inside iframes, so fall back to execCommand. */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      return legacyCopy(text);
    }
  }

  /** Small seeded generator, so demo responses are the same on every reset. */
  function seededRandom(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Runs a re-render, then puts focus back on the control with the same data-fk key. */
  function keepFocus(container, render) {
    const active = document.activeElement;
    const key = active && container.contains(active) ? active.getAttribute('data-fk') : null;
    const caret = key && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    render();
    if (!key) return;
    const next = container.querySelector(`[data-fk="${CSS.escape(key)}"]`);
    if (!next) return;
    next.focus({ preventScroll: true });
    if (caret !== null && typeof next.setSelectionRange === 'function') {
      try { next.setSelectionRange(caret, caret); } catch (err) { /* some input types have no caret */ }
    }
  }

  return {
    h, svg, clear, uid, isoDate, addDays, formatDate, formatDateTime, localStamp, formatBytes,
    formatNumber, slugify, plural, download, copyText, seededRandom, keepFocus,
  };
})();

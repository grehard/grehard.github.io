// Shared helpers. Everything in the app hangs off the single DB namespace.
window.DB = window.DB || {};
(function (DB) {
  'use strict';

  let counter = 0;
  function uid(prefix) {
    counter += 1;
    return (prefix || 's') + Date.now().toString(36) + counter.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // Two decimals is well below a device pixel at the maximum zoom, and keeps exports readable.
  function round(v) {
    const r = Math.round(v * 100) / 100;
    return r === 0 ? 0 : r;
  }

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.forEach((child) => { if (child) node.append(child); });
    return node;
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function slugify(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'board';
  }

  function debounce(fn, ms) {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(...args); }, ms);
    };
    wrapped.flush = (...args) => {
      if (timer !== null) { clearTimeout(timer); timer = null; fn(...args); }
    };
    return wrapped;
  }

  // Storage falls back to an in-memory map, so a blocked localStorage only costs persistence.
  const memory = new Map();
  const storage = {
    healthy: true,
    get(key) {
      if (memory.has(key)) return memory.get(key);
      try { return window.localStorage.getItem(key); } catch (e) { this.healthy = false; return null; }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        memory.delete(key);
        this.healthy = true;
        return true;
      } catch (e) {
        memory.set(key, value);
        this.healthy = false;
        return false;
      }
    },
    remove(key) {
      memory.delete(key);
      try { window.localStorage.removeItem(key); } catch (e) { this.healthy = false; }
    },
    readJSON(key) {
      const raw = this.get(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
  };

  function createEmitter() {
    const listeners = new Map();
    return {
      on(name, fn) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(fn);
      },
      emit(name, payload) {
        (listeners.get(name) || []).forEach((fn) => fn(payload));
      },
    };
  }

  DB.util = { uid, clamp, round, el, downloadBlob, slugify, debounce, storage, createEmitter };
})(window.DB);

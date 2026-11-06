// Loaded in the head so a remembered theme applies before first paint.
(function (R) {
  'use strict';
  const KEY = 'rhythm:theme';

  function saved() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function current() {
    const explicit = document.documentElement.dataset.theme;
    if (explicit) return explicit;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function set(value) {
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem(KEY, value); } catch (e) { /* the choice lasts for this page load */ }
  }

  const initial = saved();
  if (initial) document.documentElement.dataset.theme = initial;

  R.theme = { current, set, toggle: () => set(current() === 'dark' ? 'light' : 'dark') };
})(window.Rhythm = window.Rhythm || {});

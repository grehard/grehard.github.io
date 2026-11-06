// Runs in <head> so a remembered theme applies before first paint.
(function () {
  'use strict';
  try {
    var theme = window.localStorage.getItem('marginalia.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch (err) {
    // Storage blocked: fall back to prefers-color-scheme.
  }
})();

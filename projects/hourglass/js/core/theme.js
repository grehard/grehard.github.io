// Runs in <head> so the first paint already has the right theme.
(function () {
  'use strict';
  const KEY = 'hourglass.theme';
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() {
    try {
      const value = localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (e) {
      return null;
    }
  }

  let memoryChoice = stored();

  function effective() {
    return memoryChoice || (media && media.matches ? 'dark' : 'light');
  }

  function apply() {
    document.documentElement.setAttribute('data-theme', effective());
    if (window.HG && HG.onThemeChange) HG.onThemeChange();
  }

  function choose(value) {
    memoryChoice = value === 'light' || value === 'dark' ? value : null;
    try {
      if (memoryChoice) localStorage.setItem(KEY, memoryChoice);
      else localStorage.removeItem(KEY);
    } catch (e) { /* the choice still holds for this session */ }
    apply();
  }

  if (media && media.addEventListener) media.addEventListener('change', apply);
  window.HG = window.HG || {};
  HG.theme = { effective, choose, choice: () => memoryChoice };
  apply();
})();

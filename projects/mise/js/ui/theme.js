// Theme choice. Loaded in <head> so the page never flashes the wrong colors.
window.Mise = window.Mise || {};

Mise.Theme = (() => {
  const KEY = 'mise.theme';

  function stored() {
    try {
      const value = window.localStorage.getItem(KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function apply(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
  }

  function isDark() {
    const chosen = document.documentElement.getAttribute('data-theme');
    if (chosen) return chosen === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function toggle() {
    const next = isDark() ? 'light' : 'dark';
    apply(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch (error) {
      // The choice lasts for this visit only.
    }
  }

  apply(stored());
  return { isDark, toggle };
})();

// Runs in <head> so a remembered theme applies before first paint.
(function () {
  const KEY = 'billcraft.theme';
  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function apply(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  }
  function current() {
    const set = document.documentElement.getAttribute('data-theme');
    if (set) return set;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* stays for this session only */ }
    return next;
  }
  apply(read());
  window.BC = window.BC || {};
  window.BC.theme = { current, toggle };
})();

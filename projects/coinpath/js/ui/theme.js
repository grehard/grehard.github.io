// Loaded in the head so the saved theme applies before first paint. With no saved
// choice the stylesheet follows prefers-color-scheme.
(function () {
  const ns = (window.Coinpath = window.Coinpath || {});
  const KEY = 'coinpath.theme';

  function read() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (err) {
      return null;
    }
  }

  function apply(choice) {
    if (choice === 'light' || choice === 'dark') document.documentElement.setAttribute('data-theme', choice);
    else document.documentElement.removeAttribute('data-theme');
  }

  /** 'light', 'dark', or 'system' when following the operating system. */
  function choice() {
    return document.documentElement.getAttribute('data-theme') || 'system';
  }

  function effective() {
    const chosen = choice();
    if (chosen !== 'system') return chosen;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function set(value) {
    apply(value);
    try {
      if (value === 'system') window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, value);
    } catch (err) {
      // Storage blocked: the choice still applies for this visit.
    }
  }

  apply(read());
  ns.Theme = { choice, effective, set };
})();

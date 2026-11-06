// Hash routing, re-rendering and the once-a-while clock tick.
(function (R) {
  'use strict';
  const { h, icon } = R.dom;
  const TICK_MS = 15000;
  const NAV = [
    { key: 'today', label: 'Today', icon: 'today' },
    { key: 'week', label: 'Week', icon: 'week' },
    { key: 'habits', label: 'Habits', icon: 'habits' },
    { key: 'stats', label: 'Stats', icon: 'stats' },
    { key: 'journal', label: 'Journal', icon: 'journal' },
    { key: 'settings', label: 'Settings', icon: 'settings' },
  ];

  let viewRoot = null;
  let navRoot = null;
  let lastToday = '';
  let lastRouteKey = '';

  function parseRoute() {
    let parts = [];
    try {
      parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    } catch (e) { /* a malformed hash falls through to Today */ }
    const name = Object.prototype.hasOwnProperty.call(R.views, parts[0]) ? parts[0] : 'today';
    return { name, params: parts.slice(1), key: `${name}/${parts.slice(1).join('/')}` };
  }

  /** Keeps keyboard focus and inner scroll positions across a full redraw of the view. */
  function captureUi() {
    const active = document.activeElement;
    const focusKey = viewRoot.contains(active) && active.dataset ? active.dataset.fk : null;
    const scrolls = {};
    viewRoot.querySelectorAll('[data-scroll-key]').forEach((el) => { scrolls[el.dataset.scrollKey] = el.scrollLeft; });
    return { focusKey, scrolls };
  }

  function restoreUi({ focusKey, scrolls }) {
    viewRoot.querySelectorAll('[data-scroll-key]').forEach((el) => {
      if (el.dataset.scrollKey in scrolls) el.scrollLeft = scrolls[el.dataset.scrollKey];
    });
    if (!focusKey) return;
    const twin = viewRoot.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`);
    if (twin && !twin.disabled) twin.focus({ preventScroll: true });
    if (twin && twin.dataset.row) {
      viewRoot.querySelectorAll('button.cell[tabindex="0"]').forEach((b) => b.setAttribute('tabindex', '-1'));
      twin.setAttribute('tabindex', '0');
    }
  }

  function render() {
    const route = parseRoute();
    const view = R.views[route.name];
    const routeChanged = route.key !== lastRouteKey;
    const ui = routeChanged ? { focusKey: null, scrolls: {} } : captureUi();
    lastRouteKey = route.key;
    lastToday = R.Dates.today();
    viewRoot.replaceChildren(view.render(route.params));
    restoreUi(ui);
    const navKey = view.navKey || route.name;
    navRoot.querySelectorAll('a').forEach((link) => {
      if (link.dataset.nav === navKey) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.title = `${view.title} - Rhythm`;
    if (routeChanged) window.scrollTo(0, 0);
    updateThemeButton();
  }

  function updateThemeButton() {
    const button = document.getElementById('theme-toggle');
    const isDark = R.theme.current() === 'dark';
    const label = `Switch to ${isDark ? 'light' : 'dark'} theme`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.replaceChildren(icon(isDark ? 'sun' : 'moon'), h('span', {}, isDark ? 'Light theme' : 'Dark theme'));
  }

  function buildNav() {
    navRoot.replaceChildren(...NAV.map((item) => h('a', { href: `#/${item.key}`, data: { nav: item.key } }, icon(item.icon, 20), h('span', {}, item.label))));
  }

  function tick() {
    if (R.Dates.today() !== lastToday) render();
    R.Reminders.check();
  }

  function start() {
    viewRoot = document.getElementById('view');
    navRoot = document.getElementById('nav');
    R.Store.load();
    R.Store.subscribe(render);
    buildNav();
    document.getElementById('theme-toggle').addEventListener('click', () => { R.theme.toggle(); render(); });
    window.addEventListener('hashchange', render);
    window.addEventListener('pagehide', R.Store.flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') R.Store.flush(); else tick(); });
    render();
    if (R.Store.wasRecovered()) R.overlays.toast('Saved data could not be read, so the demo data was loaded instead.');
    R.Reminders.check();
    setInterval(tick, TICK_MS);
  }

  R.app = { render, start };
  start();
})(window.Rhythm);

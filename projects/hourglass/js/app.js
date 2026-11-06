// Starts the app: hash routing, navigation, the theme toggle and the clock tick.
(function (HG) {
  'use strict';
  const { h, icon } = HG;
  const TICK_MS = 500;
  const REFRESH_MS = 60000;

  const ROUTES = [
    { key: 'day', label: 'Day', icon: 'day', view: () => HG.views.day },
    { key: 'week', label: 'Week', icon: 'week', view: () => HG.views.week },
    { key: 'focus', label: 'Focus', icon: 'focus', view: () => HG.views.focus },
    { key: 'reports', label: 'Reports', icon: 'chart', view: () => HG.views.reports },
    { key: 'projects', label: 'Projects', icon: 'folder', view: () => HG.views.manage },
    { key: 'settings', label: 'Settings', icon: 'gear', view: () => HG.views.settings },
  ];
  const HIDDEN_ROUTES = { print: { view: () => HG.views.print, navKey: 'week' } };

  let lastRefresh = 0;
  let lastRouteKey = null;

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const key = parts[0] || 'day';
    const known = ROUTES.some((r) => r.key === key) || HIDDEN_ROUTES[key];
    return known ? { key, params: parts.slice(1) } : { key: 'day', params: [] };
  }

  function renderNav(activeKey) {
    const nav = document.getElementById('nav');
    const alerts = HG.budget.alerts(HG.store.state, Date.now()).filter((a) => a.status === 'over').length;
    nav.replaceChildren(...ROUTES.map((route) => h('a', {
      href: `#/${route.key}`, class: 'nav-link', id: `nav-${route.key}`, 'aria-current': route.key === activeKey ? 'page' : null,
    }, icon(route.icon, 18), h('span', { class: 'nav-label' }, route.label),
    route.key === 'projects' && alerts > 0 && h('span', { class: 'nav-badge', 'aria-label': `${alerts} over budget` }, String(alerts)))));
  }

  function render() {
    const route = parseRoute();
    const hidden = HIDDEN_ROUTES[route.key];
    const def = hidden || ROUTES.find((r) => r.key === route.key);
    const saved = HG.dom.captureFocus();
    const view = document.getElementById('view');
    const content = def.view().render(route.params);
    view.replaceChildren(content);
    if (content.mount) content.mount();
    renderNav(hidden ? hidden.navKey : route.key);
    document.body.dataset.route = route.key;
    HG.timerbar.sync();
    HG.dom.restoreFocus(saved);
    HG.charts.hideTip();
    if (route.key !== lastRouteKey) {
      if (lastRouteKey !== null) window.scrollTo(0, 0);
      lastRouteKey = route.key;
    }
    lastRefresh = Date.now();
  }

  /** Whole-view refreshes for slow-moving numbers, skipped while someone is using a form. */
  function canRefreshQuietly() {
    if (HG.ui.modalIsOpen()) return false;
    const el = document.activeElement;
    return !el || !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
  }

  function tick() {
    const now = Date.now();
    HG.focus.advance(now);
    HG.timerbar.tick(now);
    HG.views.focus.tick(now);
    if (now - lastRefresh >= REFRESH_MS && canRefreshQuietly() && (document.body.dataset.route === 'day' || document.body.dataset.route === 'projects')) {
      render();
    }
  }

  function syncThemeButton() {
    const button = document.getElementById('theme-toggle');
    if (!button) return;
    const dark = HG.theme.effective() === 'dark';
    button.replaceChildren(icon(dark ? 'sun' : 'moon'));
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    button.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  }

  function start() {
    HG.store.load();
    HG.timerbar.build();
    HG.onThemeChange = syncThemeButton;
    syncThemeButton();
    document.getElementById('theme-toggle').addEventListener('click', () => {
      HG.theme.choose(HG.theme.effective() === 'dark' ? 'light' : 'dark');
      if (document.body.dataset.route === 'settings' || document.body.dataset.route === 'reports') render();
    });
    HG.store.on(render);
    window.addEventListener('hashchange', render);
    // Catch up before the first paint, in case focus phases ended while the page was closed.
    HG.focus.advance(Date.now());
    render();
    setInterval(tick, TICK_MS);
  }

  HG.app = { render };
  start();
})(window.HG);

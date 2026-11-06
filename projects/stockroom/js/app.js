// App shell: navigation rail, hash routing, theme, and the commit cycle that saves and redraws.
SR.app = (function () {
  const { h, icon, clear, toast } = SR.ui;

  const NAV = [
    { route: 'register', label: 'Register', iconName: 'register' },
    { route: 'sales', label: 'Sales', iconName: 'sales' },
    { route: 'products', label: 'Products', iconName: 'products' },
    { route: 'inventory', label: 'Inventory', iconName: 'inventory' },
    { route: 'orders', label: 'Orders', iconName: 'orders' },
    { route: 'reports', label: 'Reports', iconName: 'reports' },
    { route: 'close', label: 'End of day', iconName: 'close' },
    { route: 'settings', label: 'Settings', iconName: 'settings' },
  ];

  let current = null;
  let currentRoute = null;
  let viewEl = null;
  let railEl = null;
  let themeBtn = null;

  function parseHash() {
    const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const route = NAV.some((n) => n.route === parts[0]) ? parts[0] : 'register';
    return { route, params: parts.slice(1) };
  }

  function route() {
    const { route: name, params } = parseHash();
    SR.ui.closeAllModals();
    if (current && current.unmount) current.unmount();
    current = SR.views[name];
    currentRoute = name;
    clear(viewEl);
    viewEl.className = current.fullBleed ? 'view view-bleed' : 'view';
    viewEl.scrollTop = 0;
    const holder = current.fullBleed ? viewEl : viewEl.appendChild(h('div', { class: 'page' }));
    current.mount(holder, params);
    paintRail();
  }

  function go(hashPath) {
    const target = `#/${hashPath}`;
    if (window.location.hash === target) route();
    else window.location.hash = target;
  }

  function paintRail() {
    const lowCount = SR.purchasing.lowStockRows(SR.store.state).length;
    railEl.querySelectorAll('[data-route]').forEach((link) => {
      const active = link.dataset.route === currentRoute;
      link.classList.toggle('on', active);
      if (active) {
        link.setAttribute('aria-current', 'page');
        railEl.querySelector('.rail-links').scrollLeft = Math.max(0, link.offsetLeft - 80);
      }
      else link.removeAttribute('aria-current');
      const badge = link.querySelector('.rail-badge');
      if (badge) {
        badge.textContent = lowCount;
        badge.hidden = !lowCount;
        link.setAttribute('aria-label', lowCount ? `Inventory, ${lowCount} low stock alerts` : 'Inventory');
      }
    });
  }

  /** Saves state and redraws. Views that manage their own focus pass skipView and redraw themselves. */
  function commit({ skipView } = {}) {
    SR.store.save();
    paintRail();
    if (!skipView && current && current.refresh) current.refresh();
  }

  function effectiveTheme() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function paintThemeBtn() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    clear(themeBtn).append(icon(next === 'dark' ? 'moon' : 'sun', 20), h('span', { class: 'rail-label' }, next === 'dark' ? 'Dark' : 'Light'));
    themeBtn.setAttribute('aria-label', `Switch to ${next} theme`);
  }

  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    SR.store.saveTheme(next);
    paintThemeBtn();
    if (current && current.refresh && currentRoute === 'reports') current.refresh();
  }

  function buildRail() {
    themeBtn = h('button', { type: 'button', class: 'rail-link rail-theme', onClick: toggleTheme });
    railEl = h('nav', { class: 'rail', 'aria-label': 'Main' },
      h('div', { class: 'rail-brand', title: SR.store.state.settings.shopName },
        h('span', { class: 'rail-mark', 'aria-hidden': 'true' }, icon('products', 20)), h('span', { class: 'rail-name' }, 'Stockroom')),
      h('div', { class: 'rail-links' }, NAV.map((item) => h('a', { class: 'rail-link', href: `#/${item.route}`, dataset: { route: item.route } },
        icon(item.iconName, 20),
        h('span', { class: 'rail-label' }, item.label),
        item.route === 'inventory' ? h('span', { class: 'rail-badge', hidden: true }) : null)),
      themeBtn));
    paintThemeBtn();
    return railEl;
  }

  function onGlobalKey(event) {
    if (SR.ui.modalOpen()) return;
    if (current && current.onKey) current.onKey(event);
  }

  function start() {
    const savedTheme = SR.store.loadTheme();
    if (savedTheme === 'dark' || savedTheme === 'light') document.documentElement.setAttribute('data-theme', savedTheme);
    SR.store.load();
    const app = document.getElementById('app');
    viewEl = h('main', { id: 'view', class: 'view', tabindex: '-1' });
    app.append(buildRail(), viewEl);
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', onGlobalKey);
    route();
    if (SR.store.loadNotice) toast(SR.store.loadNotice, { tone: 'bad' });
  }

  return { start, go, commit };
})();

SR.app.start();

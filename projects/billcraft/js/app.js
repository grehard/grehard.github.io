// App shell and hash router.
(function () {
  const BC = window.BC;
  const { h, icon } = BC.dom;
  const { store, ui, views, paper } = BC;

  const NAV = [
    { href: '#/dashboard', label: 'Dashboard', icon: 'dashboard', match: 'dashboard' },
    { href: '#/invoices', label: 'Invoices', icon: 'invoice', match: 'invoices' },
    { href: '#/quotes', label: 'Quotes', icon: 'quote', match: 'quotes' },
    { href: '#/clients', label: 'Clients', icon: 'clients', match: 'clients' },
    { href: '#/catalogue', label: 'Catalogue', icon: 'catalogue', match: 'catalogue' },
    { href: '#/settings', label: 'Settings', icon: 'settings', match: 'settings' },
  ];

  let guard = null;
  let currentHash = '';
  let currentPage = null;
  let shell = null;

  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, queryText] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return { parts, query: Object.fromEntries(new URLSearchParams(queryText || '')) };
  }

  function documentRoute(kind, parts, query) {
    if (parts[1] === 'new') return views.documentEditor(kind, null, query);
    if (parts[1] && parts[2] === 'edit') return views.documentEditor(kind, parts[1], query);
    if (parts[1]) return views.documentDetail(kind, parts[1]);
    return views.documentList(kind, query);
  }

  function pageFor({ parts, query }) {
    switch (parts[0]) {
      case 'invoices': return documentRoute('invoice', parts, query);
      case 'quotes': return documentRoute('quote', parts, query);
      case 'clients': return parts[1] ? views.clientDetail(parts[1]) : views.clients();
      case 'catalogue': return views.catalogue();
      case 'settings': return views.settings();
      default: return views.dashboard();
    }
  }

  function themeButton(extraClass) {
    const label = () => (BC.theme.current() === 'dark' ? 'Light theme' : 'Dark theme');
    const glyph = () => (BC.theme.current() === 'dark' ? 'sun' : 'moon');
    const button = h('button', {
      class: `side-btn ${extraClass || ''}`.trim(),
      type: 'button',
      'data-theme-toggle': '',
      onclick: () => { BC.theme.toggle(); drawShellControls(); },
    });
    button.draw = () => button.replaceChildren(icon(glyph()), h('span', { class: 'side-btn-text' }, label()));
    button.draw();
    return button;
  }

  function drawShellControls() {
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => button.draw());
  }

  function resetDemo() {
    ui.undoable('Demo data restored.', () => {
      store.resetDemo();
      paper.applyPageSize(store.state.profile.paperSize);
    });
  }

  function requestReset() {
    if (guard && guard()) {
      ui.confirmAction({
        title: 'Discard unsaved changes?',
        message: 'Resetting the demo data leaves this editor without saving it.',
        action: 'Discard and reset',
        danger: true,
        cancelLabel: 'Keep editing',
        onConfirm: () => { guard = null; location.hash = '#/dashboard'; resetDemo(); },
      });
      return;
    }
    resetDemo();
  }

  function buildShell() {
    const nav = (cls) => h('nav', { class: cls, 'aria-label': 'Main' }, NAV.map((item) => h('a', { href: item.href, 'data-nav': item.match }, icon(item.icon, 17), h('span', {}, item.label))));
    const brand = () => h('a', { class: 'brand', href: '#/dashboard' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('invoice', 15)), 'Billcraft');
    const notice = h('div', { class: 'storage-notice no-print', role: 'status', id: 'storage-notice', hidden: true }, 'Your browser is blocking storage, so changes last only until this page closes. Export a backup from Settings to keep them.');
    const main = h('main', { id: 'main', tabindex: -1 });
    shell = h('div', { class: 'app' },
      h('aside', { class: 'side no-print' },
        brand(),
        nav('side-nav'),
        h('div', { class: 'side-foot' },
          themeButton(),
          h('button', { class: 'side-btn', type: 'button', id: 'reset-demo', onclick: requestReset }, icon('reset'), h('span', { class: 'side-btn-text' }, 'Reset demo data')))),
      h('header', { class: 'mobile-bar no-print' },
        brand(),
        h('div', { class: 'mobile-actions' },
          themeButton('side-btn-icon'),
          h('button', { class: 'side-btn side-btn-icon', type: 'button', 'aria-label': 'Reset demo data', onclick: requestReset }, icon('reset'), h('span', { class: 'side-btn-text' }, 'Reset')))),
      h('div', { class: 'main-column' }, notice, main),
      nav('tab-bar no-print'));
    document.getElementById('app').replaceChildren(shell);
  }

  function markActiveNav(section) {
    const active = NAV.some((item) => item.match === section) ? section : 'dashboard';
    document.querySelectorAll('[data-nav]').forEach((link) => {
      if (link.dataset.nav === active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function render() {
    const route = parseRoute();
    const main = document.getElementById('main');
    currentPage = pageFor(route);
    main.replaceChildren(currentPage);
    markActiveNav(route.parts[0] || 'dashboard');
    document.getElementById('storage-notice').hidden = !store.storageFailed;
  }

  function navigateTo(hash) {
    guard = null;
    location.hash = hash;
  }

  function onHashChange() {
    if (location.hash === currentHash) return;
    if (guard && guard()) {
      const target = location.hash;
      // Puts the address back while the question is open, and leaves the editor untouched.
      history.replaceState(null, '', currentHash || '#/dashboard');
      ui.confirmAction({
        title: 'Discard unsaved changes?',
        message: 'You have changes on this page that have not been saved.',
        action: 'Discard changes',
        danger: true,
        cancelLabel: 'Keep editing',
        onConfirm: () => navigateTo(target),
      });
      return;
    }
    guard = null;
    currentHash = location.hash;
    render();
    window.scrollTo(0, 0);
    document.getElementById('main').focus({ preventScroll: true });
  }

  function start() {
    buildShell();
    paper.applyPageSize(store.state.profile.paperSize);
    if (!location.hash) history.replaceState(null, '', '#/dashboard');
    currentHash = location.hash;
    window.addEventListener('hashchange', onHashChange);
    store.subscribe(() => {
      if (location.hash !== currentHash) return; // a route change is already on its way and will draw
      if (currentPage && currentPage.keepOnCommit) return;
      const scroll = window.scrollY;
      render();
      window.scrollTo(0, scroll);
      if (document.activeElement === document.body) document.getElementById('main').focus({ preventScroll: true });
    });
    render();
  }

  BC.app = {
    render,
    resetDemo: requestReset,
    setGuard: (fn) => { guard = fn; },
  };

  start();
})();

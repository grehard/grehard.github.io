// Application shell: owns the state, the save-and-redraw cycle, routing and undo.
(function () {
  const ns = window.Coinpath;
  const { el, icon, svg } = ns.Dom;
  const { Store, Seed, Recurring, Dates, Ledger, Money, Overlays } = ns;

  const NAV = [
    { route: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { route: 'transactions', label: 'Transactions', icon: 'list' },
    { route: 'budgets', label: 'Budgets', icon: 'budget' },
    { route: 'accounts', label: 'Accounts', icon: 'wallet' },
    { route: 'recurring', label: 'Recurring', icon: 'repeat' },
    { route: 'settings', label: 'Settings', icon: 'settings' },
  ];

  const App = {
    state: null,
    viewMonth: Dates.monthOf(Dates.today()),
    lastPostDate: Dates.today(),

    money(cents, opts) {
      return Money.format(cents, App.state.currency, opts);
    },

    /**
     * Applies a change, saves and redraws. With undo: true the toast offers a full
     * restore, which covers every kind of change without per-action undo logic.
     * toast may be a function when its text depends on what the change did.
     */
    commit(mutate, opts) {
      const o = opts || {};
      const snapshot = o.undo ? JSON.stringify(App.state) : null;
      mutate(App.state);
      Store.save(App.state);
      App.render();
      keepFocusInPage();
      if (o.toast) {
        const message = typeof o.toast === 'function' ? o.toast() : o.toast;
        Overlays.showToast(message, { undo: o.undo ? () => App.restore(snapshot) : null });
      }
    },

    restore(snapshot) {
      App.state = Store.sanitize(JSON.parse(snapshot));
      Store.save(App.state);
      App.render();
      keepFocusInPage();
      Overlays.showToast('Change undone');
    },

    /** Swaps in a whole new state (reset, restore, clear), with an undo back to the old one. */
    replaceState(next, message) {
      const snapshot = JSON.stringify(App.state);
      App.state = next;
      Recurring.postDue(App.state, Dates.today());
      Store.save(App.state);
      App.viewMonth = Dates.monthOf(Dates.today());
      App.render();
      keepFocusInPage();
      Overlays.showToast(message, { undo: () => App.restore(snapshot) });
    },

    confirmReset() {
      Overlays.confirmModal({
        title: 'Reset demo data?',
        message: 'This replaces everything with the original sample accounts and transactions. You can undo right after.',
        confirmLabel: 'Reset data',
        danger: true,
        onConfirm: () => App.replaceState(Seed.build(Dates.today()), 'Demo data restored'),
      });
    },

    navigate(route) {
      const target = '#/' + route;
      if (window.location.hash === target) App.render();
      else window.location.hash = target;
    },

    refreshShell() {
      renderSidebar();
    },

    render() {
      renderSidebar();
      renderView();
    },
  };

  function currentRoute() {
    const route = window.location.hash.replace(/^#\/?/, '');
    return NAV.some((item) => item.route === route) ? route : 'dashboard';
  }

  function themeButton() {
    const isDark = ns.Theme.effective() === 'dark';
    return el('button', {
      type: 'button', class: 'side-btn theme-toggle', 'aria-label': isDark ? 'Switch to light theme' : 'Switch to dark theme',
      onClick: () => {
        ns.Theme.set(ns.Theme.effective() === 'dark' ? 'light' : 'dark');
        renderSidebar();
        document.querySelector('.theme-toggle').focus();
        if (currentRoute() === 'settings') renderView();
      },
    }, icon(isDark ? 'sun' : 'moon'), el('span', { class: 'side-btn-label' }, isDark ? 'Light theme' : 'Dark theme'));
  }

  function sidebarAccounts() {
    const state = App.state;
    const today = Dates.today();
    const balances = Ledger.balances(state, today);
    return el('div', { class: 'side-accounts' },
      el('div', { class: 'side-networth' },
        el('span', null, 'Net worth'),
        el('strong', null, App.money(Ledger.netWorth(state, today)))),
      el('ul', null, state.accounts.map((account) => el('li', null,
        el('button', { type: 'button', class: 'side-account', title: account.name, onClick: () => ns.Views.transactions.showWith({ accountId: account.id }) },
          el('span', { class: 'side-account-name' }, account.name),
          el('span', { class: 'side-account-balance' }, App.money(balances[account.id])))))));
  }

  function renderSidebar() {
    const route = currentRoute();
    const side = document.getElementById('sidebar');
    side.textContent = '';
    side.append(
      el('div', { class: 'brand' }, brandMark(), el('span', { class: 'brand-name' }, 'Coinpath')),
      el('nav', { class: 'nav', 'aria-label': 'Main' }, NAV.map((item) => el('a', {
        class: 'nav-link', href: '#/' + item.route, 'aria-current': item.route === route ? 'page' : null,
      }, icon(item.icon, 18), el('span', null, item.label)))),
      sidebarAccounts(),
      el('div', { class: 'side-foot' }, themeButton(),
        el('button', { type: 'button', class: 'side-btn side-reset', onClick: App.confirmReset }, icon('repeat'), el('span', { class: 'side-btn-label' }, 'Reset demo data'))));
  }

  function brandMark() {
    return svg('svg', { class: 'brand-mark', viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true' },
      svg('circle', { cx: 12, cy: 12, r: 11, fill: 'currentColor' }),
      svg('path', { d: 'M6 16l4-5 3 3 5-7', fill: 'none', stroke: 'var(--brand-mark-ink)', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  function renderView() {
    const main = document.getElementById('main');
    const scrollY = window.scrollY;
    main.textContent = '';
    ns.Views[currentRoute()].render(main);
    window.scrollTo(0, scrollY);
    document.title = ns.Views[currentRoute()].title + ' · Coinpath';
  }

  function focusHeading() {
    const heading = document.getElementById('page-heading');
    if (heading) heading.focus({ preventScroll: true });
  }

  // Redrawing removes the focused control, which would drop keyboard users to the top.
  function keepFocusInPage() {
    if (document.activeElement === document.body && !document.body.classList.contains('modal-open')) focusHeading();
  }

  function postDueWithNotice() {
    const today = Dates.today();
    const posted = Recurring.postDue(App.state, today);
    App.lastPostDate = today;
    if (!posted.length) return;
    Store.save(App.state);
    App.render();
    Overlays.showToast('Posted ' + posted.length + ' due recurring ' + (posted.length === 1 ? 'transaction' : 'transactions'), {
      action: { label: 'View', run: () => App.navigate('recurring') },
    });
  }

  function loadInitialState() {
    const loaded = Store.load();
    if (loaded) return loaded;
    const seeded = Seed.build(Dates.today());
    if (Store.lastLoadFailed()) setTimeout(() => Overlays.showToast('Saved data could not be read, so demo data was loaded. The old data was kept as a backup copy in storage.', { error: true }), 0);
    return seeded;
  }

  function bindGlobalEvents() {
    window.addEventListener('hashchange', () => {
      Overlays.closeModal();
      window.scrollTo(0, 0);
      App.render();
      focusHeading();
    });
    // Another tab changed the data: pick it up rather than overwrite it later.
    window.addEventListener('storage', (event) => {
      if (event.key !== Store.DATA_KEY) return;
      const fresh = Store.load();
      if (fresh) { App.state = fresh; App.render(); }
    });
    // A tab left open overnight still posts what came due once it's looked at again.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && App.lastPostDate !== Dates.today()) postDueWithNotice();
    });
  }

  function start() {
    App.state = loadInitialState();
    Store.save(App.state);
    bindGlobalEvents();
    App.render();
    postDueWithNotice();
  }

  ns.App = App;
  start();
})();

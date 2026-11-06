// The transaction list: filters, totals, and the per-account running balance.
(function () {
  const ns = window.Coinpath;
  const { el, button, iconButton, icon, select, field, swatch, pageHead, emptyState } = ns.Dom;
  const { Dates, Ledger, TxForm, Exporter } = ns;
  const PAGE_SIZE = 100;

  const EMPTY_FILTERS = { q: '', preset: 'all', from: '', to: '', accountId: '', categoryId: '', type: '' };
  let filters = Object.assign({}, EMPTY_FILTERS);
  let visibleCount = PAGE_SIZE;
  let resultsNode = null;
  let filtersOpenOnPhone = false;

  const PRESETS = [
    { value: 'all', label: 'All dates' }, { value: 'this-month', label: 'This month' }, { value: 'last-month', label: 'Last month' },
    { value: 'last-90', label: 'Last 90 days' }, { value: 'this-year', label: 'This year' }, { value: 'custom', label: 'Custom range' },
  ];

  function presetRange(preset) {
    const today = Dates.today();
    const month = Dates.monthOf(today);
    if (preset === 'this-month') return { from: Dates.firstOfMonth(month), to: Dates.lastOfMonth(month) };
    if (preset === 'last-month') { const last = Dates.shiftMonth(month, -1); return { from: Dates.firstOfMonth(last), to: Dates.lastOfMonth(last) }; }
    if (preset === 'last-90') return { from: Dates.addDays(today, -89), to: today };
    if (preset === 'this-year') return { from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31' };
    return { from: '', to: '' };
  }

  const hasFilters = () => Object.keys(EMPTY_FILTERS).some((key) => filters[key] !== EMPTY_FILTERS[key]);

  /** Amount as shown in lists: expenses negative, income positive, transfers unsigned. */
  function displayAmount(item) {
    if (item.type === 'expense') return ns.App.money(-item.amountCents);
    return ns.App.money(item.amountCents, { signed: item.type === 'income' });
  }

  function amountCell(tx, accountId) {
    if (accountId && tx.type === 'transfer') {
      const effect = Ledger.effectOn(tx, accountId);
      return ns.App.money(effect, { signed: true });
    }
    return displayAmount(tx);
  }

  function nameOf(list, id) {
    const item = list.find((x) => x.id === id);
    return item ? item.name : '';
  }

  function categoryCell(tx, state) {
    if (tx.type === 'transfer') return el('span', { class: 'tag-plain' }, 'Transfer');
    const category = state.categories.find((c) => c.id === tx.categoryId);
    return el('span', { class: 'category-chip' }, swatch(category && category.color), category ? category.name : 'Uncategorized');
  }

  function accountText(tx, state) {
    const from = nameOf(state.accounts, tx.accountId);
    return tx.type === 'transfer' ? from + ' to ' + nameOf(state.accounts, tx.toAccountId) : from;
  }

  function dateText(iso) {
    return iso.slice(0, 4) === Dates.today().slice(0, 4) ? Dates.formatShort(iso) : Dates.format(iso);
  }

  function row(tx, state, balancesById) {
    const secondary = [tx.type === 'transfer' ? 'Transfer' : nameOf(state.categories, tx.categoryId) || 'Uncategorized', accountText(tx, state)].join(' · ');
    const isFuture = tx.date > Dates.today();
    return el('tr', { 'data-tx': tx.id },
      el('td', { class: 'cell-date' }, dateText(tx.date)),
      el('td', { class: 'cell-desc' },
        el('button', { type: 'button', class: 'row-link', onClick: () => TxForm.open(tx) },
          tx.recurringId && el('span', { class: 'row-icon', title: 'Posted by a recurring rule' }, icon('repeat', 13)),
          el('span', { class: 'row-payee' }, tx.payee),
          isFuture && el('span', { class: 'status status-muted' }, 'Upcoming')),
        tx.notes && el('div', { class: 'row-notes' }, tx.notes),
        el('div', { class: 'row-secondary' }, secondary)),
      el('td', { class: 'cell-category' }, categoryCell(tx, state)),
      el('td', { class: 'cell-account' }, accountText(tx, state)),
      el('td', { class: 'cell-amount amount amount-' + tx.type }, amountCell(tx, filters.accountId)),
      balancesById && el('td', { class: 'cell-balance' }, ns.App.money(balancesById.get(tx.id))),
      el('td', { class: 'cell-actions' },
        iconButton('edit', 'Edit ' + tx.payee, () => TxForm.open(tx)),
        iconButton('trash', 'Delete ' + tx.payee, () => TxForm.deleteTransaction(tx))));
  }

  function table(matches, state) {
    const balancesById = filters.accountId ? Ledger.runningBalances(state, filters.accountId) : null;
    const headers = [['Date', 'cell-date'], ['Description', 'cell-desc'], ['Category', 'cell-category'], ['Account', 'cell-account'], ['Amount', 'cell-amount'],
      balancesById && ['Balance', 'cell-balance'], ['Actions', 'cell-actions']].filter(Boolean);
    return el('div', { class: 'table-wrap' }, el('table', { class: 'data-table tx-table' + (balancesById ? ' has-balance' : '') },
      el('thead', null, el('tr', null, headers.map((h) => el('th', { class: h[1], scope: 'col' }, h[0] === 'Actions' ? el('span', { class: 'visually-hidden' }, h[0]) : h[0])))),
      el('tbody', null, matches.slice(0, visibleCount).map((tx) => row(tx, state, balancesById)))));
  }

  function summary(matches) {
    const { money } = ns.App;
    const flow = Ledger.totals(matches);
    const count = matches.length;
    return el('div', { class: 'results-summary', 'aria-live': 'polite', 'data-summary': '' },
      el('span', null, el('strong', null, count.toLocaleString('en-US')), count === 1 ? ' transaction' : ' transactions'),
      el('span', null, 'Income ', el('strong', null, money(flow.income))),
      el('span', null, 'Spending ', el('strong', null, money(flow.spend))),
      el('span', null, 'Net ', el('strong', null, money(flow.net, { signed: true }))));
  }

  function resetFilters() {
    filters = Object.assign({}, EMPTY_FILTERS);
    ns.App.render();
  }

  function refreshResults() {
    if (!resultsNode) return;
    const state = ns.App.state;
    const matches = Ledger.filterTransactions(state, filters);
    resultsNode.textContent = '';
    if (!matches.length) {
      resultsNode.appendChild(hasFilters()
        ? emptyState('No transactions match these filters', 'Try a wider date range or a different search.', button('Clear filters', { onClick: resetFilters }))
        : emptyState('No transactions yet', 'Add one by hand or import a statement from your bank.', button('Add transaction', { variant: 'btn-primary', icon: 'plus', onClick: () => TxForm.open() })));
      return;
    }
    resultsNode.append(summary(matches), table(matches, state));
    if (!filters.accountId) resultsNode.appendChild(el('p', { class: 'table-note' }, 'Choose one account to see its running balance.'));
    if (matches.length > visibleCount) {
      resultsNode.appendChild(el('div', { class: 'show-more' }, button('Show ' + Math.min(PAGE_SIZE, matches.length - visibleCount) + ' more', {
        onClick: () => { visibleCount += PAGE_SIZE; refreshResults(); },
      })));
    }
  }

  function update(changes) {
    Object.assign(filters, changes);
    visibleCount = PAGE_SIZE;
    refreshResults();
  }

  function dateRangeFields(presetSelect) {
    const from = el('input', { type: 'date', value: filters.from, onChange: () => { presetSelect.value = 'custom'; update({ from: from.value, preset: 'custom' }); } });
    const to = el('input', { type: 'date', value: filters.to, onChange: () => { presetSelect.value = 'custom'; update({ to: to.value, preset: 'custom' }); } });
    presetSelect.addEventListener('change', () => {
      const range = presetRange(presetSelect.value);
      if (presetSelect.value !== 'custom') { from.value = range.from; to.value = range.to; update(Object.assign({ preset: presetSelect.value }, range)); }
    });
    return [field('From', from), field('To', to)];
  }

  function categoryFilterOptions(state) {
    const options = [{ value: '', label: 'All categories' }, { value: 'none', label: 'Uncategorized' }];
    state.categories.forEach((c) => options.push({ value: c.id, label: c.name + (c.kind === 'income' ? ' (income)' : '') }));
    return options;
  }

  // Phones show search and this button; the other filters would fill the screen.
  function filterToggle(getForm) {
    const toggle = el('button', {
      type: 'button', class: 'btn filter-toggle', 'aria-expanded': String(filtersOpenOnPhone),
      onClick: () => {
        filtersOpenOnPhone = !filtersOpenOnPhone;
        getForm().classList.toggle('is-open', filtersOpenOnPhone);
        toggle.setAttribute('aria-expanded', String(filtersOpenOnPhone));
      },
    }, 'Filters');
    return toggle;
  }

  function filterBar(state) {
    const search = el('input', { type: 'search', value: filters.q, placeholder: 'Description, notes, amount', onInput: () => update({ q: search.value }) });
    const preset = select(PRESETS, filters.preset);
    const account = select([{ value: '', label: 'All accounts' }].concat(TxForm.accountOptions(state)), filters.accountId, { onChange: () => update({ accountId: account.value }) });
    const category = select(categoryFilterOptions(state), filters.categoryId, { onChange: () => update({ categoryId: category.value }) });
    const type = select([{ value: '', label: 'All types' }, { value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfers' }], filters.type, { onChange: () => update({ type: type.value }) });
    const form = el('form', { class: 'filter-bar' + (filtersOpenOnPhone ? ' is-open' : ''), role: 'search', 'aria-label': 'Filter transactions', onSubmit: (event) => event.preventDefault() },
      field('Search', search, { class: 'filter-search' }),
      filterToggle(() => form),
      field('Dates', preset),
      dateRangeFields(preset),
      field('Account', account),
      field('Category', category),
      field('Type', type),
      button('Clear filters', { variant: 'btn-quiet filter-clear', onClick: resetFilters }));
    return form;
  }

  // A deleted account or category can't stay selected as a filter.
  function dropStaleFilters(state) {
    if (filters.accountId && !state.accounts.some((a) => a.id === filters.accountId)) filters.accountId = '';
    if (filters.categoryId && filters.categoryId !== 'none' && !state.categories.some((c) => c.id === filters.categoryId)) filters.categoryId = '';
  }

  function render(container) {
    const state = ns.App.state;
    dropStaleFilters(state);
    const exportButton = button('Export CSV', {
      icon: 'download',
      onClick: () => {
        const matches = Ledger.filterTransactions(state, filters);
        Exporter.downloadCsv(state, matches);
        ns.Overlays.showToast('Exported ' + matches.length + ' transactions as CSV');
      },
    });
    resultsNode = el('div', { class: 'results' });
    container.append(
      pageHead('Transactions', null, [
        button('Import CSV', { icon: 'upload', onClick: () => ns.ImportFlow.open() }),
        exportButton,
        button('Add transaction', { variant: 'btn-primary', icon: 'plus', onClick: () => TxForm.open(null, filters.accountId ? { accountId: filters.accountId } : null) }),
      ]),
      filterBar(state),
      resultsNode);
    refreshResults();
  }

  /** Opens the list with the given filters, replacing whatever was set. */
  function showWith(partial) {
    filters = Object.assign({}, EMPTY_FILTERS, partial);
    visibleCount = PAGE_SIZE;
    ns.App.navigate('transactions');
  }

  ns.Views = ns.Views || {};
  ns.Views.transactions = { title: 'Transactions', render, showWith, displayAmount };
})();

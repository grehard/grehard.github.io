// The overview page: where the money stands and where it went in the chosen month.
(function () {
  const ns = window.Coinpath;
  const { el, button, tile, pageHead, monthStepper, emptyState } = ns.Dom;
  const { Dates, Ledger, Budgets, Recurring, Charts, TxForm } = ns;

  function card(title, action, ...content) {
    return el('section', { class: 'card', 'aria-label': title },
      el('div', { class: 'card-head' }, el('h2', null, title), action),
      content);
  }

  function linkTo(label, route) {
    return el('a', { class: 'card-link', href: '#/' + route }, label);
  }

  function netWorthChange(state, today) {
    const previous = Dates.lastOfMonth(Dates.shiftMonth(Dates.monthOf(today), -1));
    const change = Ledger.netWorth(state, today) - Ledger.netWorth(state, previous);
    return (change >= 0 ? 'Up ' : 'Down ') + ns.App.money(Math.abs(change)) + ' since ' + Dates.formatShort(previous);
  }

  function kpis(state, month) {
    const { money } = ns.App;
    const today = Dates.today();
    const flow = Ledger.totals(Ledger.inMonth(state, month));
    const budget = Budgets.report(state, month);
    const savedShare = flow.income > 0 ? Math.round((flow.net * 100) / flow.income) + '% of income kept' : 'No income this month';
    const budgetNote = budget.limit > 0
      ? (budget.remaining >= 0 ? money(budget.remaining) + ' of budget left' : money(-budget.remaining) + ' over budget')
      : 'No budgets set';
    return el('div', { class: 'tiles' },
      tile('Net worth', money(Ledger.netWorth(state, today)), netWorthChange(state, today)),
      tile('Income', money(flow.income), Dates.monthLabel(month)),
      tile('Spending', money(flow.spend), budgetNote),
      tile('Net cash flow', money(flow.net, { signed: true }), savedShare, { tone: flow.net < 0 ? 'tone-negative' : '' }));
  }

  function cashFlowCard(state, month, setMonth) {
    const legend = el('div', { class: 'chart-legend' },
      el('span', null, el('span', { class: 'swatch swatch-income' }), 'Income'),
      el('span', null, el('span', { class: 'swatch swatch-spend' }), 'Spending'));
    return card('Cash flow, 12 months', legend, Charts.cashFlow(Ledger.cashFlow(state, month, 12), {
      currency: state.currency, selected: month, onSelect: setMonth,
    }));
  }

  function openCategorySlice(row, month) {
    const range = { from: Dates.firstOfMonth(month), to: Dates.lastOfMonth(month), preset: 'custom' };
    if (row.isOther) ns.Views.transactions.showWith(Object.assign(range, { type: 'expense' }));
    else ns.Views.transactions.showWith(Object.assign(range, { type: 'expense', categoryId: row.categoryId || 'none' }));
  }

  function spendingCard(state, month) {
    const rows = Ledger.spendingByCategory(state, month);
    const body = rows.length
      ? Charts.spendingDonut(rows, { currency: state.currency, onPick: (row) => openCategorySlice(row, month) })
      : emptyState('No spending in ' + Dates.monthLabel(month), 'Expenses you add show up here by category.');
    return card('Spending by category', null, body);
  }

  function budgetCard(state, month) {
    const report = Budgets.report(state, month);
    const rows = report.rows.slice(0, 5);
    const body = rows.length
      ? el('ul', { class: 'mini-budgets' }, rows.map((row) => el('li', null,
        el('div', { class: 'mini-budget-line' },
          el('span', { class: 'truncate' }, row.name),
          el('span', { class: 'mini-budget-amount' }, ns.App.money(row.spent) + ' of ' + ns.App.money(row.limit))),
        ns.Views.budgets.progressBar(row))))
      : emptyState('No budgets yet', 'Set a monthly limit for a category to track it here.');
    return card('Budgets', linkTo('All budgets', 'budgets'), body);
  }

  function recentCard(state) {
    const rows = Ledger.chronological(state.transactions).reverse().slice(0, 6);
    const body = rows.length
      ? el('ul', { class: 'mini-list' }, rows.map((tx) => el('li', null,
        el('button', { type: 'button', class: 'mini-row', onClick: () => TxForm.open(tx) },
          el('span', { class: 'mini-main' }, el('span', { class: 'truncate' }, tx.payee), el('span', { class: 'mini-sub' }, Dates.formatShort(tx.date))),
          el('span', { class: 'amount amount-' + tx.type }, ns.Views.transactions.displayAmount(tx))))))
      : emptyState('No transactions yet', 'Add your first expense or import a statement.');
    return card('Recent', linkTo('All transactions', 'transactions'), body);
  }

  function upcomingCard(state) {
    const rows = Recurring.upcoming(state, 6);
    const body = rows.length
      ? el('ul', { class: 'mini-list' }, rows.map((rule) => el('li', { class: 'mini-row' },
        el('span', { class: 'mini-main' }, el('span', { class: 'truncate' }, rule.name), el('span', { class: 'mini-sub' }, Dates.formatShort(rule.nextDate))),
        el('span', { class: 'amount amount-' + rule.type }, ns.Views.transactions.displayAmount(rule)))))
      : emptyState('Nothing scheduled', 'Recurring rules show their next date here.');
    return card('Coming up', linkTo('All recurring', 'recurring'), body);
  }

  function render(container) {
    const state = ns.App.state;
    const month = ns.App.viewMonth;
    const setMonth = (next) => { ns.App.viewMonth = next; ns.App.render(); };
    container.append(
      pageHead('Dashboard', null, [
        monthStepper(month, setMonth),
        button('Add transaction', { variant: 'btn-primary', icon: 'plus', onClick: () => TxForm.open() }),
      ]),
      kpis(state, month),
      el('div', { class: 'grid-charts' }, cashFlowCard(state, month, setMonth), spendingCard(state, month)),
      el('div', { class: 'grid-thirds' }, budgetCard(state, month), recentCard(state), upcomingCard(state)));
  }

  ns.Views = ns.Views || {};
  ns.Views.dashboard = { title: 'Dashboard', render };
})();

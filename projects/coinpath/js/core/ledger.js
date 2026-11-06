// Pure calculations over the app state. Nothing here touches the DOM or storage.
(function () {
  const ns = window.Coinpath;
  const { Dates, Money } = ns;

  /** What a transaction does to one account's balance, in cents. Other accounts: 0. */
  function effectOn(tx, accountId) {
    if (tx.type === 'transfer') {
      if (tx.accountId === accountId) return -tx.amountCents;
      return tx.toAccountId === accountId ? tx.amountCents : 0;
    }
    if (tx.accountId !== accountId) return 0;
    return tx.type === 'income' ? tx.amountCents : -tx.amountCents;
  }

  /** Oldest first. seq breaks ties so same-day order always matches entry order. */
  function chronological(transactions) {
    return transactions.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
  }

  /** Balance per account id, counting transactions dated on or before asOf. */
  function balances(state, asOf) {
    const result = {};
    state.accounts.forEach((account) => { result[account.id] = account.openingCents; });
    state.transactions.forEach((tx) => {
      if (asOf && tx.date > asOf) return;
      if (tx.accountId in result) result[tx.accountId] += effectOn(tx, tx.accountId);
      if (tx.toAccountId && tx.toAccountId in result) result[tx.toAccountId] += effectOn(tx, tx.toAccountId);
    });
    return result;
  }

  function netWorth(state, asOf) {
    const all = balances(state, asOf);
    return Object.keys(all).reduce((sum, id) => sum + all[id], 0);
  }

  /** Map of transaction id to the account's balance immediately after that transaction. */
  function runningBalances(state, accountId) {
    const account = state.accounts.find((a) => a.id === accountId);
    const result = new Map();
    if (!account) return result;
    let balance = account.openingCents;
    chronological(state.transactions).forEach((tx) => {
      const effect = effectOn(tx, accountId);
      if (effect === 0) return;
      balance += effect;
      result.set(tx.id, balance);
    });
    return result;
  }

  /** Income and spending totals. Transfers move money between accounts and count as neither. */
  function totals(transactions) {
    let income = 0;
    let spend = 0;
    transactions.forEach((tx) => {
      if (tx.type === 'income') income += tx.amountCents;
      else if (tx.type === 'expense') spend += tx.amountCents;
    });
    return { income, spend, net: income - spend };
  }

  function inMonth(state, month) {
    return state.transactions.filter((tx) => Dates.monthOf(tx.date) === month);
  }

  function spendingByCategory(state, month) {
    const byId = new Map();
    inMonth(state, month).forEach((tx) => {
      if (tx.type !== 'expense') return;
      byId.set(tx.categoryId, (byId.get(tx.categoryId) || 0) + tx.amountCents);
    });
    return Array.from(byId, ([categoryId, cents]) => {
      const category = state.categories.find((c) => c.id === categoryId);
      return { categoryId, name: category ? category.name : 'Uncategorized', color: category ? category.color : null, cents };
    }).sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  }

  /** count months ending at endMonth, oldest first, each with income, spend and net. */
  function cashFlow(state, endMonth, count) {
    const byMonth = new Map();
    state.transactions.forEach((tx) => {
      const month = Dates.monthOf(tx.date);
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month).push(tx);
    });
    const series = [];
    for (let i = count - 1; i >= 0; i -= 1) {
      const month = Dates.shiftMonth(endMonth, -i);
      series.push(Object.assign({ month }, totals(byMonth.get(month) || [])));
    }
    return series;
  }

  function matchesSearch(tx, query, state) {
    const nameOf = (list, id) => { const item = list.find((x) => x.id === id); return item ? item.name : ''; };
    const haystack = [tx.payee, tx.notes, nameOf(state.categories, tx.categoryId), nameOf(state.accounts, tx.accountId),
      nameOf(state.accounts, tx.toAccountId), Money.toDecimal(tx.amountCents)].join(' ').toLowerCase();
    return query.split(/\s+/).every((word) => haystack.includes(word));
  }

  function matchesCategory(tx, categoryId) {
    if (categoryId === 'none') return tx.type !== 'transfer' && !tx.categoryId;
    return tx.categoryId === categoryId;
  }

  /** Applies the transaction list filters and returns matches newest first. */
  function filterTransactions(state, filters) {
    const query = (filters.q || '').trim().toLowerCase();
    const matches = state.transactions.filter((tx) => {
      if (filters.from && tx.date < filters.from) return false;
      if (filters.to && tx.date > filters.to) return false;
      if (filters.accountId && tx.accountId !== filters.accountId && tx.toAccountId !== filters.accountId) return false;
      if (filters.categoryId && !matchesCategory(tx, filters.categoryId)) return false;
      if (filters.type && tx.type !== filters.type) return false;
      return !query || matchesSearch(tx, query, state);
    });
    return chronological(matches).reverse();
  }

  ns.Ledger = { effectOn, chronological, balances, netWorth, runningBalances, totals, inMonth, spendingByCategory, cashFlow, filterTransactions };
})();

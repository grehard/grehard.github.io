// A budget is a list of limit changes per category, each effective from a month
// until the next change, so editing a limit today leaves past months as they were.
(function () {
  const ns = window.Coinpath;
  const NEAR_PERCENT = 85;

  function limitFor(state, categoryId, month) {
    let best = null;
    state.budgets.forEach((entry) => {
      if (entry.categoryId !== categoryId || entry.fromMonth > month) return;
      if (!best || entry.fromMonth > best.fromMonth) best = entry;
    });
    return best ? best.limitCents : 0;
  }

  /** Sets the limit from month onward. A limit of 0 removes the budget from that month on. */
  function setLimit(state, categoryId, month, limitCents) {
    state.budgets = state.budgets.filter((e) => !(e.categoryId === categoryId && e.fromMonth >= month));
    if (limitCents > 0 || limitFor(state, categoryId, month) > 0) {
      state.budgets.push({ categoryId, fromMonth: month, limitCents });
    }
  }

  function rowState(spent, limit) {
    if (spent > limit) return 'over';
    return spent * 100 >= limit * NEAR_PERCENT ? 'near' : 'ok';
  }

  /** Budget progress for a month, with totals across budgeted categories. */
  function report(state, month) {
    const spending = new Map(ns.Ledger.spendingByCategory(state, month).map((row) => [row.categoryId, row.cents]));
    const rows = [];
    state.categories.forEach((category) => {
      const limit = limitFor(state, category.id, month);
      if (category.kind !== 'expense' || limit <= 0) return;
      const spent = spending.get(category.id) || 0;
      spending.delete(category.id);
      rows.push({
        categoryId: category.id, name: category.name, color: category.color, limit, spent,
        remaining: limit - spent, percent: Math.floor((spent * 100) / limit), state: rowState(spent, limit),
      });
    });
    rows.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
    const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
    let unbudgeted = 0;
    spending.forEach((cents) => { unbudgeted += cents; });
    return {
      rows, unbudgeted, limit: sum('limit'), spent: sum('spent'), remaining: sum('remaining'),
      overCount: rows.filter((row) => row.state === 'over').length,
    };
  }

  ns.Budgets = { limitFor, setLimit, report };
})();

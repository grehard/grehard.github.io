// Recurring rules hold the date of their next occurrence. Posting walks that date
// forward, so each period posts exactly once however long the app went unopened.
(function () {
  const ns = window.Coinpath;
  const { Dates } = ns;

  // A safety stop for corrupt or hand-edited data. Any remainder posts on the next load.
  const MAX_POSTS_PER_RUN = 600;

  /**
   * The occurrence after date. Monthly rules step from anchorDay rather than from
   * the previous date, so a rule on the 31st returns to the 31st after February.
   */
  function nextOccurrence(rule, date) {
    if (rule.frequency === 'weekly') return Dates.addDays(date, 7);
    return Dates.dayInMonth(Dates.shiftMonth(Dates.monthOf(date), 1), rule.anchorDay);
  }

  function status(rule) {
    if (rule.paused) return 'paused';
    return rule.endDate && rule.nextDate > rule.endDate ? 'ended' : 'active';
  }

  function makeTransaction(rule, date, state) {
    const tx = {
      id: ns.Store.newId('t'), seq: state.nextSeq, type: rule.type, date, amountCents: rule.amountCents,
      accountId: rule.accountId, toAccountId: rule.toAccountId, categoryId: rule.categoryId,
      payee: rule.name, notes: rule.notes, recurringId: rule.id,
    };
    state.nextSeq += 1;
    return tx;
  }

  /** Posts every occurrence due on or before today across all active rules. Returns what was posted. */
  function postDue(state, today) {
    const posted = [];
    state.recurring.forEach((rule) => {
      let count = 0;
      while (status(rule) === 'active' && rule.nextDate <= today && count < MAX_POSTS_PER_RUN) {
        const tx = makeTransaction(rule, rule.nextDate, state);
        state.transactions.push(tx);
        posted.push(tx);
        rule.postedCount += 1;
        rule.nextDate = nextOccurrence(rule, rule.nextDate);
        count += 1;
      }
    });
    return posted;
  }

  /** Resuming skips the paused periods: pausing means those payments were not wanted. */
  function resume(rule, today) {
    rule.paused = false;
    while (rule.nextDate < today) rule.nextDate = nextOccurrence(rule, rule.nextDate);
  }

  function describeSchedule(rule) {
    if (rule.frequency === 'weekly') return 'Weekly on ' + Dates.weekdayName(rule.nextDate);
    return 'Monthly on the ' + Dates.ordinal(rule.anchorDay);
  }

  /** Average monthly value of a rule, using 52 weeks over 12 months for weekly rules. */
  function monthlyEquivalent(rule) {
    return rule.frequency === 'weekly' ? Math.round((rule.amountCents * 52) / 12) : rule.amountCents;
  }

  /** Average monthly income and spending from active rules. Transfers count as neither. */
  function commitments(state) {
    const result = { income: 0, spend: 0 };
    state.recurring.forEach((rule) => {
      if (status(rule) !== 'active') return;
      if (rule.type === 'income') result.income += monthlyEquivalent(rule);
      if (rule.type === 'expense') result.spend += monthlyEquivalent(rule);
    });
    return result;
  }

  function upcoming(state, limit) {
    return state.recurring.filter((rule) => status(rule) === 'active')
      .sort((a, b) => (a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0))
      .slice(0, limit);
  }

  ns.Recurring = { nextOccurrence, status, postDue, resume, describeSchedule, monthlyEquivalent, commitments, upcoming };
})();

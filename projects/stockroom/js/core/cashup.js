// End-of-day cash count: what the drawer should hold, compared with what was counted.
SR.cashup = (function () {
  const { dateKey } = SR.util;
  const DENOMINATIONS = [
    { cents: 10000, label: '$100' }, { cents: 5000, label: '$50' }, { cents: 2000, label: '$20' }, { cents: 1000, label: '$10' },
    { cents: 500, label: '$5' }, { cents: 100, label: '$1' }, { cents: 25, label: '25c' }, { cents: 10, label: '10c' },
    { cents: 5, label: '5c' }, { cents: 1, label: '1c' },
  ];

  /** Takings for a day. Using the sale total means change given is already netted out of cash. */
  function daySummary(state, key) {
    const summary = { saleCount: 0, cashSalesCents: 0, cardSalesCents: 0, cashRefundsCents: 0, cardRefundsCents: 0 };
    for (const sale of state.sales) {
      if (dateKey(sale.at) !== key) continue;
      summary.saleCount += 1;
      if (sale.payment.method === 'cash') summary.cashSalesCents += sale.totalCents;
      else summary.cardSalesCents += sale.totalCents;
    }
    for (const refund of state.refunds) {
      if (dateKey(refund.at) !== key) continue;
      if (refund.method === 'cash') summary.cashRefundsCents += refund.totalCents;
      else summary.cardRefundsCents += refund.totalCents;
    }
    return summary;
  }

  const expectedCash = (floatCents, summary) => floatCents + summary.cashSalesCents - summary.cashRefundsCents;

  const countedFrom = (counts) => DENOMINATIONS.reduce((total, d) => total + d.cents * (counts[d.cents] || 0), 0);

  /** Greedy breakdown into notes and coins. Gives seeded counts a plausible drawer. */
  function breakdown(cents) {
    const counts = {};
    let left = cents;
    for (const d of DENOMINATIONS) {
      const n = Math.floor(left / d.cents);
      if (n) counts[d.cents] = n;
      left -= n * d.cents;
    }
    return counts;
  }

  /** Saves the count for a day, replacing any earlier count. Returns the record it replaced. */
  function saveClose(state, { date, floatCents, counts, note = '', at = Date.now() }) {
    const summary = daySummary(state, date);
    const expectedCents = expectedCash(floatCents, summary);
    const countedCents = countedFrom(counts);
    const record = { date, floatCents, counts: { ...counts }, note: note.trim(), at, expectedCents, countedCents, overShortCents: countedCents - expectedCents, ...summary };
    const existing = state.closes.findIndex((c) => c.date === date);
    const replaced = existing >= 0 ? state.closes[existing] : null;
    if (existing >= 0) state.closes[existing] = record;
    else state.closes.push(record);
    state.closes.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { record, replaced };
  }

  return { DENOMINATIONS, daySummary, expectedCash, countedFrom, breakdown, saveClose };
})();

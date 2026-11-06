// Sales reporting. Refunds count on the day they happen, so past days never change when a
// customer brings something back later. Revenue is net of discounts and excludes tax.
// Cost of goods uses the unit cost captured on each sale line at the moment it was sold.
SR.reports = (function () {
  const { dateKey, addDays } = SR.util;

  const blank = () => ({ revenueCents: 0, cogsCents: 0, taxCents: 0, units: 0, saleCount: 0, refundCents: 0 });

  function addRow(target, revenue, cogs, tax, units) {
    target.revenueCents += revenue;
    target.cogsCents += cogs;
    target.taxCents += tax;
    target.units += units;
  }

  function bucket(map, key, make) {
    if (!map.has(key)) map.set(key, { ...blank(), ...make() });
    return map.get(key);
  }

  function finish(row) {
    row.grossCents = row.revenueCents - row.cogsCents;
    return row;
  }

  /** Aggregates sales and refunds in an inclusive date-key range. */
  function build(state, fromKey, toKey) {
    const totals = blank();
    const days = new Map();
    for (let key = fromKey; key <= toKey; key = addDays(key, 1)) days.set(key, { date: key, ...blank() });
    const products = new Map();
    const categories = new Map();
    const inRange = (at) => {
      const key = dateKey(at);
      return key >= fromKey && key <= toKey ? key : null;
    };
    const apply = (day, line, revenue, cogs, tax, units) => {
      addRow(day, revenue, cogs, tax, units);
      addRow(totals, revenue, cogs, tax, units);
      addRow(bucket(products, line.productId, () => ({ productId: line.productId, name: line.name, category: line.category })), revenue, cogs, tax, units);
      addRow(bucket(categories, line.category, () => ({ name: line.category })), revenue, cogs, tax, units);
    };

    for (const sale of state.sales) {
      const key = inRange(sale.at);
      if (!key) continue;
      const day = days.get(key);
      day.saleCount += 1;
      totals.saleCount += 1;
      for (const line of sale.lines) apply(day, line, line.netCents, line.unitCostCents * line.qty, line.taxCents, line.qty);
    }
    for (const refund of state.refunds) {
      const key = inRange(refund.at);
      if (!key) continue;
      const day = days.get(key);
      day.refundCents += refund.totalCents;
      totals.refundCents += refund.totalCents;
      for (const line of refund.lines) apply(day, line, -line.netCents, -line.costReversedCents, -line.taxCents, -line.qty);
    }

    const byRevenue = (a, b) => b.revenueCents - a.revenueCents || a.name.localeCompare(b.name);
    finish(totals);
    return {
      fromKey,
      toKey,
      totals,
      days: [...days.values()].map(finish),
      products: [...products.values()].map(finish).sort(byRevenue),
      categories: [...categories.values()].map(finish).sort(byRevenue),
    };
  }

  function earliestKey(state, fallback) {
    let earliest = null;
    for (const sale of state.sales) if (earliest === null || sale.at < earliest) earliest = sale.at;
    return earliest === null ? fallback : dateKey(earliest);
  }

  return { build, earliestKey };
})();

// Cart arithmetic. Order of operations:
//   1. line gross = unit price x quantity
//   2. line discount comes off the line (percent rounds half up, amount is capped at the line)
//   3. order discount is taken from the sum and allocated to lines by largest remainder
//   4. tax is computed once on the discounted taxable total, then allocated to taxable lines
// Allocating to lines keeps partial refunds exact: line nets and taxes always sum to the order.
SR.pricing = (function () {
  const { mulDiv, allocate } = SR.money;

  function discountAmount(base, discount) {
    if (!discount || !discount.value) return 0;
    const raw = discount.type === 'percent' ? mulDiv(base, discount.value, 10000) : discount.value;
    return Math.min(base, raw);
  }

  function computeCart(cart, taxRateBp) {
    const rows = cart.lines.map((line) => {
      const grossCents = line.unitPriceCents * line.qty;
      const lineDiscountCents = discountAmount(grossCents, line.discount);
      return { grossCents, lineDiscountCents, afterLineCents: grossCents - lineDiscountCents, taxable: !!line.taxable };
    });
    const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
    const afterLineCents = sum('afterLineCents');
    const orderDiscountCents = discountAmount(afterLineCents, cart.orderDiscount);
    const orderShares = allocate(orderDiscountCents, rows.map((r) => r.afterLineCents));
    rows.forEach((row, i) => {
      row.orderDiscountCents = orderShares[i];
      row.netCents = row.afterLineCents - orderShares[i];
    });
    const taxableCents = rows.reduce((a, r) => a + (r.taxable ? r.netCents : 0), 0);
    const taxCents = mulDiv(taxableCents, taxRateBp, 10000);
    const taxShares = allocate(taxCents, rows.map((r) => (r.taxable ? r.netCents : 0)));
    rows.forEach((row, i) => { row.taxCents = taxShares[i]; });
    const subtotalCents = sum('grossCents');
    const lineDiscountCents = sum('lineDiscountCents');
    const netCents = afterLineCents - orderDiscountCents;
    return {
      lines: rows,
      subtotalCents,
      lineDiscountCents,
      orderDiscountCents,
      netCents,
      taxableCents,
      taxCents,
      totalCents: netCents + taxCents,
    };
  }

  /**
   * The part of a line's total owed back when k more of its qty units are returned.
   * Differencing the cumulative share means repeated partial refunds telescope to the
   * exact original total, with no cents lost or created along the way.
   */
  function refundShare(lineTotal, qty, alreadyReturned, k) {
    return mulDiv(lineTotal, alreadyReturned + k, qty) - mulDiv(lineTotal, alreadyReturned, qty);
  }

  /** Quick-tender amounts for the cash screen: the next round bills above the total. */
  function quickTenders(totalCents) {
    const options = [];
    for (const step of [100, 500, 1000, 2000, 5000, 10000]) {
      const value = Math.ceil((totalCents + 1) / step) * step;
      if (!options.includes(value)) options.push(value);
    }
    return options.slice(0, 5);
  }

  return { discountAmount, computeCart, refundShare, quickTenders };
})();

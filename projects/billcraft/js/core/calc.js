// Pure billing logic with no DOM or storage access, so every rule can be read and checked in one place.
(function () {
  const { mulDivRound } = window.BC.money;
  const { daysBetween, monthKey, recentMonths } = window.BC.dates;

  const sum = (values) => values.reduce((total, v) => total + v, 0);
  const lineNet = (line) => mulDivRound(line.qtyMilli, line.unitCents, 1000);

  function discountAmount(subtotal, discount) {
    if (!discount || discount.type === 'none') return 0;
    if (discount.type === 'percent') return mulDivRound(subtotal, Math.min(discount.value, 10000), 10000);
    return Math.min(discount.value, subtotal);
  }

  // Splits `amount` across weights so the parts always add up to it exactly (largest remainder method).
  function allocate(amount, weights) {
    const total = sum(weights);
    if (!total) return weights.map(() => 0);
    const shares = weights.map((weight, index) => {
      const scaled = BigInt(amount) * BigInt(weight);
      return { index, floor: Number(scaled / BigInt(total)), remainder: scaled % BigInt(total) };
    });
    let leftover = amount - sum(shares.map((share) => share.floor));
    const byRemainder = shares.slice().sort((a, b) => {
      if (a.remainder === b.remainder) return a.index - b.index;
      return a.remainder > b.remainder ? -1 : 1;
    });
    byRemainder.forEach((share) => {
      if (leftover > 0) { share.floor += 1; leftover -= 1; }
    });
    return shares.map((share) => share.floor);
  }

  // The discount comes off before tax and is shared across lines in proportion to their value.
  // Tax is then rounded once per rate, so each row of the tax summary is exactly rate x base.
  function totals(doc) {
    const nets = doc.lines.map(lineNet);
    const subtotal = sum(nets);
    const discount = discountAmount(subtotal, doc.discount);
    const shares = allocate(discount, nets);
    const baseByRate = new Map();
    doc.lines.forEach((line, i) => {
      baseByRate.set(line.taxBp, (baseByRate.get(line.taxBp) || 0) + nets[i] - shares[i]);
    });
    const taxes = Array.from(baseByRate.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([rateBp, base]) => ({ rateBp, base, tax: mulDivRound(base, rateBp, 10000) }));
    const tax = sum(taxes.map((row) => row.tax));
    return { nets, subtotal, discount, net: subtotal - discount, taxes, tax, total: subtotal - discount + tax };
  }

  const paidAmount = (invoice) => sum(invoice.payments.map((payment) => payment.amountCents));

  // Overdue outranks partially paid: an unpaid balance past its due date is the thing to act on.
  // The due date itself still counts as on time.
  function invoiceStatus(invoice, today) {
    if (invoice.status === 'draft') return 'draft';
    const balance = totals(invoice).total - paidAmount(invoice);
    if (balance <= 0) return 'paid';
    if (daysBetween(invoice.dueDate, today) > 0) return 'overdue';
    return invoice.payments.length ? 'partial' : 'sent';
  }

  function quoteStatus(quote, today) {
    if (quote.status === 'sent' && daysBetween(quote.dueDate, today) > 0) return 'expired';
    return quote.status;
  }

  function summarize(invoice, today) {
    const t = totals(invoice);
    const paid = paidAmount(invoice);
    const status = invoiceStatus(invoice, today);
    return {
      totals: t,
      paid,
      status,
      balance: Math.max(0, t.total - paid),
      daysLate: Math.max(0, daysBetween(invoice.dueDate, today)),
    };
  }

  const AGE_BUCKETS = [
    { key: 'current', label: 'Not yet due', from: -Infinity, to: 0 },
    { key: 'd30', label: '1 to 30 days', from: 1, to: 30 },
    { key: 'd60', label: '31 to 60 days', from: 31, to: 60 },
    { key: 'd90', label: '61 to 90 days', from: 61, to: 90 },
    { key: 'older', label: 'Over 90 days', from: 91, to: Infinity },
  ];

  // Unpaid balances grouped by how many days past due they are today.
  function agedReceivables(invoices, today) {
    const buckets = AGE_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, amount: 0, count: 0 }));
    invoices.forEach((invoice) => {
      if (invoice.status === 'draft') return;
      const balance = totals(invoice).total - paidAmount(invoice);
      if (balance <= 0) return;
      const late = daysBetween(invoice.dueDate, today);
      const index = AGE_BUCKETS.findIndex((bucket) => late >= bucket.from && late <= bucket.to);
      buckets[index].amount += balance;
      buckets[index].count += 1;
    });
    return buckets;
  }

  function dashboard(invoices, today) {
    const month = monthKey(today);
    const result = { outstanding: 0, outstandingCount: 0, overdue: 0, overdueCount: 0, paidThisMonth: 0, paidThisMonthCount: 0 };
    invoices.forEach((invoice) => {
      if (invoice.status === 'draft') return;
      const { balance, status } = summarize(invoice, today);
      if (balance > 0) { result.outstanding += balance; result.outstandingCount += 1; }
      if (status === 'overdue') { result.overdue += balance; result.overdueCount += 1; }
      invoice.payments.forEach((payment) => {
        if (monthKey(payment.date) === month) {
          result.paidThisMonth += payment.amountCents;
          result.paidThisMonthCount += 1;
        }
      });
    });
    return result;
  }

  function paidByMonth(invoices, today, count) {
    const months = recentMonths(today, count).map((key) => ({ key, amount: 0 }));
    invoices.forEach((invoice) => {
      if (invoice.status === 'draft') return;
      invoice.payments.forEach((payment) => {
        const month = months.find((m) => m.key === monthKey(payment.date));
        if (month) month.amount += payment.amountCents;
      });
    });
    return months;
  }

  function statementEntries(invoices) {
    const entries = [];
    invoices.forEach((invoice) => {
      if (invoice.status === 'draft') return;
      entries.push({ date: invoice.issueDate, order: 0, ref: invoice.number, description: 'Invoice', charge: totals(invoice).total, credit: 0, invoiceId: invoice.id });
      invoice.payments.forEach((payment) => {
        const method = payment.method ? `, ${payment.method.toLowerCase()}` : '';
        entries.push({ date: payment.date, order: 1, ref: invoice.number, description: `Payment${method}`, charge: 0, credit: payment.amountCents, invoiceId: invoice.id });
      });
    });
    return entries.sort((a, b) => {
      if (a.date === b.date) return a.order - b.order;
      return a.date < b.date ? -1 : 1;
    });
  }

  // Charges fall on the issue date and credits on the payment date. Everything before `from`
  // rolls into the opening balance, so opening + charges - credits always equals closing.
  function statement(invoices, from, to) {
    let balance = 0;
    let opening = 0;
    const rows = [];
    statementEntries(invoices).forEach((entry) => {
      if (to && entry.date > to) return;
      balance += entry.charge - entry.credit;
      if (from && entry.date < from) opening = balance;
      else rows.push({ ...entry, balance });
    });
    return {
      opening,
      rows,
      closing: balance,
      charges: sum(rows.map((row) => row.charge)),
      credits: sum(rows.map((row) => row.credit)),
    };
  }

  const formatNumber = (prefix, seq) => `${prefix}${String(seq).padStart(4, '0')}`;

  // The counter never falls behind a number already in use, even after an import or a manual edit.
  function nextSequence(counter, docs) {
    return Math.max(counter, 1, ...docs.map((doc) => doc.seq + 1));
  }

  window.BC.calc = {
    lineNet, discountAmount, allocate, totals, paidAmount, invoiceStatus, quoteStatus, summarize,
    agedReceivables, dashboard, paidByMonth, statement, formatNumber, nextSequence, AGE_BUCKETS,
  };
})();

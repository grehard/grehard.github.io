// The thermal-style receipt. The same node layout shows on screen in a modal and prints from
// #print-root, where css/print.css hides the rest of the app and sets an 80mm page.
SR.receipt = (function () {
  const { h, clear } = SR.ui;
  const { format, formatPercent } = SR.money;

  const row = (left, right, cls) => h('div', { class: `rc-row${cls ? ` ${cls}` : ''}` }, h('span', null, left), h('span', null, right));

  function discountLabel(discount) {
    if (!discount) return '';
    return discount.type === 'percent' ? `${formatPercent(discount.value)} off` : 'amount off';
  }

  function lineBlock(line) {
    const gross = line.unitPriceCents * line.qty;
    return h('div', { class: 'rc-line' },
      h('div', { class: 'rc-name' }, SR.catalog.lineName(line)),
      row(`${line.qty} x ${format(line.unitPriceCents)}${line.taxable ? '' : ' (no tax)'}`, format(gross)),
      line.lineDiscountCents ? row(`Line discount, ${discountLabel(line.discount)}`, format(-line.lineDiscountCents)) : null,
      h('div', { class: 'rc-sku' }, line.sku));
  }

  function paymentBlock(sale) {
    const { payment } = sale;
    if (payment.method === 'cash') {
      return [row('Paid by cash', format(payment.tenderedCents)), row('Change due', format(payment.changeCents), 'rc-strong')];
    }
    return [row('Paid by card', format(sale.totalCents)), h('div', { class: 'rc-note' }, 'Card recorded as a label only. No payment was processed by this system.')];
  }

  function refundBlock(refund) {
    return h('div', { class: 'rc-refund' },
      h('div', { class: 'rc-rule' }),
      row(`Refund ${refund.number}`, SR.util.formatDate(refund.at), 'rc-strong'),
      refund.lines.map((line) => row(`${line.qty} x ${SR.catalog.lineName(line)}${line.restock ? '' : ' (not restocked)'}`, format(-(line.netCents + line.taxCents)))),
      refund.reason ? h('div', { class: 'rc-note' }, refund.reason) : null,
      row(`Refunded by ${refund.method}`, format(-refund.totalCents), 'rc-strong'));
  }

  function build(state, sale) {
    const { settings } = state;
    const refunds = SR.sales.refundsFor(state, sale.id);
    return h('div', { class: 'receipt', dataset: { testid: 'receipt' } },
      h('div', { class: 'rc-shop' }, settings.shopName),
      settings.address ? h('div', { class: 'rc-center' }, settings.address) : null,
      settings.phone ? h('div', { class: 'rc-center' }, settings.phone) : null,
      h('div', { class: 'rc-rule' }),
      row(sale.number, SR.util.formatDateTime(sale.at)),
      h('div', { class: 'rc-rule' }),
      sale.lines.map(lineBlock),
      h('div', { class: 'rc-rule' }),
      row('Subtotal', format(sale.subtotalCents)),
      sale.lineDiscountCents ? row('Line discounts', format(-sale.lineDiscountCents)) : null,
      sale.orderDiscountCents ? row(`Order discount${sale.orderDiscount ? `, ${discountLabel(sale.orderDiscount)}` : ''}`, format(-sale.orderDiscountCents)) : null,
      row(`Tax ${formatPercent(sale.taxRateBp)}`, format(sale.taxCents)),
      row('Total', format(sale.totalCents), 'rc-total'),
      h('div', { class: 'rc-rule' }),
      paymentBlock(sale),
      refunds.map(refundBlock),
      h('div', { class: 'rc-rule' }),
      settings.receiptFooter ? h('div', { class: 'rc-center' }, settings.receiptFooter) : null);
  }

  /** Loads a sale into the print-only area. window.print() then has something to print. */
  function prepare(state, sale) {
    const root = clear(document.getElementById('print-root'));
    root.appendChild(build(state, sale));
  }

  function print(state, sale) {
    prepare(state, sale);
    window.print();
  }

  return { build, prepare, print };
})();

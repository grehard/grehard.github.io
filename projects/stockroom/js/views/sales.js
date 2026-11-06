// Sales history: find a sale, read its receipt, refund or return against it.
SR.views.sales = (function () {
  const { h, btn, clear, field, input, select, openModal, pageHeader, pill, dataTable, emptyState, download, toast, cellInput } = SR.ui;
  const { format } = SR.money;
  const { parseWhole } = SR.util;

  const filters = { query: '', from: '', to: '', status: 'all' };
  let list = null;
  const state = () => SR.store.state;

  function matches(sale) {
    if (filters.from && SR.util.dateKey(sale.at) < filters.from) return false;
    if (filters.to && SR.util.dateKey(sale.at) > filters.to) return false;
    if (filters.status === 'cash' && sale.payment.method !== 'cash') return false;
    if (filters.status === 'card' && sale.payment.method !== 'card') return false;
    if (filters.status === 'refunded' && SR.sales.refundStatus(sale) === 'none') return false;
    if (filters.query) {
      const hay = `${sale.number} ${sale.lines.map((l) => `${l.name} ${l.variant} ${l.sku}`).join(' ')}`.toLowerCase();
      if (!filters.query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t))) return false;
    }
    return true;
  }

  function statusPill(sale) {
    const status = SR.sales.refundStatus(sale);
    if (status === 'full') return pill('Refunded', 'bad');
    if (status === 'partial') return pill('Part refunded', 'warn');
    return null;
  }

  function paint() {
    if (!list) return;
    clear(list);
    const rows = state().sales.filter(matches).reverse();
    const totalCents = rows.reduce((a, s) => a + s.totalCents, 0);
    list.appendChild(h('p', { class: 'list-summary', role: 'status' }, `${SR.util.formatInt(rows.length)} sales, ${format(totalCents)} taken including tax`));
    list.appendChild(dataTable({
      caption: 'Sales',
      rows,
      pageSize: 50,
      empty: emptyState('No sales match these filters', 'Clear the search or widen the dates.'),
      columns: [
        { label: 'Sale', render: (s) => h('button', { type: 'button', class: 'link', onClick: () => openSale(s) }, s.number) },
        { label: 'Date', render: (s) => SR.util.formatDateTime(s.at) },
        { label: 'Items', render: (s) => h('span', { class: 'cell-clip' }, s.lines.map((l) => SR.catalog.lineName(l)).join('; ')) },
        { label: 'Paid by', render: (s) => (s.payment.method === 'cash' ? 'Cash' : 'Card') },
        { label: 'Status', render: statusPill },
        { label: 'Discount', align: 'right', render: (s) => (s.lineDiscountCents + s.orderDiscountCents ? format(-(s.lineDiscountCents + s.orderDiscountCents)) : '') },
        { label: 'Tax', align: 'right', render: (s) => format(s.taxCents) },
        { label: 'Total', align: 'right', render: (s) => h('strong', null, format(s.totalCents)) },
      ],
    }));
  }

  function openSale(sale) {
    SR.receipt.prepare(state(), sale);
    const canRefund = sale.lines.some((l) => l.returnedQty < l.qty);
    const modal = openModal({
      title: `Sale ${sale.number}`,
      size: 'receipt',
      body: h('div', { class: 'receipt-paper' }, SR.receipt.build(state(), sale)),
      footer: [
        btn('Print receipt', { iconName: 'print', onClick: () => SR.receipt.print(state(), sale) }),
        canRefund ? btn('Refund or return', { kind: 'primary', onClick: () => { modal.close(); refundModal(sale); } }) : null,
      ].filter(Boolean),
    });
  }

  function refundRow(sale, line, lineIndex, onChange) {
    const remaining = line.qty - line.returnedQty;
    const qty = cellInput({ inputmode: 'numeric', value: '0', 'aria-label': `Return quantity for ${SR.catalog.lineName(line)}`, disabled: remaining === 0, onInput: onChange });
    const restock = h('input', { type: 'checkbox', checked: true, disabled: remaining === 0, 'aria-label': `Return ${SR.catalog.lineName(line)} to stock`, onChange });
    const cells = h('tr', null,
      h('td', null, h('div', null, SR.catalog.lineName(line)), h('div', { class: 'muted' }, `${line.sku}, sold ${line.qty}${line.returnedQty ? `, ${line.returnedQty} already returned` : ''}`)),
      h('td', { class: 'num' }, format(line.netCents + line.taxCents)),
      h('td', null, qty),
      h('td', { class: 'cell-center' }, restock));
    return { cells, read: () => ({ lineIndex, qty: qty.input.value.trim() === '' ? 0 : parseWhole(qty.input.value), restock: restock.checked }), qty };
  }

  /** Works through a whole sale or any part of it; each line can go back on the shelf or not. */
  function refundModal(sale) {
    const summary = h('div', { class: 'modal-sum', dataset: { testid: 'refund-summary' } });
    const problem = h('div', { class: 'field-error', role: 'alert', hidden: true });
    const rows = sale.lines.map((line, i) => refundRow(sale, line, i, () => preview()));
    const method = select([{ value: 'cash', label: 'Cash from the drawer' }, { value: 'card', label: 'Card, recorded only' }], sale.payment.method);
    const reason = select(['Customer return', 'Wrong size', 'Changed mind', 'Damaged', 'Price adjustment', 'Other'].map((r) => ({ value: r, label: r })), 'Customer return');

    const readAll = () => rows.map((r) => r.read()).map((r) => (r.qty === null ? { ...r, qty: -1 } : r));

    function preview() {
      clear(summary);
      const result = SR.sales.previewRefund(sale, readAll());
      problem.hidden = true;
      if (result.lines.length && !result.errors.length) {
        summary.append('Refund ', h('strong', { dataset: { testid: 'refund-total' } }, format(result.totalCents)), ` (${format(result.netCents)} plus ${format(result.taxCents)} tax)`);
      } else {
        summary.textContent = 'Enter how many of each item came back.';
      }
    }

    function fillAll() {
      rows.forEach((row, i) => {
        const line = sale.lines[i];
        row.qty.input.value = String(line.qty - line.returnedQty);
      });
      preview();
    }

    function submit() {
      const result = SR.sales.previewRefund(sale, readAll());
      if (result.errors.length) {
        problem.textContent = result.errors[0];
        problem.hidden = false;
        return;
      }
      const record = SR.sales.refund(state(), sale.id, { lines: readAll(), method: method.value, reason: reason.value });
      modal.close();
      SR.app.commit();
      toast(`Refund ${record.number} recorded: ${format(record.totalCents)}`);
      openSale(sale);
    }

    const modal = openModal({
      title: `Refund or return: ${sale.number}`,
      size: 'lg',
      body: h('div', { class: 'stack' },
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', { class: 'num' }, 'Paid'), h('th', null, 'Return'), h('th', null, 'To stock'))),
          h('tbody', null, rows.map((r) => r.cells)))),
        btn('Return everything left', { size: 'sm', onClick: fillAll }),
        h('div', { class: 'form-grid' }, field('Refund method', method), field('Reason', reason)),
        summary, problem),
      footer: [btn('Cancel', { onClick: () => modal.close() }), btn('Record refund', { kind: 'primary', onClick: submit })],
    });
    preview();
  }

  function mount(root) {
    const search = input({ type: 'search', placeholder: 'Sale number, product or SKU', value: filters.query, 'aria-label': 'Search sales', onInput: (e) => { filters.query = e.target.value; debounced(); } });
    const debounced = SR.util.debounce(paint, 120);
    const from = input({ type: 'date', value: filters.from, onChange: (e) => { filters.from = e.target.value; paint(); } });
    const to = input({ type: 'date', value: filters.to, onChange: (e) => { filters.to = e.target.value; paint(); } });
    const status = select([
      { value: 'all', label: 'All sales' }, { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }, { value: 'refunded', label: 'With refunds' },
    ], filters.status, { onChange: (e) => { filters.status = e.target.value; paint(); } });
    list = h('div', { class: 'list' });
    root.append(
      pageHeader('Sales', 'Every completed sale. Open one to read its receipt or refund it.',
        btn('Export sales CSV', { iconName: 'download', onClick: () => download('stockroom-sales.csv', SR.csv.sales(state()), 'text/csv') })),
      h('div', { class: 'toolbar' },
        field('Search', search, { class: 'grow' }), field('From', from), field('To', to), field('Show', status)),
      list);
    paint();
  }

  return { mount, unmount: () => { list = null; }, refresh: paint };
})();

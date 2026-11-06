// Builds export files and hands them to the browser as Blob downloads.
(function () {
  const BC = window.BC;
  const { calc, csv, dates, money, store } = BC;

  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = BC.dom.h('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const amount = money.centsToText;
  const stamp = () => dates.today();
  const statusLabel = (status) => BC.ui.STATUS_LABEL[status] || status;

  function downloadCsv(name, header, rows) {
    download(`billcraft-${name}-${stamp()}.csv`, csv.build(header, rows), 'text/csv;charset=utf-8');
  }

  function invoices(list) {
    const today = dates.today();
    const docs = list || store.state.invoices;
    const rows = docs.map((doc) => {
      const info = calc.summarize(doc, today);
      return [doc.number, store.clientName(doc.clientId), doc.issueDate, doc.dueDate, statusLabel(info.status),
        amount(info.totals.subtotal), amount(info.totals.discount), amount(info.totals.tax), amount(info.totals.total),
        amount(info.paid), amount(info.balance)];
    });
    downloadCsv('invoices', ['Number', 'Client', 'Issue date', 'Due date', 'Status', 'Subtotal', 'Discount', 'Tax', 'Total', 'Paid', 'Balance'], rows);
  }

  function quotes(list) {
    const today = dates.today();
    const rows = (list || store.state.quotes).map((doc) => {
      const t = calc.totals(doc);
      return [doc.number, store.clientName(doc.clientId), doc.issueDate, doc.dueDate, statusLabel(calc.quoteStatus(doc, today)), amount(t.subtotal), amount(t.discount), amount(t.tax), amount(t.total)];
    });
    downloadCsv('quotes', ['Number', 'Client', 'Issue date', 'Valid until', 'Status', 'Subtotal', 'Discount', 'Tax', 'Total'], rows);
  }

  function lineItems() {
    const rows = [];
    store.state.invoices.forEach((doc) => {
      const t = calc.totals(doc);
      doc.lines.forEach((line, i) => {
        rows.push([doc.number, store.clientName(doc.clientId), i + 1, line.description.replace(/\n/g, ' - '), money.qtyToText(line.qtyMilli), amount(line.unitCents), money.percentToText(line.taxBp), amount(t.nets[i])]);
      });
    });
    downloadCsv('line-items', ['Invoice', 'Client', 'Line', 'Description', 'Quantity', 'Unit price', 'Tax %', 'Net amount'], rows);
  }

  function payments() {
    const rows = [];
    store.state.invoices.forEach((doc) => {
      doc.payments.forEach((payment) => {
        rows.push([payment.date, doc.number, store.clientName(doc.clientId), amount(payment.amountCents), payment.method, payment.note]);
      });
    });
    rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    downloadCsv('payments', ['Date', 'Invoice', 'Client', 'Amount', 'Method', 'Note'], rows);
  }

  function clients() {
    downloadCsv('clients', ['Name', 'Contact', 'Email', 'Address', 'Tax ID', 'Payment days', 'Notes'],
      store.state.clients.map((c) => [c.name, c.contact, c.email, c.address, c.taxId, c.paymentDays, c.notes]));
  }

  function catalogue() {
    downloadCsv('catalogue', ['Name', 'Description', 'Unit price', 'Tax %'],
      store.state.items.map((i) => [i.name, i.description, amount(i.unitCents), money.percentToText(i.taxBp)]));
  }

  function statement(client, data) {
    const rows = [[data.fromLabel, '', 'Opening balance', '', '', amount(data.opening)]];
    data.rows.forEach((row) => rows.push([row.date, row.ref, row.description, row.charge ? amount(row.charge) : '', row.credit ? amount(row.credit) : '', amount(row.balance)]));
    const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    downloadCsv(`statement-${slug}`, ['Date', 'Reference', 'Description', 'Charges', 'Payments', 'Balance'], rows);
  }

  function backup() {
    const body = { app: 'billcraft', version: 1, exportedAt: new Date().toISOString(), data: store.state };
    download(`billcraft-backup-${stamp()}.json`, JSON.stringify(body, null, 2), 'application/json');
  }

  BC.exporter = { invoices, quotes, lineItems, payments, clients, catalogue, statement, backup };
})();

// One client: contact details, their documents and a printable statement for a chosen period.
(function () {
  const BC = window.BC;
  const { h } = BC.dom;
  const { calc, dates, exporter, store, ui, paper } = BC;
  const { money } = ui;
  const PERIODS = [
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: '180', label: 'Last 180 days' },
    { value: '365', label: 'Last 12 months' },
    { value: 'all', label: 'All activity' },
    { value: 'custom', label: 'Custom dates' },
  ];
  const memory = { period: '180', from: '', to: '' };

  function contactPanel(client, today) {
    const invoices = store.docsForClient('invoice', client.id);
    const aging = calc.agedReceivables(invoices, today);
    const unpaid = aging.reduce((sum, b) => sum + b.amount, 0);
    const overdue = unpaid - aging[0].amount;
    return h('section', { class: 'panel' },
      h('header', { class: 'panel-head' }, h('h2', {}, 'Account')),
      h('dl', { class: 'facts' },
        h('div', {}, h('dt', {}, 'Unpaid'), h('dd', { class: 'strong' }, money(unpaid))),
        h('div', {}, h('dt', {}, 'Overdue'), h('dd', { class: overdue ? 'text-danger strong' : '' }, money(overdue))),
        client.contact && h('div', {}, h('dt', {}, 'Contact'), h('dd', {}, client.contact)),
        client.email && h('div', {}, h('dt', {}, 'Email'), h('dd', { class: 'cell-long' }, h('a', { href: `mailto:${client.email}` }, client.email))),
        client.address && h('div', {}, h('dt', {}, 'Address'), h('dd', { class: 'pre' }, client.address)),
        client.taxId && h('div', {}, h('dt', {}, 'Tax ID'), h('dd', {}, client.taxId)),
        h('div', {}, h('dt', {}, 'Payment days'), h('dd', {}, String(client.paymentDays))),
        client.notes && h('div', {}, h('dt', {}, 'Notes'), h('dd', { class: 'pre' }, client.notes))));
  }

  function documentsPanel(client, today) {
    const invoices = store.docsForClient('invoice', client.id).slice().sort((a, b) => b.seq - a.seq);
    const quotes = store.docsForClient('quote', client.id).slice().sort((a, b) => b.seq - a.seq);
    const row = (doc, base, status, value) => h('li', {}, h('a', { href: `${base}/${doc.id}` },
      h('span', { class: 'strong' }, doc.number), ui.badge(status), h('span', { class: 'doc-value' }, money(value))));
    const rows = [
      ...invoices.map((doc) => { const info = calc.summarize(doc, today); return row(doc, '#/invoices', info.status, info.totals.total); }),
      ...quotes.map((doc) => row(doc, '#/quotes', calc.quoteStatus(doc, today), calc.totals(doc).total)),
    ];
    return h('section', { class: 'panel' },
      h('header', { class: 'panel-head' }, h('h2', {}, 'Documents')),
      rows.length ? h('ul', { class: 'doc-list' }, rows) : h('p', { class: 'muted panel-empty' }, 'Nothing created for this client yet.'));
  }

  function resolveRange(today) {
    if (memory.period === 'custom') return { from: memory.from, to: memory.to || today };
    if (memory.period === 'all') return { from: '', to: today };
    return { from: dates.addDays(today, -Number(memory.period)), to: today };
  }

  BC.views.clientDetail = function clientDetail(id) {
    const client = store.findClient(id);
    const back = { href: '#/clients', label: 'Clients' };
    if (!client) {
      return h('div', { class: 'page' }, ui.pageHeader('Not found', null, null, back),
        ui.emptyState('This client no longer exists', 'They may have been deleted.', ui.linkButton('Back to clients', null, '#/clients')));
    }
    const today = dates.today();
    const invoices = store.docsForClient('invoice', client.id);
    const rangeError = h('p', { class: 'field-error', hidden: true });
    const sheetFrame = paper.frame(h('div'));
    let current = null;

    const period = ui.field({ label: 'Statement period', as: 'select', value: memory.period, choices: PERIODS, onChange: () => { memory.period = period.value; syncRange(); } });
    const from = ui.field({ label: 'From', type: 'date', value: memory.from || dates.addDays(today, -180), onInput: () => { memory.from = from.value; draw(); } });
    const to = ui.field({ label: 'To', type: 'date', value: memory.to || today, onInput: () => { memory.to = to.value; draw(); } });
    const custom = h('div', { class: 'form-row-2' }, from.el, to.el);

    function syncRange() {
      custom.hidden = memory.period !== 'custom';
      if (memory.period === 'custom') { memory.from = from.value; memory.to = to.value; }
      draw();
    }

    function draw() {
      const range = resolveRange(today);
      const badRange = memory.period === 'custom' && (!dates.isValid(range.from) || !dates.isValid(range.to) || range.from > range.to);
      rangeError.hidden = !badRange;
      rangeError.textContent = badRange ? 'Choose a start date on or before the end date.' : '';
      if (badRange) return;
      const data = calc.statement(invoices, range.from, range.to);
      current = { ...data, fromLabel: range.from || '' };
      sheetFrame.update(paper.statementSheet(client, data, range, store.state.profile, calc.agedReceivables(invoices, today)));
    }

    syncRange();

    return h('div', { class: 'page' },
      h('div', { class: 'no-print' }, ui.pageHeader(client.name, null, [
        ui.linkButton('New invoice', 'plus', `#/invoices/new?client=${client.id}`, 'btn-primary'),
        ui.button('Edit', 'edit', () => BC.views.clientModal(client)),
        ui.button('Delete', 'trash', () => BC.views.deleteClient(client), 'btn-quiet-danger'),
      ], back)),
      h('div', { class: 'detail-grid' },
        h('div', { class: 'detail-doc' }, sheetFrame),
        h('aside', { class: 'detail-side no-print' },
          h('section', { class: 'panel' },
            h('header', { class: 'panel-head' }, h('h2', {}, 'Statement')),
            h('div', { class: 'panel-form' }, period.el, custom, rangeError),
            h('div', { class: 'summary-tools' },
              ui.button('Print or PDF', 'print', () => window.print()),
              ui.button('Export CSV', 'download', () => { exporter.statement(client, current); ui.toast('Statement exported to CSV.'); }))),
          contactPanel(client, today),
          documentsPanel(client, today))));
  };
})();

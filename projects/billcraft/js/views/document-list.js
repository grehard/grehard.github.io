// List of invoices or quotes with search, status filter and sorting.
(function () {
  const BC = window.BC;
  const { h } = BC.dom;
  const { calc, dates, store, ui, exporter } = BC;
  const { money } = ui;

  const CONFIG = {
    invoice: {
      title: 'Invoices', singular: 'invoice', base: '#/invoices', dueLabel: 'Due',
      filters: [['all', 'All'], ['open', 'Unpaid'], ['draft', 'Draft'], ['sent', 'Sent'], ['partial', 'Partially paid'], ['overdue', 'Overdue'], ['paid', 'Paid']],
    },
    quote: {
      title: 'Quotes', singular: 'quote', base: '#/quotes', dueLabel: 'Valid until',
      filters: [['all', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['expired', 'Expired'], ['converted', 'Converted']],
    },
  };

  const memory = {
    invoice: { search: '', status: 'all', sort: { key: 'seq', dir: -1 } },
    quote: { search: '', status: 'all', sort: { key: 'seq', dir: -1 } },
  };

  function describe(doc, kind, today) {
    if (kind === 'invoice') {
      const info = calc.summarize(doc, today);
      return { doc, status: info.status, total: info.totals.total, balance: info.balance, client: store.clientName(doc.clientId) };
    }
    return { doc, status: calc.quoteStatus(doc, today), total: calc.totals(doc).total, balance: 0, client: store.clientName(doc.clientId) };
  }

  function matchesFilter(row, status) {
    if (status === 'all') return true;
    if (status === 'open') return row.status !== 'draft' && row.balance > 0;
    return row.status === status;
  }

  function matchesSearch(row, query) {
    if (!query) return true;
    const haystack = [row.doc.number, row.client, row.doc.notes, ...row.doc.lines.map((l) => l.description)].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  const SORTERS = {
    seq: (r) => r.doc.seq,
    client: (r) => r.client.toLowerCase(),
    issue: (r) => r.doc.issueDate,
    due: (r) => r.doc.dueDate,
    total: (r) => r.total,
    balance: (r) => r.balance,
  };

  function sortRows(rows, sort) {
    const key = SORTERS[sort.key];
    return rows.slice().sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x === y) return b.doc.seq - a.doc.seq;
      return (x < y ? -1 : 1) * sort.dir;
    });
  }

  function table(kind, rows, view, redraw) {
    const cfg = CONFIG[kind];
    const header = (label, key, numeric) => ui.sortHeader(label, key, view.sort, redraw, numeric);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'table table-rows' },
      h('thead', {}, h('tr', {},
        header('Number', 'seq'), header('Client', 'client'), header('Issued', 'issue'), header(cfg.dueLabel, 'due'),
        h('th', { scope: 'col' }, 'Status'), header('Total', 'total', true),
        kind === 'invoice' && header('Balance', 'balance', true))),
      h('tbody', {}, rows.map((row) => h('tr', {
        onclick: (event) => { if (!event.target.closest('a')) location.hash = `${cfg.base}/${row.doc.id}`; },
      },
        h('td', { class: 'nowrap' }, h('a', { class: 'strong', href: `${cfg.base}/${row.doc.id}` }, row.doc.number)),
        h('td', { class: 'cell-long' }, row.client),
        h('td', { class: 'nowrap' }, dates.format(row.doc.issueDate)),
        h('td', { class: 'nowrap' }, dates.format(row.doc.dueDate)),
        h('td', {}, ui.badge(row.status)),
        h('td', { class: 'num' }, money(row.total)),
        kind === 'invoice' && h('td', { class: 'num strong' }, money(row.balance)))))));
  }

  BC.views.documentList = function documentList(kind, query) {
    const cfg = CONFIG[kind];
    const view = memory[kind];
    if (query.status && cfg.filters.some(([key]) => key === query.status)) view.status = query.status;
    const today = dates.today();
    const all = store.collection(kind).map((doc) => describe(doc, kind, today));
    const host = h('div', {});
    const filterHost = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' });
    let visible = [];

    function redraw() {
      const search = view.search.trim().toLowerCase();
      const searched = all.filter((row) => matchesSearch(row, search));
      filterHost.replaceChildren(...cfg.filters.map(([key, label]) => {
        const count = searched.filter((row) => matchesFilter(row, key)).length;
        return h('button', {
          class: `chip${view.status === key ? ' is-active' : ''}`,
          type: 'button',
          'aria-pressed': view.status === key ? 'true' : 'false',
          onclick: () => {
            view.status = key;
            redraw();
            filterHost.querySelector('[aria-pressed="true"]').focus();
          },
        }, label, h('span', { class: 'chip-count' }, String(count)));
      }));
      visible = sortRows(searched.filter((row) => matchesFilter(row, view.status)), view.sort);
      if (!all.length) {
        host.replaceChildren(ui.emptyState(`No ${cfg.title.toLowerCase()} yet`, `Create your first ${cfg.singular} to see it here.`, ui.linkButton(`New ${cfg.singular}`, 'plus', `${cfg.base}/new`, 'btn-primary')));
      } else if (!visible.length) {
        host.replaceChildren(ui.emptyState(`No ${cfg.title.toLowerCase()} match`, 'Try a different search or status.', ui.button('Clear filters', null, () => {
          view.search = '';
          view.status = 'all';
          BC.app.render();
        })));
      } else {
        host.replaceChildren(table(kind, visible, view, redraw));
      }
    }

    redraw();
    const exportCsv = () => {
      const docs = visible.map((row) => row.doc);
      if (kind === 'invoice') exporter.invoices(docs);
      else exporter.quotes(docs);
      ui.toast(`Exported ${docs.length} ${cfg.singular}${docs.length === 1 ? '' : 's'} to CSV.`);
    };
    return h('div', { class: 'page' },
      ui.pageHeader(cfg.title, null, [
        ui.button('Export CSV', 'download', exportCsv),
        ui.linkButton(`New ${cfg.singular}`, 'plus', `${cfg.base}/new`, 'btn-primary'),
      ]),
      h('div', { class: 'toolbar' },
        ui.searchBox(`Search ${cfg.title.toLowerCase()}`, view.search, (value) => { view.search = value; redraw(); }),
        filterHost),
      host);
  };
})();
